import * as path from 'node:path';
import prompts from 'prompts';
import { PhaseStateStore } from '../phase/phase-state-store.js';
import { PhaseTransitionService } from '../phase/phase-transition-service.js';
import type { PhaseItem, RegistryManifest } from '../phase/phase-manifest.js';

export interface PhaseCliOptions {
  projectRoot?: string;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
  promptFn?: (opts: unknown) => Promise<Record<string, unknown>>;
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

/**
 * CLI Entrypoint for Phase Management.
 * Supports subcommands: list, status, switch, advance.
 */
export async function runPhaseCli(
  args: string[] = [],
  options?: PhaseCliOptions
): Promise<number> {
  const out = options?.stdout ?? ((msg: string) => console.log(msg));
  const err = options?.stderr ?? ((msg: string) => console.error(msg));

  let projectRoot = options?.projectRoot ?? process.cwd();
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
      const manifest = await PhaseStateStore.load(projectRoot);
      if (!manifest.phases || manifest.phases.length === 0) {
        out('No phases found.');
        return 0;
      }

      for (const phase of manifest.phases) {
        const pct = PhaseTransitionService.getPhaseCompletionPercentage(phase);
        const completedCount = phase.tracks.filter((t) => t.status === 'completed').length;
        const totalCount = phase.tracks.length;
        const ordinal = PhaseTransitionService.getDisplayOrdinal(phase.phaseId, manifest);

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
      const manifest = await PhaseStateStore.load(projectRoot);
      const activePhase = PhaseTransitionService.getActivePhase(manifest);
      if (!activePhase) {
        err('[WARN] No active phase found.');
        return 1;
      }

      const pct = PhaseTransitionService.getPhaseCompletionPercentage(activePhase);
      const completedCount = activePhase.tracks.filter((t) => t.status === 'completed').length;
      const totalCount = activePhase.tracks.length;

      out(`[PHASE] Active: Phase 1: ${activePhase.name} (${activePhase.phaseId}) [${completedCount}/${totalCount} tracks, ${pct}%]`);
      return 0;
    }

    case 'switch': {
      let targetArg = cleanArgs[1];

      if (!targetArg) {
        const promptFn = options?.promptFn ?? (process.stdin.isTTY ? prompts : undefined);
        if (promptFn) {
          const manifest = await PhaseStateStore.load(projectRoot);
          const availablePhases = manifest.phases.filter((p) => p.status !== 'completed');
          if (availablePhases.length === 0) {
            err('[FAIL] No eligible phases to switch to.');
            return 1;
          }
          const response = await promptFn({
            type: 'select',
            name: 'phaseId',
            message: 'Select phase to activate:',
            choices: availablePhases.map((p) => {
              const ord = PhaseTransitionService.getDisplayOrdinal(p.phaseId, manifest);
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

          return PhaseTransitionService.switchActivePhase(manifest, targetPhase.phaseId);
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
      try {
        const result = await PhaseStateStore.mutate(projectRoot, (manifest) => {
          return PhaseTransitionService.advanceWindow(manifest);
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
