/**
 * Micro-Swarm Orchestrator
 *
 * Provides a canonical micro-swarm orchestration module for ad-hoc requests,
 * quick enhancements, and bug fixes outside formal tracks.
 *
 * Guarantees:
 *  - Parses intent/diff into granular WorkUnits (preserves 1:1 mapping).
 *  - Classifies impacted domains ('security', 'frontend', 'logic', 'tests', 'copy').
 *  - Allocates isolated worktree branches via WorktreeIsolationManager.
 *  - Dispatches parallel processors in concurrency-controlled batches.
 *  - Assembles the Quorum Review by invoking QuorumCompositionResolver.
 */

import {
  type SwarmWorkUnit,
  parseWorkUnits,
} from './swarm-granularity.js';
import {
  QuorumCompositionResolver,
} from '../review/quorum-composition-resolver.js';
import {
  ModelRoutingEnforcer,
  type ModelTier,
} from './model-routing-enforcer.js';
import type { WorktreeManagerLike } from '../remediation/domain-split-remediation-dispatcher.js';
import {
  HeadlessWatchdog,
  type HeadlessWatchdogOptions,
  type QuorumPersistedState,
} from './headless-watchdog.js';

export type { WorktreeManagerLike, HeadlessWatchdogOptions, QuorumPersistedState };
export { HeadlessWatchdog };

export type MicroSwarmDomain = 'security' | 'frontend' | 'logic' | 'tests' | 'copy';


export interface MicroSwarmTaskInfo {
  workUnit: SwarmWorkUnit;
  agentId: string;
  domain: MicroSwarmDomain;
  branch?: string;
  model: ModelTier;
  task: string;
  tier: number;
}

export interface MicroSwarmProcessorResult {
  agentId: string;
  domain: MicroSwarmDomain;
  branch?: string;
  success: boolean;
  output?: string;
  modifiedFiles?: string[];
  error?: string;
}

export type MicroSwarmProcessorSpawner = (
  task: MicroSwarmTaskInfo
) => Promise<MicroSwarmProcessorResult | void>;

export interface MicroSwarmQuorumContext {
  trackId: string;
  panel: string[];
  domains: MicroSwarmDomain[];
  tasks: MicroSwarmTaskInfo[];
  modifiedFiles: string[];
}

export type MicroSwarmQuorumRunner = (
  panel: string[],
  context: MicroSwarmQuorumContext
) => Promise<any>;

export interface MicroSwarmOptions {
  trackId?: string;
  phaseId?: string;
  maxParallel?: number;
  worktreeManager?: WorktreeManagerLike;
  spawner?: MicroSwarmProcessorSpawner;
  quorumResolver?: QuorumCompositionResolver;
  quorumRunner?: MicroSwarmQuorumRunner;
  modelRouter?: ModelRoutingEnforcer;
  files?: string[];
  autoReleaseWorktrees?: boolean;
  headless?: boolean;
  watchdog?: HeadlessWatchdog;
  watchdogOptions?: HeadlessWatchdogOptions;
  cycle?: number;
  diff?: string;
}

export interface MicroSwarmResult {
  trackId: string;
  workUnits: SwarmWorkUnit[];
  domains: MicroSwarmDomain[];
  allocatedBranches: string[];
  tasks: MicroSwarmTaskInfo[];
  processorResults: MicroSwarmProcessorResult[];
  quorumPanel: string[];
  quorumResult?: any;
  status: 'COMPLETED' | 'NEEDS_FIXES' | 'FAILED' | 'DISPATCHED' | 'CIRCUIT_BROKEN';
  diffHash?: string;
  circuitBreakerReason?: 'STAGNANT_DIFF' | 'WAVE_TIMEOUT' | 'MAX_CYCLES_EXCEEDED';
  persistedState?: QuorumPersistedState;
}

export class MicroSwarmOrchestrator {
  private worktreeManager?: WorktreeManagerLike;
  private quorumResolver: QuorumCompositionResolver;
  private modelRouter: ModelRoutingEnforcer;
  private defaultTrackId: string;
  private watchdog?: HeadlessWatchdog;

