import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { PhaseItem, RegistryManifest } from '../phase/phase-manifest.js';
import { PhaseTransitionService } from '../phase/phase-transition-service.js';

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function sanitizeTerminalInput(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][0-9;].*?(?:\x07|\x1b\\)/g, '').replace(/[\x00-\x1f\x7f]/g, '');
}

export function isPathInside(parent: string, target: string): boolean {
  const rel = path.relative(parent, target);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export interface Orchestrator {
  run(args: string[]): Promise<any>;
}

export interface PhaseCliOptions {
  projectRoot?: string;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
  promptFn?: (opts: unknown) => Promise<Record<string, unknown>>;
}

export interface CliEnvironment {
  isTTY: boolean;
  isHeadless: boolean;
  isCI: boolean;
}

export interface CliOptionDefinition {
  flag: string;
  description: string;
}

export interface CliCommandContext {
  cwd: string;
  env: CliEnvironment;
  stdout: (msg: string) => void;
  stderr: (msg: string) => void;
  dispatcher: SuperconductorCliDispatcher;
  rawArgs: string[];
}

export interface CliCommandDefinition {
  name?: string;
  description: string;
  usage?: string;
  aliases?: string[];
  options?: CliOptionDefinition[];
  handlesHelp?: boolean;
  execute: (args: string[], ctx: CliCommandContext) => Promise<any> | any;
}

export interface SuperconductorCliDispatcherOptions {
  cwd?: string;
  isTTY?: boolean;
  isCI?: boolean;
  isHeadless?: boolean;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
  catchErrors?: boolean;
  exitOnError?: boolean;
  interactiveOrchestrator?: Orchestrator;
  headlessOrchestrator?: Orchestrator;
}

/**
 * Resolves a target phase from manifest using:
 * 1. Exact or case-insensitive match on phaseId
 * 2. Dynamic runtime ordinal or static ordinal (e.g. "1", "2", "Phase 1")
 * 3. Case-insensitive match on phase name
 */
export function resolveTargetPhase(manifest: RegistryManifest, target: string): PhaseItem | undefined {
  if (!target || !manifest || !Array.isArray(manifest.phases)) {
    return undefined;
  }

  const trimmed = target.trim();

  // 1. Exact match with phaseId (case-sensitive, then case-insensitive)
  const exactId = manifest.phases.find((p) => p.phaseId === trimmed);
  if (exactId) return exactId;

  const lowerId = manifest.phases.find((p) => p.phaseId.toLowerCase() === trimmed.toLowerCase());
  if (lowerId) return lowerId;

  // 2. Numeric ordinal match (e.g. "1", "2", "Phase 1", "phase 2", "Phase-2")
  const ordinalMatch = trimmed.match(/^(?:phase[\s-_]*)?(\d+)$/i);
  if (ordinalMatch) {
    const num = parseInt(ordinalMatch[1], 10);
    // Dynamic runtime ordinal match
    const byDisplayOrdinal = manifest.phases.find(
      (p) => PhaseTransitionService.getDisplayOrdinal(p.phaseId, manifest) === num
    );
    if (byDisplayOrdinal) return byDisplayOrdinal;

    // Static ordinal match fallback
    const byStaticOrdinal = manifest.phases.find((p) => p.ordinal === num);
    if (byStaticOrdinal) return byStaticOrdinal;
  }

  // 3. Name match (case-insensitive)
  const byName = manifest.phases.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (byName) return byName;

  return undefined;
}

export class SuperconductorCliDispatcher {
  private commands: Map<string, CliCommandDefinition> = new Map();
  private aliasMap: Map<string, string> = new Map();
  private options: SuperconductorCliDispatcherOptions;
  public readonly stdout: (msg: string) => void;
  public readonly stderr: (msg: string) => void;

  public static resolveTargetPhase = resolveTargetPhase;

  constructor(options: SuperconductorCliDispatcherOptions = {}) {
    this.options = options;
    this.stdout = options.stdout ?? ((msg: string) => console.log(msg));
    this.stderr = options.stderr ?? ((msg: string) => console.error(msg));

    this.registerBuiltinCommands();
  }

  public registerCommand(name: string, definition: CliCommandDefinition): void {
    const canonicalName = name.toLowerCase().trim();
    const def: CliCommandDefinition = {
      ...definition,
      name: canonicalName,
    };
    this.commands.set(canonicalName, def);

    if (def.aliases && Array.isArray(def.aliases)) {
      for (const alias of def.aliases) {
        this.aliasMap.set(alias.toLowerCase().trim(), canonicalName);
      }
    }
  }

  public getCommand(name: string): CliCommandDefinition | undefined {
    const canonical = name.toLowerCase().trim();
    if (this.commands.has(canonical)) {
      return this.commands.get(canonical);
    }
    const resolved = this.aliasMap.get(canonical);
    if (resolved && this.commands.has(resolved)) {
      return this.commands.get(resolved);
    }
    return undefined;
  }

  public hasCommand(name: string): boolean {
    return this.getCommand(name) !== undefined;
  }

  public listCommands(): Array<{ name: string; definition: CliCommandDefinition }> {
    const seen = new Set<CliCommandDefinition>();
    const list: Array<{ name: string; definition: CliCommandDefinition }> = [];

    for (const [name, def] of this.commands.entries()) {
      if (!seen.has(def)) {
        seen.add(def);
        list.push({ name, definition: def });
      }
    }
    return list;
  }

  public detectEnvironment(args: string[] = []): CliEnvironment {
    const isTTY = this.options.isTTY ?? Boolean(process.stdout && process.stdout.isTTY);
    const isCI =
      this.options.isCI ??
      Boolean(
        (process.env.CI && process.env.CI !== 'false' && process.env.CI !== '0') ||
          process.env.CONTINUOUS_INTEGRATION ||
          process.env.BUILD_NUMBER ||
          process.env.GITHUB_ACTIONS ||
          process.env.GITLAB_CI
      );

    const hasHeadlessFlag = args.includes('--headless');
    const hasInteractiveFlag = args.includes('--interactive');

    if (hasHeadlessFlag && hasInteractiveFlag) {
      throw new CliError('Cannot specify both --headless and --interactive flags simultaneously.', 1);
    }

    let isHeadless: boolean;
    if (this.options.isHeadless !== undefined) {
      isHeadless = this.options.isHeadless;
    } else if (hasHeadlessFlag) {
      isHeadless = true;
    } else if (hasInteractiveFlag) {
      isHeadless = false;
    } else if (isCI) {
      isHeadless = true;
    } else {
      isHeadless = !isTTY;
    }

    return { isTTY, isHeadless, isCI };
  }

  public formatHelp(): string {
    const lines: string[] = [];
    lines.push('Superconductor Universal CLI');
    lines.push('');
    lines.push('Usage:');
    lines.push('  superconductor <command> [options]');
    lines.push('');
    lines.push('Commands:');

    const registered = this.listCommands();
    for (const { name, definition } of registered) {
      const aliasStr =
        definition.aliases && definition.aliases.length > 0
          ? `, ${definition.aliases.join(', ')}`
          : '';
      const cmdCol = `  ${name}${aliasStr}`.padEnd(30);
      lines.push(`${cmdCol}${definition.description}`);
    }

    lines.push('');
    lines.push('Global Options:');
    lines.push('  --help, -h                    Show help for command or dispatcher');
    lines.push('  --headless                    Run in non-interactive headless mode');
    lines.push('  --interactive                 Run in interactive mode');
    lines.push('  --project-root <path>         Specify project root directory');
    lines.push('');

    return lines.join('\n');
  }

  public formatCommandHelp(name: string): string {
    const sanitizedName = sanitizeTerminalInput(name);
    const cmd = this.getCommand(sanitizedName);
    if (!cmd) {
      return `Command "${sanitizedName}" not found. Run "superconductor --help" for available commands.`;
    }

    const lines: string[] = [];
    lines.push(`Command: superconductor ${cmd.name}`);
    lines.push(cmd.description);
    lines.push('');
    lines.push('Usage:');
    lines.push(`  superconductor ${cmd.usage || cmd.name}`);

    if (cmd.aliases && cmd.aliases.length > 0) {
      lines.push('');
      lines.push(`Aliases: ${cmd.aliases.join(', ')}`);
    }

    if (cmd.options && cmd.options.length > 0) {
      lines.push('');
      lines.push('Options:');
      for (const opt of cmd.options) {
        lines.push(`  ${opt.flag.padEnd(28)} ${opt.description}`);
      }
    }
    lines.push('');

    return lines.join('\n');
  }

  public async runOrchestrator(args: string[] = process.argv.slice(2)): Promise<any> {
    const env = this.detectEnvironment(args);

    if (env.isHeadless) {
      const orchestrator =
        this.options.headlessOrchestrator ??
        (await import('./headless.js')).HeadlessOrchestrator;
      return await orchestrator.run(args);
    } else {
      const orchestrator =
        this.options.interactiveOrchestrator ??
        (await import('./interactive.js')).InteractiveOrchestrator;
      return await orchestrator.run(args);
    }
  }

  public static async runOrchestrator(
    args: string[] = process.argv.slice(2),
    options: SuperconductorCliDispatcherOptions = {}
  ): Promise<any> {
    const dispatcher = new SuperconductorCliDispatcher(options);
    return dispatcher.runOrchestrator(args);
  }

  /**
   * Native execution of Phase subcommands: list, status, switch, advance.
   */
  public async executePhase(
    args: string[] = [],
    options?: PhaseCliOptions
  ): Promise<number> {
    const out = options?.stdout ?? this.stdout;
    const err = options?.stderr ?? this.stderr;

    let projectRoot = options?.projectRoot ?? (this.options.cwd ?? process.cwd());
    const cleanArgs: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--project-root') {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          projectRoot = path.resolve(args[++i]);
        }
      } else if (arg.startsWith('--project-root=')) {
        projectRoot = path.resolve(arg.slice('--project-root='.length));
      } else {
        cleanArgs.push(arg);
      }
    }

    // If invoked with a redundant leading 'phase', strip it
    if (cleanArgs[0] === 'phase') {
      cleanArgs.shift();
    }

    const subcommand = cleanArgs[0];

    switch (subcommand) {
      case 'list': {
        const { PhaseStateStore } = await import('../phase/phase-state-store.js');
        const { PhaseTransitionService: PTS } = await import('../phase/phase-transition-service.js');
        const manifest = await PhaseStateStore.load(projectRoot);
        if (!manifest.phases || manifest.phases.length === 0) {
          out('No phases found.');
          return 0;
        }

        for (const phase of manifest.phases) {
          const pct = PTS.getPhaseCompletionPercentage(phase);
          const completedCount = phase.tracks.filter((t) => t.status === 'completed').length;
          const totalCount = phase.tracks.length;
          const ordinal = PTS.getDisplayOrdinal(phase.phaseId, manifest);

          let ordinalLabel: string;
          if (phase.status === 'active') {
            ordinalLabel = `Phase ${ordinal ?? 1} (Active)`;
          } else if (phase.status === 'planned') {
            ordinalLabel = ordinal !== undefined ? `Phase ${ordinal} (Pending)` : 'Phase (Pending)';
          } else if (phase.status === 'completed') {
            ordinalLabel = 'Phase (Completed)';
          } else {
            const capitalized = phase.status.charAt(0).toUpperCase() + phase.status.slice(1);
            ordinalLabel = ordinal !== undefined ? `Phase ${ordinal} (${capitalized})` : `Phase (${capitalized})`;
          }

          out(`${ordinalLabel}: ${phase.name} (${phase.phaseId}) [${completedCount}/${totalCount} tracks, ${pct}%]`);
        }
        return 0;
      }

      case 'status': {
        const { PhaseStateStore } = await import('../phase/phase-state-store.js');
        const { PhaseTransitionService: PTS } = await import('../phase/phase-transition-service.js');
        const manifest = await PhaseStateStore.load(projectRoot);
        const activePhase = PTS.getActivePhase(manifest);
        if (!activePhase) {
          err('[WARN] No active phase found.');
          return 1;
        }

        const pct = PTS.getPhaseCompletionPercentage(activePhase);
        const completedCount = activePhase.tracks.filter((t) => t.status === 'completed').length;
        const totalCount = activePhase.tracks.length;

        out(`[PHASE] Active: Phase 1: ${activePhase.name} (${activePhase.phaseId}) [${completedCount}/${totalCount} tracks, ${pct}%]`);
        return 0;
      }

      case 'switch': {
        const { PhaseStateStore } = await import('../phase/phase-state-store.js');
        const { PhaseTransitionService: PTS } = await import('../phase/phase-transition-service.js');
        let targetArg = cleanArgs[1];

        if (!targetArg) {
          const promptFn = options?.promptFn ?? (process.stdin.isTTY ? (await import('prompts')).default : undefined);
          if (promptFn) {
            const manifest = await PhaseStateStore.load(projectRoot);
            const availablePhases = manifest.phases.filter((p) => p.status !== 'completed');
            if (availablePhases.length === 0) {
              err('[FAIL] No eligible phases to switch to.');
              return 1;
            }
            const response = await (promptFn as any)({
              type: 'select',
              name: 'phaseId',
              message: 'Select phase to activate:',
              choices: availablePhases.map((p) => {
                const ord = PTS.getDisplayOrdinal(p.phaseId, manifest);
                const prefix = ord ? `Phase ${ord}: ` : '';
                return {
                  title: `${prefix}${p.name} (${p.phaseId}) [${p.status}]`,
                  value: p.phaseId,
                };
              }),
            });
            if (!response || typeof response !== 'object' || !response.phaseId) {
              err('[FAIL] Phase selection cancelled.');
              return 1;
            }
            targetArg = String(response.phaseId);
          } else {
            err('[FAIL] Missing target phase identifier. Usage: switch <phase_id_or_ordinal>');
            return 1;
          }
        }

        try {
          let switchedName = '';
          let switchedId = '';

          await PhaseStateStore.mutate(projectRoot, (manifest) => {
            const targetPhase = resolveTargetPhase(manifest, targetArg);
            if (!targetPhase) {
              throw new Error(`Phase '${targetArg}' not found in manifest. Run 'superconductor phase list' to inspect available phases.`);
            }
            if (targetPhase.status === 'completed') {
              throw new Error(`Cannot switch to phase '${targetPhase.phaseId}' because it is already completed`);
            }

            switchedName = targetPhase.name;
            switchedId = targetPhase.phaseId;

            return PTS.switchActivePhase(manifest, targetPhase.phaseId);
          });

          out(`[OK] Switched active phase to Phase 1: ${switchedName} (${switchedId})`);
          return 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          err(`[FAIL] ${message}`);
          return 1;
        }
      }

      case 'advance': {
        const { PhaseStateStore } = await import('../phase/phase-state-store.js');
        const { PhaseTransitionService: PTS } = await import('../phase/phase-transition-service.js');
        try {
          const result = await PhaseStateStore.mutate(projectRoot, (manifest) => {
            return PTS.advanceWindow(manifest);
          });

          if (result && result.advanced) {
            const completedName = result.completedPhase?.name ?? 'Previous Phase';
            const newActiveName = result.nextActivePhase?.name;
            if (newActiveName) {
              out(`[OK] Sliding window advanced: ${completedName} marked complete. Phase 2: ${newActiveName} is now Phase 1 (Active).`);
            } else {
              out(`[OK] Sliding window advanced: ${completedName} marked complete. All phases completed.`);
            }
            return 0;
          } else {
            err(`[WARN] Cannot advance window: Phase 1 still has pending/in-progress tracks.`);
            return 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          err(`[FAIL] ${message}`);
          return 1;
        }
      }

      case 'help':
      case '--help':
      case '-h':
      case undefined: {
        out(`Superconductor Phase Management CLI

Usage:
  superconductor phase [list|status|switch|advance] [options]

Subcommands:
  list                             List all phases with status, track counts, and dynamic ordinals
  status                           Show concise glancable status of the currently active phase
  switch <phase_id_or_ordinal>     Switch the active phase
  advance                          Advance the sliding window when Phase 1 is 100% complete

Options:
  --project-root <path>            Project root directory
`);
        return 0;
      }

      default: {
        err(`[FAIL] Unknown command: ${subcommand}`);
        err(`Usage: superconductor phase [list|status|switch|advance] [options]`);
        return 1;
      }
    }
  }

  public static async runPhaseCli(
    args: string[] = [],
    options?: PhaseCliOptions
  ): Promise<number> {
    const dispatcher = new SuperconductorCliDispatcher({
      cwd: options?.projectRoot,
      stdout: options?.stdout,
      stderr: options?.stderr,
    });
    return dispatcher.executePhase(args, options);
  }

  public async dispatch(args: string[] = []): Promise<any> {
    try {
      return await this.executeDispatch(args);
    } catch (err: any) {
      const cliError =
        err instanceof CliError ? err : new CliError(err?.message || String(err), 1);
      this.stderr(cliError.message);
      if (this.options.exitOnError) {
        process.exit(cliError.exitCode);
      }
      if (this.options.catchErrors) {
        return { success: false, error: cliError, exitCode: cliError.exitCode };
      }
      throw cliError;
    }
  }

  private async executeDispatch(args: string[]): Promise<any> {
    const hasHeadlessFlag = args.includes('--headless');
    const hasInteractiveFlag = args.includes('--interactive');
    if (hasHeadlessFlag && hasInteractiveFlag) {
      throw new CliError('Cannot specify both --headless and --interactive flags simultaneously.', 1);
    }

    let projectRoot = this.options.cwd ?? process.cwd();
    const remainingArgs: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--project-root') {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          projectRoot = path.resolve(args[++i]);
        }
      } else if (arg.startsWith('--project-root=')) {
        projectRoot = path.resolve(arg.slice('--project-root='.length));
      } else if (arg === '--headless' || arg === '--interactive') {
        continue;
      } else {
        remainingArgs.push(arg);
      }
    }

    if (remainingArgs.length === 0) {
      const cmd = this.getCommand('context');
      if (!cmd) {
        throw new CliError('No default command registered.', 1);
      }
      const env = this.detectEnvironment(args);
      const ctx: CliCommandContext = {
        cwd: projectRoot,
        env,
        stdout: this.stdout,
        stderr: this.stderr,
        dispatcher: this,
        rawArgs: args,
      };
      return await cmd.execute([], ctx);
    }

    if (remainingArgs[0] === '--help' || remainingArgs[0] === '-h') {
      const help = this.formatHelp();
      this.stdout(help);
      return help;
    }

    if (remainingArgs[0] === 'help') {
      const targetCmd = remainingArgs[1];
      if (targetCmd) {
        const cmdHelp = this.formatCommandHelp(targetCmd);
        this.stdout(cmdHelp);
        return cmdHelp;
      } else {
        const help = this.formatHelp();
        this.stdout(help);
        return help;
      }
    }

    const firstNonFlagIdx = remainingArgs.findIndex((arg) => !arg.startsWith('-'));
    let commandName = 'context';
    let commandArgs: string[] = [];

    if (firstNonFlagIdx !== -1) {
      commandName = remainingArgs[firstNonFlagIdx];
      commandArgs = [
        ...remainingArgs.slice(0, firstNonFlagIdx),
        ...remainingArgs.slice(firstNonFlagIdx + 1),
      ];
    } else {
      commandName = 'context';
      commandArgs = remainingArgs;
    }

    const sanitizedName = sanitizeTerminalInput(commandName);
    const commandDef = this.getCommand(sanitizedName);
    if (!commandDef) {
      this.stdout(this.formatHelp());
      throw new CliError(
        `Unknown command: "${sanitizedName}". Run "superconductor --help" for available commands.`,
        1
      );
    }

    if (!commandDef.handlesHelp && (commandArgs.includes('--help') || commandArgs.includes('-h'))) {
      const cmdHelp = this.formatCommandHelp(sanitizedName);
      this.stdout(cmdHelp);
      return cmdHelp;
    }

    const env = this.detectEnvironment(args);

    const ctx: CliCommandContext = {
      cwd: projectRoot,
      env,
      stdout: this.stdout,
      stderr: this.stderr,
      dispatcher: this,
      rawArgs: args,
    };

    return await commandDef.execute(commandArgs, ctx);
  }

  private registerBuiltinCommands(): void {
    // 1. context
    this.registerCommand('context', {
      description: 'Display Superconductor core context information',
      usage: 'context [--json]',
      options: [{ flag: '--json', description: 'Output context as JSON' }],
      execute: async (subArgs, ctx) => {
        const isJson = subArgs.includes('--json');
        const { getAgentContext } = await import('../protocol/agent-context.js');
        const agentCtx = getAgentContext(ctx.cwd);
        if (isJson) {
          ctx.stdout(JSON.stringify(agentCtx, null, 2));
        } else {
          ctx.stdout(`✅ Superconductor Core Context v${agentCtx.schemaVersion}`);
          ctx.stdout(`   Project Root: ${agentCtx.projectRoot}`);
          ctx.stdout(`   Tool Registry: ${agentCtx.toolRegistryStatus}`);
          ctx.stdout(`   Active Track: ${agentCtx.activeTrackId || 'none'}`);
          ctx.stdout(`   Total Tracks: ${agentCtx.tracks.length}`);
        }
        return agentCtx;
      },
    });

    // 2. status (and track status)
    this.registerCommand('status', {
      aliases: ['track'],
      description: 'Display track or project completion status',
      usage: 'status [<track_id>] or track status [<track_id>]',
      execute: async (subArgs, ctx) => {
        const cleanArgs = subArgs[0] === 'status' ? subArgs.slice(1) : subArgs;
        const trackId = cleanArgs[0];
        const { readTrackRegistry, getCompletionStats } = await import('../track/index.js');
        if (trackId) {
          const stats = getCompletionStats(ctx.cwd, trackId);
          ctx.stdout(JSON.stringify(stats, null, 2));
          return stats;
        } else {
          const tracks = readTrackRegistry(ctx.cwd);
          ctx.stdout(JSON.stringify(tracks, null, 2));
          return tracks;
        }
      },
    });

    // 3 & 4. implement & orchestrate
    const implementHandler = async (subArgs: string[], ctx: CliCommandContext) => {
      const { ExecutionPlanner } = await import('../track/execution-planner.js');
      const { Engine } = await import('@superconductor/engine');
      const { readPlan } = await import('../track/index.js');

      let projectRoot = ctx.cwd;
      const filteredSubArgs: string[] = [];
      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === '--project-root') {
          if (i + 1 < subArgs.length && !subArgs[i + 1].startsWith('-')) {
            projectRoot = path.resolve(ctx.cwd, subArgs[++i]);
          }
        } else if (subArgs[i].startsWith('--project-root=')) {
          projectRoot = path.resolve(ctx.cwd, subArgs[i].slice('--project-root='.length));
        } else {
          filteredSubArgs.push(subArgs[i]);
        }
      }

      const orchestratorArgs = [...filteredSubArgs];
      if (ctx.env.isHeadless && !orchestratorArgs.includes('--headless') && !orchestratorArgs.includes('--interactive')) {
        orchestratorArgs.push('--headless');
      } else if (!ctx.env.isHeadless && !orchestratorArgs.includes('--interactive') && !orchestratorArgs.includes('--headless')) {
        orchestratorArgs.push('--interactive');
      }

      const result = await this.runOrchestrator(orchestratorArgs);
      if (result && !result.cancelled) {
        const trackIds = result.sortedTrackIds || result.trackIds || [];
        if (trackIds.length > 0) {
          const planData = await Promise.all(
            trackIds.map((id: string) => ExecutionPlanner.loadTrackData(projectRoot, id))
          );
          const planned = ExecutionPlanner.plan(planData);

          const nodes: Record<string, any> = {};
          const edges: { from: string; to: string }[] = [];

          ctx.stdout(`\n🚀 Orchestrating ${planned.length} tracks via Engine...`);

          planned.forEach((p) => {
            const plan = readPlan(projectRoot, p.trackId);
            let lastTaskId: string | null = null;

            plan.forEach((task: any, i: number) => {
              const id = `${p.trackId}_task_${i}`;
              nodes[id] = {
                id,
                role: task.agent || 'processor',
                tier: task.tier ? parseInt(task.tier.replace(/[^0-9]/g, ''), 10) : 3,
                status: 'pending',
                prompt: task.title,
                contextFiles: [],
                dependsOn: [],
              };

              if (lastTaskId) {
                edges.push({ from: lastTaskId, to: id });
              }
              lastTaskId = id;
            });

            p.dependencies.forEach((dep) => {
              const planDep = readPlan(projectRoot, dep);
              if (planDep.length > 0 && plan.length > 0) {
                const fromId = `${dep}_task_${planDep.length - 1}`;
                const toId = `${p.trackId}_task_0`;
                edges.push({ from: fromId, to: toId });
              }
            });
          });

          const { TrackSplicer } = await import('../context/splicer.js');
          const splicer = new TrackSplicer(projectRoot);
          const payload = splicer.spliceTracks(planned.map((p) => p.trackId));

          const engine = new Engine({ nodes, edges }, { commonContext: payload });
          await engine.execute();
          return { result, planned, executed: true };
        }
      }
      return result;
    };

    this.registerCommand('implement', {
      description: 'Implement tasks using ExecutionPlanner and Engine',
      usage: 'implement [--headless|--interactive] [track_ids...]',
      execute: implementHandler,
    });

    this.registerCommand('orchestrate', {
      description: 'Orchestrate planned tracks using Engine',
      usage: 'orchestrate [--headless|--interactive] [track_ids...]',
      execute: implementHandler,
    });

    // 5. review
    this.registerCommand('review', {
      description: 'Run deterministic preflight review',
      usage: 'review [--staged|--branch <b>|--pr <url>]',
      options: [
        { flag: '--staged', description: 'Review staged git changes' },
        { flag: '--branch <name>', description: 'Review changes on specified branch' },
        { flag: '--pr <url>', description: 'Review PR changes from URL' },
      ],
      execute: async (subArgs, ctx) => {
        const { resolveReviewInput } = await import('../review/input-resolution.js');
        const { runDeterministicPreflight } = await import('../review/deterministic-preflight.js');
        const input = resolveReviewInput(subArgs, true);
        const preflight = runDeterministicPreflight(ctx.cwd);
        const output = { input, preflight };
        ctx.stdout(JSON.stringify(output, null, 2));
        return output;
      },
    });

    // 6. merge-track
    this.registerCommand('merge-track', {
      aliases: ['merge'],
      description: 'Merge a verified track branch with reviewer trailers',
      usage: 'merge-track <branch> <reviewerId1> [reviewerId2...] [--target=<branch>]',
      options: [{ flag: '--target=<branch>', description: 'Target branch to merge into' }],
      execute: async (subArgs, ctx) => {
        let targetBranch: string | undefined;
        const positionalArgs: string[] = [];

        for (let i = 0; i < subArgs.length; i++) {
          const arg = subArgs[i];
          if (arg.startsWith('--target=')) {
            targetBranch = arg.slice('--target='.length);
          } else if (arg === '--target' && i + 1 < subArgs.length) {
            targetBranch = subArgs[++i];
          } else {
            positionalArgs.push(arg);
          }
        }

        const [trackBranch, ...reviewerIds] = positionalArgs;
        if (!trackBranch || reviewerIds.length === 0) {
          throw new CliError('Usage: merge-track <branch> <reviewerId1> [reviewerId2...] [--target=<branch>]', 1);
        }

        const { mergeTrack } = await import('./merge-track.js');
        const result = await mergeTrack(trackBranch, reviewerIds, {
          targetBranch,
          workspaceRoot: ctx.cwd,
        });
        ctx.stdout(`Merged into ${result.targetBranch}: ${result.mergeCommitSha}`);
        ctx.stdout(result.trailer);
        return result;
      },
    });

    // 7. learn
    this.registerCommand('learn', {
      description: 'Discover, inspect, promote, discard, or harvest learned skills',
      usage: 'learn [--list|--inspect <skill>|--promote <skill>|--discard <skill>|--harvest]',
      handlesHelp: true,
      options: [
        { flag: '--list', description: 'List candidate skills' },
        { flag: '--inspect <skill>', description: 'Inspect candidate skill details' },
        { flag: '--promote <skill>', description: 'Promote skill to permanent' },
        { flag: '--discard <skill>', description: 'Discard candidate skill' },
        { flag: '--harvest', description: 'Harvest candidate skills from completed tracks' },
      ],
      execute: async (subArgs) => {
        const { learnCommand } = await import('./learn.js');
        const exitCode = await learnCommand(subArgs);
        if (exitCode !== 0) {
          throw new CliError(`Learn command failed with exit code ${exitCode}`, exitCode);
        }
        return exitCode;
      },
    });

    // 8. phase
    this.registerCommand('phase', {
      description: 'Manage project phases: list, status, switch, advance',
      usage: 'phase [list|status|switch|advance] [options]',
      options: [
        { flag: 'list', description: 'List all phases and progress' },
        { flag: 'status', description: 'Show status of active phase' },
        { flag: 'switch <target>', description: 'Switch active phase' },
        { flag: 'advance', description: 'Advance phase window' },
      ],
      execute: async (subArgs, ctx) => {
        const exitCode = await this.executePhase(subArgs, {
          projectRoot: ctx.cwd,
          stdout: ctx.stdout,
          stderr: ctx.stderr,
        });
        if (exitCode !== 0) {
          throw new CliError(`Phase command failed with exit code ${exitCode}`, exitCode);
        }
        return exitCode;
      },
    });

    // 9. swarm-execute
    this.registerCommand('swarm-execute', {
      description: 'Execute a track via Swarm Orchestrator CLI',
      usage: 'swarm-execute <track-id> [--no-preflight] [--preflight-timeout <ms>]',
      execute: async (subArgs, ctx) => {
        const { SwarmOrchestratorCLI } = await import('@superconductor/engine');
        const trackId = subArgs[0];
        if (!trackId) {
          throw new CliError('Missing track-id. Usage: superconductor swarm-execute <track-id>', 1);
        }

        const noPreflight = subArgs.includes('--no-preflight');
        let preflightTimeoutMs: number | undefined;
        const timeoutIndex = subArgs.indexOf('--preflight-timeout');
        if (timeoutIndex !== -1 && timeoutIndex + 1 < subArgs.length) {
          const val = parseInt(subArgs[timeoutIndex + 1], 10);
          if (isNaN(val) || val <= 0) {
            throw new CliError('--preflight-timeout must be a positive integer', 1);
          }
          preflightTimeoutMs = val;
        }

        const cli = new SwarmOrchestratorCLI();
        try {
          const res = await cli.executeTrack(ctx.cwd, trackId, {
            noPreflight,
            preflightTimeoutMs,
          });
          const succeeded = res.workUnits.filter((wu: any) => wu.state === 'DONE').length;
          ctx.stdout(`🚀 Swarm execute complete. ${succeeded}/${res.workUnits.length} tasks succeeded`);
          return res;
        } catch (err) {
          throw new CliError(`Swarm execute failed: ${err instanceof Error ? err.message : String(err)}`, 1);
        }
      },
    });

    // 10. yolo
    this.registerCommand('yolo', {
      description: 'Activate persistent YOLO mode across sessions',
      usage: 'yolo --persist',
      execute: async (subArgs, ctx) => {
        const isPersist = subArgs.includes('--persist');
        const { TrackStateManager } = await import('../permissions/track-state.js');
        const stateManager = new TrackStateManager(ctx.cwd);
        if (isPersist) {
          const readline = await import('node:readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const answer = await new Promise<string>((resolve) => {
            rl.question(
              '⚠️ YOLO mode --persist will grant unrestricted access across sessions. Are you absolutely sure? (Type "YOLO" to confirm): ',
              resolve
            );
          });
          rl.close();
          if (answer.trim() === 'YOLO') {
            stateManager.setYolo(true);
            ctx.stdout('✅ YOLO mode activated and persisted to session flags.');
            return true;
          } else {
            ctx.stdout('❌ YOLO persistence aborted.');
            throw new CliError('❌ YOLO persistence aborted.', 1);
          }
        } else {
          throw new CliError(
            '❌ YOLO mode requires --persist to be activated via CLI, otherwise it has no effect on subsequent agent commands.',
            1
          );
        }
      },
    });

    // 11. setup
    this.registerCommand('setup', {
      description: 'Verify local Superconductor machine setup',
      usage: 'setup [--reset-registry]',
      execute: async (_subArgs, ctx) => {
        const rawHome = process.env.SUPERCONDUCTOR_HOME || path.join(os.homedir(), '.superconductor');
        const homeDir = path.resolve(rawHome);
        const registryPath = path.join(homeDir, 'tool-registry.json');
        if (fs.existsSync(registryPath)) {
          ctx.stdout('✅ Superconductor machine setup verified');
          return true;
        } else {
          ctx.stdout('⚠️ Machine setup not initialized');
          return false;
        }
      },
    });

    // 12. intelligence
    this.registerCommand('intelligence', {
      description: 'Run workspace intelligence sync pipeline',
      usage: 'intelligence [--refresh|--force|--brownfield|--target <path>]',
      execute: async (subArgs, ctx) => {
        const m = await import('../intelligence/index.js');
        const isRefresh = subArgs.includes('--refresh');
        const isForce = subArgs.includes('--force');
        if (isRefresh || isForce) {
          const res = await m.IntelligenceAutoSyncEngine.ensureFresh({
            projectRoot: ctx.cwd,
            force: isForce,
          });
          ctx.stdout(
            `✅ Intelligence sync complete: action=${res.action}, status=${res.status}, commitsBehind=${res.commitsBehind}`
          );
          return res;
        } else {
          return await m.runPipeline(subArgs, ctx.cwd, path.join(ctx.cwd, 'superconductor'));
        }
      },
    });

    // 13. infer-permissions
    this.registerCommand('infer-permissions', {
      description: 'Infer permissions manifest from track spec',
      usage: 'infer-permissions <spec.md path> <out manifest.toml path>',
      execute: async (subArgs, ctx) => {
        const { KeywordPermissionInferrer } = await import('../permissions/keyword-inferrer.js');
        const specPath = subArgs[0];
        const outPath = subArgs[1];
        if (!specPath || !outPath) {
          throw new CliError('Usage: superconductor infer-permissions <spec.md path> <out manifest.toml path>', 1);
        }
        const resolvedSpec = path.resolve(ctx.cwd, specPath);
        const resolvedOut = path.resolve(ctx.cwd, outPath);
        const resolvedCwd = path.resolve(ctx.cwd);

        if (!isPathInside(resolvedCwd, resolvedSpec)) {
          throw new CliError('Spec path escapes workspace boundary', 1);
        }

        if (!isPathInside(resolvedCwd, resolvedOut)) {
          throw new CliError('Target path escapes workspace boundary', 1);
        }

        const specText = fs.readFileSync(resolvedSpec, 'utf8');
        const capabilities = KeywordPermissionInferrer.inferCapabilities(specText);
        const toml = [
          '[meta]',
          `track_id = "${path.basename(path.dirname(resolvedOut))}"`,
          `generated_at = "${new Date().toISOString()}"`,
          `inferred_by = "auto"`,
          '',
          '[capabilities]',
          `usb_access = ${capabilities.usb_access}`,
          `arbitrary_shell = ${capabilities.arbitrary_shell}`,
          `network_unrestricted = ${capabilities.network_unrestricted}`,
          `fs_outside_root = ${capabilities.fs_outside_root}`,
          `persistent = false`,
          '',
          '[allowlist]',
          'shell_prefixes = []',
          'domains = []',
          'paths = []',
        ].join('\n');
        fs.writeFileSync(resolvedOut, toml, 'utf8');
        ctx.stdout(`✅ Inferred permissions written to ${resolvedOut}`);
        return { specPath: resolvedSpec, outPath: resolvedOut, capabilities };
      },
    });

    // 14. models
    this.registerCommand('models', {
      description: 'Configure model mappings and routing tiers',
      usage: 'models [--refresh-models|--scope <global|project|session>|--list]',
      execute: async (subArgs) => {
        const { ModelChooserDialog } = await import('../models/model-chooser-dialog.js');
        return await ModelChooserDialog.prompt(subArgs);
      },
    });

    // 15. crawl
    this.registerCommand('crawl', {
      description: 'Automated App Wireframe & Route Flow Crawler',
      usage: 'crawl [--dir <path>] [--base-url <url>] [--output <dir>] [--no-video] [--standalone]',
      options: [
        { flag: '--dir <path>', description: 'Target project root directory' },
        { flag: '--base-url <url>', description: 'Explicit running dev server base URL' },
        { flag: '--output <dir>', description: 'Output directory for wireframes & manifest' },
        { flag: '--no-video', description: 'Disable continuous journey video recording' },
        { flag: '--standalone', description: 'Emit standalone HTML board artifact' },
      ],
      execute: async (subArgs, ctx) => {
        const { runCrawlCli } = await import('./crawl.js');
        return runCrawlCli(subArgs, {
          cwd: ctx.cwd,
          stdout: ctx.stdout,
          stderr: ctx.stderr,
        });
      },
    });
  }

  public static async dispatch(
    args: string[] = process.argv.slice(2),
    options: SuperconductorCliDispatcherOptions = {}
  ): Promise<any> {
    const dispatcher = new SuperconductorCliDispatcher(options);
    return dispatcher.dispatch(args);
  }

  public static async runCli(args: string[] = process.argv.slice(2)): Promise<void> {
    const dispatcher = new SuperconductorCliDispatcher({
      exitOnError: true,
      catchErrors: false,
    });
    try {
      await dispatcher.dispatch(args);
    } catch (err: any) {
      if (err instanceof CliError) {
        process.exit(err.exitCode);
      } else {
        dispatcher.stderr(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  }
}
