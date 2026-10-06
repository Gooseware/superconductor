import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { DomainSplitRemediationDispatcher } from './domain-split-remediation-dispatcher.js';
import { DeepResearchEscalationHandler } from './deep-research-escalation-handler.js';
import { DiffOnDiffAuditor, type DiffAuditResult } from './diff-on-diff-auditor.js';
import type { Finding } from './domain-classifier.js';

export type QuorumState =
  | 'INIT'
  | 'REVIEWING'
  | 'NEEDS_FIXES'
  | 'REMEDIATING'
  | 'VERIFYING'
  | 'PASSED'
  | 'HALTED'
  | 'ESCALATED';

export type QuorumEvent =
  | 'START'
  | 'FINDINGS_RETURNED'
  | 'ALL_PASSED'
  | 'FIXES_APPLIED'
  | 'START_REMEDIATION'
  | 'REMEDIATE'
  | 'RE_REVIEW'
  | 'MAX_CYCLES_EXCEEDED'
  | 'STAGNANT_DIFF'
  | 'ESCALATE'
  | 'DEEP_RESEARCH'
  | 'SECONDARY_REGRESSION';

export interface QuorumFSMLike {
  transition(currentState: QuorumState, event: QuorumEvent): { newState: QuorumState };
  isTerminal?(state: QuorumState): boolean;
}

export class DefaultQuorumFSM implements QuorumFSMLike {
  transition(currentState: QuorumState, event: QuorumEvent): { newState: QuorumState } {
    if (
      event === 'MAX_CYCLES_EXCEEDED' ||
      event === 'STAGNANT_DIFF' ||
      event === 'ESCALATE' ||
      event === 'DEEP_RESEARCH' ||
      event === 'SECONDARY_REGRESSION'
    ) {
      return { newState: 'HALTED' };
    }

    switch (currentState) {
      case 'INIT':
        if (event === 'START') return { newState: 'REVIEWING' };
        break;
      case 'REVIEWING':
        if (event === 'FINDINGS_RETURNED') return { newState: 'NEEDS_FIXES' };
        if (event === 'ALL_PASSED') return { newState: 'PASSED' };
        break;
      case 'NEEDS_FIXES':
        if (event === 'FIXES_APPLIED' || event === 'START_REMEDIATION' || event === 'REMEDIATE') {
          return { newState: 'REMEDIATING' };
        }
        break;
      case 'REMEDIATING':
        if (event === 'FIXES_APPLIED' || event === 'RE_REVIEW') {
          return { newState: 'VERIFYING' };
        }
        break;
      case 'VERIFYING':
        if (event === 'ALL_PASSED') return { newState: 'PASSED' };
        if (event === 'FINDINGS_RETURNED') return { newState: 'NEEDS_FIXES' };
        break;
      case 'PASSED':
      case 'HALTED':
      case 'ESCALATED':
        break;
    }

    return { newState: currentState };
  }

  isTerminal(state: QuorumState): boolean {
    return state === 'PASSED' || state === 'HALTED' || state === 'ESCALATED';
  }
}

export interface QuorumReviewResult {
  status: 'RESOLVED' | 'NEEDS_FIXES';
  findings?: Finding[];
  reviewerId?: string;
  rawText?: string;
}

export type ReviewerFunction = (
  cycle: number,
  zeroBiasContext?: any
) => Promise<QuorumReviewResult | QuorumReviewResult[]>;

export interface CycleExecutionResult {
  status: 'ALL_PASSED' | 'NEEDS_FIXES' | 'SECONDARY_REGRESSION';
  findings: Finding[];
  auditResult?: DiffAuditResult;
}

export interface QuorumRemediationLoopOptions {
  trackId?: string;
  sessionId?: string;
  maxCycles?: number;
  fsm?: QuorumFSMLike;
  store?: any;
  dispatcher?: DomainSplitRemediationDispatcher;
  escalationHandler?: DeepResearchEscalationHandler;
  reviewerFn: ReviewerFunction;
  getDiffFn?: (branchOrTrack?: string) => string;
  getDiffRangeFn?: (range: string) => string;
  getRemediationDiffFn?: (cycle: number) => string;
  diffAuditor?: DiffOnDiffAuditor;
  expectedFiles?: string[];
  remediationLogPath?: string;
  secondaryRegressionPolicy?: 'abort' | 'block';
  onCycleComplete?: (cycle: number, state: QuorumState, findings: Finding[]) => void;
  logger?: { log: (msg: string) => void; error: (msg: string) => void };
}