  constructor(options?: MicroSwarmOptions) {
    this.worktreeManager = options?.worktreeManager;
    this.quorumResolver = options?.quorumResolver || new QuorumCompositionResolver();
    this.modelRouter = options?.modelRouter || new ModelRoutingEnforcer();
    this.defaultTrackId = options?.trackId || 'micro-swarm-adhoc';
    this.watchdog =
      options?.watchdog ??
      (options?.headless || options?.watchdogOptions
        ? new HeadlessWatchdog(options.watchdogOptions)
        : undefined);
  }

  public getWatchdog(): HeadlessWatchdog | undefined {
    return this.watchdog;
  }

  /**
   * Classify modified files or text into canonical impacted domains:
   * 'security', 'frontend', 'logic', 'tests', 'copy'.
   */
  public classifyDomains(intentOrDiff: string, files?: string[]): MicroSwarmDomain[] {
    const detected = new Set<MicroSwarmDomain>();

    // 1. Files classification
    const allFiles = [...(files || []), ...this.extractFilesFromDiff(intentOrDiff)];
    for (const file of allFiles) {
      const domain = this.classifyFileDomain(file);
      detected.add(domain);
    }

    // 2. Scan text for domain tags, e.g. [DOMAIN:security]
    const text = intentOrDiff.toLowerCase();
    const domainTags = text.match(/\[domain:([^\]]+)\]/g);
    if (domainTags) {
      for (const dt of domainTags) {
        const raw = dt.replace(/\[domain:|\s|\]/g, '');
        const normalized = this.normalizeDomain(raw);
        if (normalized) detected.add(normalized);
      }
    }

    // 3. Keyword heuristics
    if (/\b(test\w*|spec\w*|coverage|vitest|jest|unit\s+test|e2e|assertion\w*)\b/i.test(text)) {
      detected.add('tests');
    }
    if (/\b(auth\w*|security|token\w*|jwt|permission\w*|credential\w*|secret\w*|password\w*|hash\w*|crypto\w*|vulnerabilit\w*|sanitiz\w*)\b/i.test(text)) {
      detected.add('security');
    }
    if (/\b(ui|ux|frontend\w*|front-end\w*|component\w*|style\w*|styling|css|scss|less|view\w*|layout\w*|modal\w*|button\w*|theme\w*|dialog\w*)\b/i.test(text)) {
      detected.add('frontend');
    }
    if (/\b(copy|wording|typo\w*|text\w*|label\w*|translation\w*|i18n|locale\w*|message\w*|prompt\w*|phrasing|readme|documentation|docs)\b/i.test(text)) {
      detected.add('copy');
    }
    if (/\b(logic\w*|service\w*|handler\w*|controller\w*|algorithm\w*|backend\w*|calculat\w*|comput\w*|query\w*|endpoint\w*|workflow\w*|pipeline\w*|orchestrat\w*)\b/i.test(text)) {
      detected.add('logic');
    }

    // Default fallback if empty
    if (detected.size === 0) {
      detected.add('logic');
    }