export interface QuorumRemediationLoopResult {
  state: QuorumState;
  cycles: number;
  allGreen: boolean;
  unresolvedFindings: Finding[];
  resolvedFindings: Finding[];
  deepResearchEscalated: boolean;
  stagnantDiffDetected: boolean;
  secondaryRegressionDetected: boolean;
}

function hashDiff(diff: string): string {
  return crypto.createHash('sha256').update(diff || '').digest('hex');
}

function isStagnantDiff(currentHash: string, lastHash: string | null): boolean {
  if (!lastHash) return false;
  return currentHash === lastHash;
}

export class AutonomousQuorumRemediationLoop {
  private fsm: QuorumFSMLike;
  private store?: any;
  private dispatcher: DomainSplitRemediationDispatcher;
  private escalationHandler?: DeepResearchEscalationHandler;
  private reviewerFn: ReviewerFunction;
  private getDiffFn: (branchOrTrack?: string) => string;
  private getDiffRangeFn?: (range: string) => string;
  private getRemediationDiffFn?: (cycle: number) => string;
  private diffAuditor: DiffOnDiffAuditor;
  private expectedFiles?: string[];
  private remediationLogPath?: string;
  private secondaryRegressionPolicy: 'abort' | 'block';
  private trackId: string;
  private sessionId: string;
  private maxCycles: number;
  private logger: { log: (msg: string) => void; error: (msg: string) => void };
  private onCycleComplete?: (cycle: number, state: QuorumState, findings: Finding[]) => void;

  constructor(options: QuorumRemediationLoopOptions) {
    this.fsm = options.fsm || new DefaultQuorumFSM();
    this.store = options.store;
    this.dispatcher = options.dispatcher || new DomainSplitRemediationDispatcher();
    this.escalationHandler = options.escalationHandler;
    this.reviewerFn = options.reviewerFn;
    this.getDiffFn = options.getDiffFn || (() => '');
    this.getDiffRangeFn = options.getDiffRangeFn;
    this.getRemediationDiffFn = options.getRemediationDiffFn;
    this.diffAuditor = options.diffAuditor || new DiffOnDiffAuditor();
    this.expectedFiles = options.expectedFiles;
    this.remediationLogPath = options.remediationLogPath;
    this.secondaryRegressionPolicy = options.secondaryRegressionPolicy || 'abort';
    this.trackId = options.trackId || 'remediation-track';
    this.sessionId = options.sessionId || Date.now().toString();
    this.maxCycles = options.maxCycles ?? 5;
    this.logger = options.logger || console;
    this.onCycleComplete = options.onCycleComplete;
  }

  private isTerminalState(state: QuorumState): boolean {
    if (typeof this.fsm.isTerminal === 'function') {
      return this.fsm.isTerminal(state);
    }
    return state === 'PASSED' || state === 'HALTED' || state === 'ESCALATED';
  }

  /**
   * Runs a single cycle of the quorum review & remediation loop.
   * Invokes DiffOnDiffAuditor on all multi-cycle remediations (cycle > 1) before re-review.
   */
  public async runCycle(
    cycleCount: number,
    currentDiff: string,
    unresolvedFindings: Finding[]
  ): Promise<CycleExecutionResult> {
    // Diff-on-diff scrutiny on multi-cycle remediations before re-review
    if (cycleCount > 1) {
      this.logger.log(
        `[QuorumRemediationLoop] Cycle ${cycleCount}: Running Diff-on-Diff scrutiny before re-review...`
      );

      let remediationDiff: string | undefined;
      if (this.getRemediationDiffFn) {
        remediationDiff = this.getRemediationDiffFn(cycleCount);
      } else if (this.getDiffRangeFn) {
        remediationDiff = this.getDiffRangeFn('HEAD~1..HEAD');
      } else if (currentDiff) {
        remediationDiff = currentDiff;
      } else if (this.getDiffFn) {
        remediationDiff = this.getDiffFn(this.trackId);
      }

      const auditResult = await this.diffAuditor.audit({
        rawDiff: remediationDiff,
        diffRange: 'HEAD~1..HEAD',
        targetFindings: unresolvedFindings,
        expectedFiles: this.expectedFiles,
      });

      // Emit diff-on-diff audit logs to remediation_log.md
      if (this.remediationLogPath) {
        try {
          const logContent = this.diffAuditor.formatLog(auditResult, cycleCount);
          await fs.promises.appendFile(this.remediationLogPath, '\n' + logContent + '\n', 'utf8');
        } catch (e: any) {
          this.logger.error(
            `[QuorumRemediationLoop] Failed to write remediation log to ${this.remediationLogPath}: ${e.message}`
          );
        }
      }

      if (!auditResult.passed) {
        this.logger.error(
          `[QuorumRemediationLoop] Diff-on-diff scrutiny FAILED in cycle ${cycleCount}: ${auditResult.secondaryFindings.length} secondary regression(s) detected.`
        );
        return {
          status: 'SECONDARY_REGRESSION',
          findings: auditResult.secondaryFindings,
          auditResult,
        };
      } else {
        this.logger.log(
          `[QuorumRemediationLoop] Diff-on-diff scrutiny passed for cycle ${cycleCount}. Proceeding to re-review.`
        );
      }
    }

    // Execute standard review
    const zbContext = {
      diff: currentDiff,
      preflight_output: '',
      prior_findings: unresolvedFindings.map((f) => (typeof f === 'string' ? f : JSON.stringify(f))),
      cycle: cycleCount,
    };

    this.logger.log(
      `[QuorumRemediationLoop] Cycle ${cycleCount}/${this.maxCycles}: Running Quorum review...`
    );

    const reviewOutput = await this.reviewerFn(cycleCount, zbContext);
    const reviewArray = Array.isArray(reviewOutput) ? reviewOutput : [reviewOutput];

    const currentCycleFindings: Finding[] = [];
    let anyNeedsFixes = false;

    for (const res of reviewArray) {
      if (res.status === 'NEEDS_FIXES') {
        anyNeedsFixes = true;
      }
      if (res.findings && res.findings.length > 0) {
        for (const f of res.findings) {
          currentCycleFindings.push(f);
        }
      }
    }

    if (!anyNeedsFixes && currentCycleFindings.length === 0) {
      return {
        status: 'ALL_PASSED',
        findings: [],
      };
    }

    return {
      status: 'NEEDS_FIXES',
      findings: currentCycleFindings,
    };
  }