    const priorityOrder: MicroSwarmDomain[] = ['security', 'frontend', 'logic', 'tests', 'copy'];
    return priorityOrder.filter((d) => detected.has(d));
  }

  /**
   * Classify a single file path into one of the 5 canonical domains.
   */
  public classifyFileDomain(filePath: string): MicroSwarmDomain {
    const lower = filePath.toLowerCase();
    if (
      lower.includes('.test.') ||
      lower.includes('.spec.') ||
      lower.includes('__tests__/') ||
      lower.startsWith('test/') ||
      lower.startsWith('tests/')
    ) {
      return 'tests';
    }
    if (
      lower.endsWith('.tsx') ||
      lower.endsWith('.jsx') ||
      lower.endsWith('.vue') ||
      lower.endsWith('.svelte') ||
      lower.endsWith('.css') ||
      lower.endsWith('.scss') ||
      lower.endsWith('.sass') ||
      lower.endsWith('.less') ||
      lower.endsWith('.html') ||
      lower.endsWith('.htm') ||
      lower.endsWith('.svg') ||
      lower.includes('ui/') ||
      lower.includes('components/') ||
      lower.includes('pages/') ||
      lower.includes('styles/') ||
      lower.includes('views/')
    ) {
      return 'frontend';
    }
    if (
      lower.includes('auth/') ||
      lower.includes('security/') ||
      lower.includes('jwt') ||
      lower.includes('credential') ||
      lower.includes('session/') ||
      lower.includes('permission') ||
      lower.includes('crypto')
    ) {
      return 'security';
    }
    if (
      lower.endsWith('.md') ||
      lower.endsWith('.markdown') ||
      lower.endsWith('.txt') ||
      lower.includes('locales/') ||
      lower.includes('locale/') ||
      lower.includes('i18n/') ||
      lower.includes('messages/') ||
      lower.includes('copy/') ||
      lower.includes('docs/')
    ) {
      return 'copy';
    }
    return 'logic';
  }

  /**
   * Normalize arbitrary domain string to canonical MicroSwarmDomain.
   */
  private normalizeDomain(raw: string): MicroSwarmDomain | undefined {
    const lower = raw.toLowerCase().trim();
    if (lower === 'security' || lower === 'auth') return 'security';
    if (lower === 'frontend' || lower === 'ui' || lower === 'ux') return 'frontend';
    if (lower === 'logic' || lower === 'core' || lower === 'backend') return 'logic';
    if (lower === 'tests' || lower === 'test' || lower === 'testing') return 'tests';
    if (lower === 'copy' || lower === 'docs' || lower === 'doc' || lower === 'i18n') return 'copy';
    return undefined;
  }

  /**
   * Extract filenames mentioned in a unified diff format.
   */
  public extractFilesFromDiff(text: string): string[] {
    const files = new Set<string>();
    const diffHeaderRegex = /(?:^|\n)diff --git a\/(\S+)\s+b\/(\S+)/g;
    let match: RegExpExecArray | null;
    while ((match = diffHeaderRegex.exec(text)) !== null) {
      if (match[2] && match[2] !== '/dev/null') files.add(match[2]);
      else if (match[1] && match[1] !== '/dev/null') files.add(match[1]);
    }
    const pathRegex = /(?:^|\n)(?:---|\+\+\+)\s+[ab]\/(\S+)/g;
    while ((match = pathRegex.exec(text)) !== null) {
      if (match[1] && match[1] !== '/dev/null') files.add(match[1]);
    }
    return Array.from(files);
  }

  /**
   * Parse input intent or git diff into SwarmWorkUnits.
   */
  public parseToWorkUnits(intentOrDiff: string, domains: MicroSwarmDomain[]): SwarmWorkUnit[] {
    // Check if formal plan format is provided
    const parsed = parseWorkUnits(intentOrDiff);
    if (parsed.length > 0) {
      return parsed;
    }

    const synthesized: SwarmWorkUnit[] = [];
    const isDiff = intentOrDiff.includes('diff --git') || intentOrDiff.includes('--- a/');

    if (isDiff) {
      const files = this.extractFilesFromDiff(intentOrDiff);
      domains.forEach((domain, idx) => {
        const domainFiles = files.filter((f) => this.classifyFileDomain(f) === domain);
        const taskDesc = domainFiles.length > 0
          ? `Apply changes for ${domain} (${domainFiles.slice(0, 3).join(', ')})`
          : `Apply diff adjustments for ${domain}`;
        synthesized.push({
          id: `wu-${idx}`,
          task: taskDesc,
          tier: 2,
          agent: 'superconductor-processor',
          domain,
          phase: 1,
        });
      });
    } else {
      // Check for multi-line checklist items
      const lines = intentOrDiff
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^[-*]\s*\[\s*\]/.test(l) || /^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l));

      if (lines.length > 1) {
        lines.forEach((line, idx) => {
          const clean = line.replace(/^[-*]\s*(\[\s*\])?\s*|\d+\.\s*/, '').trim();
          const lineDomains = this.classifyDomains(clean);
          const domain = lineDomains[0] || 'logic';
          synthesized.push({
            id: `wu-${idx}`,
            task: clean,
            tier: 2,
            agent: 'superconductor-processor',
            domain,
            phase: 1,
          });
        });
      } else {
        const cleanIntent = intentOrDiff.trim().split('\n')[0] || 'Execute ad-hoc change';
        domains.forEach((domain, idx) => {
          synthesized.push({
            id: `wu-${idx}`,
            task: `${domain.toUpperCase()}: ${cleanIntent}`,
            tier: 2,
            agent: 'superconductor-processor',
            domain,
            phase: 1,
          });
        });
      }
    }

    return synthesized.length > 0
      ? synthesized
      : [
          {
            id: 'wu-0',
            task: intentOrDiff.trim().slice(0, 80),
            tier: 2,
            agent: 'superconductor-processor',
            domain: domains[0] || 'logic',
            phase: 1,
          },
        ];
  }

  /**
   * Dispatches the micro-swarm pipeline:
   * 1. Parses intent/diff into WorkUnits
   * 2. Classifies impacted domains
   * 3. Allocates isolated worktree branches
   * 4. Dispatches parallel processors
   * 5. Assembles and runs the Quorum Review
   */
  public async dispatch(
    intentOrDiff: string,
    options?: MicroSwarmOptions
  ): Promise<MicroSwarmResult> {
    const trackId = options?.trackId || this.defaultTrackId;
    const phaseId = options?.phaseId;
    const cycle = options?.cycle ?? 1;
    const worktreeManager = options?.worktreeManager ?? this.worktreeManager;
    const quorumResolver = options?.quorumResolver ?? this.quorumResolver;
    const modelRouter = options?.modelRouter ?? this.modelRouter;
    const maxParallel = options?.maxParallel ?? 4;
    const watchdog =
      options?.watchdog ??
      this.watchdog ??
      (options?.headless || options?.watchdogOptions
        ? new HeadlessWatchdog(options.watchdogOptions)
        : undefined);

    // Circuit Breaker: Max cycle limit
    if (watchdog && watchdog.isCycleLimitReached(cycle)) {
      const persistedState: QuorumPersistedState = {
        trackId,
        phaseId,
        cycle,
        status: 'circuit_broken',
        timestamp: Date.now(),
        metadata: { reason: 'MAX_CYCLES_EXCEEDED' },
      };
      await watchdog.persistState(persistedState);
      return {
        trackId,
        workUnits: [],
        domains: [],
        allocatedBranches: [],
        tasks: [],
        processorResults: [],
        quorumPanel: [],
        status: 'CIRCUIT_BROKEN',
        circuitBreakerReason: 'MAX_CYCLES_EXCEEDED',
        persistedState,
      };
    }

    const isDiff = intentOrDiff.includes('diff --git') || intentOrDiff.includes('--- a/');
    const rawDiff = options?.diff ?? (isDiff ? intentOrDiff : undefined);
    let currentDiffHash: string | undefined;

    // Circuit Breaker: Diff-Hash Stability (STAGNANT_DIFF)
    if (watchdog && rawDiff) {
      const { isStagnant, diffHash } = watchdog.recordDiff(rawDiff);
      currentDiffHash = diffHash;
      if (isStagnant) {
        const persistedState: QuorumPersistedState = {
          trackId,
          phaseId,
          cycle,
          status: 'circuit_broken',
          lastDiffHash: diffHash,
          timestamp: Date.now(),
          metadata: { reason: 'STAGNANT_DIFF' },
        };
        await watchdog.persistState(persistedState);
        return {
          trackId,
          workUnits: [],
          domains: [],
          allocatedBranches: [],
          tasks: [],
          processorResults: [],
          quorumPanel: [],
          status: 'CIRCUIT_BROKEN',
          diffHash,
          circuitBreakerReason: 'STAGNANT_DIFF',
          persistedState,
        };
      }
    }

    // 1. Classify domains
    const domains = this.classifyDomains(intentOrDiff, options?.files);

    // 2. Parse into WorkUnits
    const workUnits = this.parseToWorkUnits(intentOrDiff, domains);

    // Initial checkpoint persistence
    if (watchdog) {
      await watchdog.persistState({
        trackId,
        phaseId,
        cycle,
        status: 'in_progress',
        lastDiffHash: currentDiffHash,
        timestamp: Date.now(),
      });
    }

    // 3. Allocate isolated worktree branches and configure tasks
    const allocatedBranches: string[] = [];
    const allocatedAgentIds: string[] = [];
    const tasks: MicroSwarmTaskInfo[] = [];

    try {
      for (let i = 0; i < workUnits.length; i++) {
        const wu = workUnits[i];
        const matchedDomain = (
          domains.includes(wu.domain as MicroSwarmDomain)
            ? wu.domain
            : this.normalizeDomain(wu.domain) || this.classifyDomains(wu.task)[0] || 'logic'
        ) as MicroSwarmDomain;

        const safeDomain = matchedDomain.replace(/[^a-zA-Z0-9_-]/g, '');
        const agentId = `proc-${safeDomain}-${i}`;

        let branch: string | undefined;
        if (worktreeManager) {
          branch = await worktreeManager.allocate(agentId, trackId);
          allocatedBranches.push(branch);
          allocatedAgentIds.push(agentId);
        }

        const model = modelRouter.resolveModel('superconductor-processor', {
          complexity: wu.tier >= 3 ? 'high' : 'low',
          worktreeIsolated: Boolean(branch),
        });

        tasks.push({
          workUnit: wu,
          agentId,
          domain: matchedDomain,
          branch,
          model,
          task: wu.task,
          tier: wu.tier,
        });
      }

      // 4. Dispatch parallel processors in concurrency batches
      const processorResults: MicroSwarmProcessorResult[] = [];
      const spawner = options?.spawner;

      const batches: MicroSwarmTaskInfo[][] = [];
      for (let i = 0; i < tasks.length; i += maxParallel) {
        batches.push(tasks.slice(i, i + maxParallel));
      }

      const waveStartTime = Date.now();

      for (const batch of batches) {
        if (watchdog && watchdog.isWaveTimedOut(waveStartTime)) {
          const persistedState: QuorumPersistedState = {
            trackId,
            phaseId,
            cycle,
            status: 'circuit_broken',
            lastDiffHash: currentDiffHash,
            timestamp: Date.now(),
            metadata: { reason: 'WAVE_TIMEOUT' },
          };
          await watchdog.persistState(persistedState);
          return {
            trackId,
            workUnits,
            domains,
            allocatedBranches,
            tasks,
            processorResults,
            quorumPanel: [],
            status: 'CIRCUIT_BROKEN',
            diffHash: currentDiffHash,
            circuitBreakerReason: 'WAVE_TIMEOUT',
            persistedState,
          };
        }

        const batchPromise = Promise.all(
          batch.map(async (taskInfo) => {
            if (spawner) {
              try {
                const res = await spawner(taskInfo);
                if (res) return res;
                return {
                  agentId: taskInfo.agentId,
                  domain: taskInfo.domain,
                  branch: taskInfo.branch,
                  success: true,
                };
              } catch (err) {
                return {
                  agentId: taskInfo.agentId,
                  domain: taskInfo.domain,
                  branch: taskInfo.branch,
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                };
              }
            }
            return {
              agentId: taskInfo.agentId,
              domain: taskInfo.domain,
              branch: taskInfo.branch,
              success: true,
            };
          })
        );

        let batchResults: MicroSwarmProcessorResult[];

        if (watchdog) {
          const remainingTimeoutMs = Math.max(0, watchdog.waveTimeoutMs - (Date.now() - waveStartTime));
          let timer: NodeJS.Timeout | undefined;
          const timeoutPromise = new Promise<'TIMEOUT'>((resolve) => {
            timer = setTimeout(() => resolve('TIMEOUT'), remainingTimeoutMs);
          });

          const winner = await Promise.race([batchPromise, timeoutPromise]);
          if (timer) clearTimeout(timer);

          if (winner === 'TIMEOUT' || watchdog.isWaveTimedOut(waveStartTime)) {
            const persistedState: QuorumPersistedState = {
              trackId,
              phaseId,
              cycle,
              status: 'circuit_broken',
              lastDiffHash: currentDiffHash,
              timestamp: Date.now(),
              metadata: { reason: 'WAVE_TIMEOUT' },
            };
            await watchdog.persistState(persistedState);
            return {
              trackId,
              workUnits,
              domains,
              allocatedBranches,
              tasks,
              processorResults,
              quorumPanel: [],
              status: 'CIRCUIT_BROKEN',
              diffHash: currentDiffHash,
              circuitBreakerReason: 'WAVE_TIMEOUT',
              persistedState,
            };
          }
          batchResults = winner as MicroSwarmProcessorResult[];
        } else {
          batchResults = await batchPromise;
        }

        processorResults.push(...batchResults);
      }

      // Checkpoint persistence after subagent execution
      if (watchdog) {
        const hasFailures = processorResults.some((r) => !r.success);
        await watchdog.persistState({
          trackId,
          phaseId,
          cycle,
          status: hasFailures ? 'failed' : 'in_progress',
          lastDiffHash: currentDiffHash,
          timestamp: Date.now(),
          metadata: {
            completedTasks: processorResults.length,
            failures: processorResults.filter((r) => !r.success).length,
          },
        });
      }

      // 5. Assemble Quorum Review
      const allModifiedFiles = new Set<string>(options?.files || []);
      for (const f of this.extractFilesFromDiff(intentOrDiff)) {
        allModifiedFiles.add(f);
      }
      for (const res of processorResults) {
        if (res.modifiedFiles) {
          for (const f of res.modifiedFiles) {
            allModifiedFiles.add(f);
          }
        }
      }

      const quorumPanel = quorumResolver.resolve({
        files: Array.from(allModifiedFiles),
        domains,
        intent: isDiff ? undefined : intentOrDiff,
        diff: isDiff ? intentOrDiff : undefined,
      });

      let quorumResult: any;
      let status: MicroSwarmResult['status'] = 'DISPATCHED';

      const hasFailures = processorResults.some((r) => !r.success);
      if (hasFailures) {
        status = 'FAILED';
      } else {
        const quorumRunner = options?.quorumRunner;
        if (quorumRunner) {
          const quorumContext: MicroSwarmQuorumContext = {
            trackId,
            panel: quorumPanel,
            domains,
            tasks,
            modifiedFiles: Array.from(allModifiedFiles),
          };
          quorumResult = await quorumRunner(quorumPanel, quorumContext);
          const passed = quorumResult?.passed ?? quorumResult?.status === 'PASS';
          status = passed ? 'COMPLETED' : 'NEEDS_FIXES';
        } else {
          status = 'COMPLETED';
        }
      }

      // Checkpoint persistence after review pass
      let persistedState: QuorumPersistedState | undefined;
      if (watchdog) {
        persistedState = {
          trackId,
          phaseId,
          cycle,
          status: status === 'COMPLETED' ? 'passed' : 'failed',
          lastDiffHash: currentDiffHash,
          timestamp: Date.now(),
          metadata: { quorumResult, status },
        };
        await watchdog.persistState(persistedState);
      }

      return {
        trackId,
        workUnits,
        domains,
        allocatedBranches,
        tasks,
        processorResults,
        quorumPanel,
        quorumResult,
        status,
        diffHash: currentDiffHash,
        persistedState,
      };
    } finally {
      // Auto cleanup worktrees if requested, guaranteed to run even on error
      if (options?.autoReleaseWorktrees && worktreeManager?.release) {
        for (const agentId of allocatedAgentIds) {
          try {
            await worktreeManager.release(agentId);
          } catch (releaseErr) {
            console.error(`Failed to release worktree for ${agentId}:`, releaseErr);
          }
        }
      }
    }
  }
}