  public async run(): Promise<QuorumRemediationLoopResult> {
    let state: QuorumState = 'INIT';
    let cycleCount = 0;
    let lastDiffHash: string | null = null;
    let unresolvedFindings: Finding[] = [];
    const resolvedFindings: Finding[] = [];
    let deepResearchEscalated = false;
    let stagnantDiffDetected = false;
    let secondaryRegressionDetected = false;

    // Load persisted state if store is available
    if (this.store && typeof this.store.load === 'function') {
      try {
        const existing = await this.store.load(this.trackId, this.sessionId);
        if (existing) {
          state = existing.state;
          cycleCount = existing.cycle_count || 0;
          lastDiffHash = existing.last_diff_hash || null;
        }
      } catch {}
    }

    if (state === 'INIT') {
      state = this.fsm.transition(state, 'START').newState;
      await this.persistState(state, cycleCount, lastDiffHash, unresolvedFindings);
    }

    while (!this.isTerminalState(state) && cycleCount < this.maxCycles) {
      const currentDiff = this.getDiffFn(this.trackId);
      const diffHash = hashDiff(currentDiff);

      // Check stagnant diff
      if (lastDiffHash && isStagnantDiff(diffHash, lastDiffHash)) {
        this.logger.error(
          '[QuorumRemediationLoop] STAGNANT_DIFF detected: remediation produced identical diff. Halting.'
        );
        state = this.fsm.transition(state, 'STAGNANT_DIFF').newState;
        stagnantDiffDetected = true;
        await this.persistState(state, cycleCount, diffHash, unresolvedFindings);
        break;
      }

      lastDiffHash = diffHash;
      cycleCount++;

      // Run cycle (includes diff-on-diff scrutiny on cycle > 1)
      const cycleResult = await this.runCycle(cycleCount, currentDiff, unresolvedFindings);

      // Handle secondary regressions
      if (cycleResult.status === 'SECONDARY_REGRESSION') {
        secondaryRegressionDetected = true;
        unresolvedFindings = cycleResult.findings;

        if (this.secondaryRegressionPolicy === 'abort') {
          state = this.fsm.transition(state, 'SECONDARY_REGRESSION').newState;
          await this.persistState(state, cycleCount, diffHash, unresolvedFindings);
          if (this.onCycleComplete) {
            this.onCycleComplete(cycleCount, state, unresolvedFindings);
          }
          break;
        } else {
          // Block policy: transition to NEEDS_FIXES, skip re-review, and dispatch fix for secondary regression
          state = this.fsm.transition(state, 'FINDINGS_RETURNED').newState;
          await this.persistState(state, cycleCount, diffHash, unresolvedFindings);
          if (this.onCycleComplete) {
            this.onCycleComplete(cycleCount, state, unresolvedFindings);
          }
          this.logger.log(
            `[QuorumRemediationLoop] Re-dispatching remediators for secondary regressions...`
          );
          await this.dispatcher.dispatch(unresolvedFindings, { trackId: this.trackId });
          state = this.fsm.transition(state, 'FIXES_APPLIED').newState;
          state = this.fsm.transition(state, 'FIXES_APPLIED').newState;
          continue;
        }
      }

      // Handle all passed
      if (cycleResult.status === 'ALL_PASSED') {
        state = this.fsm.transition(state, 'ALL_PASSED').newState;
        this.logger.log(`[QuorumRemediationLoop] Quorum PASSED on cycle ${cycleCount}. All green.`);
        if (unresolvedFindings.length > 0) {
          resolvedFindings.push(...unresolvedFindings);
          unresolvedFindings = [];
        }
        await this.persistState(state, cycleCount, diffHash, unresolvedFindings, resolvedFindings);
        if (this.onCycleComplete) {
          this.onCycleComplete(cycleCount, state, []);
        }
        break;
      }

      // Findings present
      unresolvedFindings = cycleResult.findings;
      state = this.fsm.transition(state, 'FINDINGS_RETURNED').newState;
      await this.persistState(state, cycleCount, diffHash, unresolvedFindings);

      if (this.onCycleComplete) {
        this.onCycleComplete(cycleCount, state, unresolvedFindings);
      }

      // Check circuit breaker limit
      if (cycleCount >= this.maxCycles) {
        this.logger.error(
          `[QuorumRemediationLoop] MAX_CYCLES (${this.maxCycles}) exceeded. Tripping circuit breaker.`
        );

        if (this.escalationHandler && unresolvedFindings.length > 0) {
          try {
            this.logger.log('[QuorumRemediationLoop] Escalating to Deep Research...');
            for (const finding of unresolvedFindings) {
              await this.escalationHandler.escalate({
                finding,
                codeContext: currentDiff,
                errorMessages: [
                  `Unresolved finding in cycle ${cycleCount}: ${finding.description || ''}`,
                ],
                priorFixDiffs: [currentDiff],
              });
            }
            deepResearchEscalated = true;
          } catch (e: any) {
            this.logger.error(`[QuorumRemediationLoop] Deep research escalation error: ${e.message}`);
          }
        }

        state = this.fsm.transition(state, 'MAX_CYCLES_EXCEEDED').newState;
        await this.persistState(state, cycleCount, diffHash, unresolvedFindings);
        break;
      }

      // Dispatch domain-split remediation in parallel
      this.logger.log(
        `[QuorumRemediationLoop] Dispatching parallel domain remediators for ${unresolvedFindings.length} findings...`
      );
      await this.dispatcher.dispatch(unresolvedFindings, { trackId: this.trackId });

      state = this.fsm.transition(state, 'FIXES_APPLIED').newState; // REMEDIATING
      state = this.fsm.transition(state, 'FIXES_APPLIED').newState; // VERIFYING
      await this.persistState(state, cycleCount, diffHash, unresolvedFindings);
    }

    return {
      state,
      cycles: cycleCount,
      allGreen: state === 'PASSED',
      unresolvedFindings,
      resolvedFindings,
      deepResearchEscalated,
      stagnantDiffDetected,
      secondaryRegressionDetected,
    };
  }

  private async persistState(
    state: QuorumState,
    cycleCount: number,
    lastDiffHash: string | null,
    unresolvedFindings: Finding[],
    resolvedFindings: Finding[] = []
  ): Promise<void> {
    if (!this.store || typeof this.store.save !== 'function') return;

    const record: any = {
      track_id: this.trackId,
      session_id: this.sessionId,
      state,
      cycle_count: cycleCount,
      last_diff_hash: lastDiffHash,
      reviewer_session_id: null,
      timestamp: Date.now(),
      sha256_checksum: '',
      metadata: JSON.stringify({
        unresolvedFindings,
        resolvedFindings,
        intelligenceStatusChecked: true,
        notebookQueried: true,
      }),
    };

    await this.store.save(record);
  }
}

export const QuorumRemediationLoop = AutonomousQuorumRemediationLoop;
export type QuorumRemediationLoop = AutonomousQuorumRemediationLoop;
