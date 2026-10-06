import {
  TrackLifecycleWizard,
  type FinalizationAction,
  type FinalizationResult,
} from './track-lifecycle-wizard.js';
import {
  RunRetrospectiveEngine,
  type RetrospectiveResult,
} from '../retrospective/run-retrospective-engine.js';

export interface TrackBatchItem {
  trackId: string;
  action?: FinalizationAction; // default 'merge'
  targetBranch?: string;
  trackBranch?: string;
  oracleSignOff?: boolean;
  force?: boolean;
  touchedFiles?: string[];
  remediationCycles?: number;
  errorCount?: number;
  skipRetrospective?: boolean;
}

export interface BatchRunResult {
  totalTracks: number;
  successfulTracks: number;
  failedTracks: number;
  results: FinalizationResult[];
  retrospectiveResults: RetrospectiveResult[];
  allSuggestions: string[];
}

export interface BatchRunnerOptions {
  projectRoot?: string;
  wizard?: TrackLifecycleWizard;
  retrospectiveEngine?: RunRetrospectiveEngine;
  enableRetrospective?: boolean;
  onBatchFinalized?: (result: BatchRunResult) => Promise<void> | void;
  onTrackFinalized?: (result: FinalizationResult) => Promise<void> | void;
  logger?: { log: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}

export class BatchRunner {
  private projectRoot: string;
  private wizard: TrackLifecycleWizard;
  private retrospectiveEngine: RunRetrospectiveEngine;
  private enableRetrospective: boolean;
  private onBatchFinalized?: (result: BatchRunResult) => Promise<void> | void;
  private onTrackFinalized?: (result: FinalizationResult) => Promise<void> | void;
  private logger: { log: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

  constructor(options: BatchRunnerOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.logger = options.logger || console;
    this.enableRetrospective = options.enableRetrospective ?? true;
    this.retrospectiveEngine =
      options.retrospectiveEngine ||
      new RunRetrospectiveEngine({
        projectRoot: this.projectRoot,
        logger: this.logger,
      });
    this.onTrackFinalized = options.onTrackFinalized;
    this.onBatchFinalized = options.onBatchFinalized;
    this.wizard =
      options.wizard ||
      new TrackLifecycleWizard({
        projectRoot: this.projectRoot,
        retrospectiveEngine: this.retrospectiveEngine,
        enableRetrospective: this.enableRetrospective,
        onTrackFinalized: this.onTrackFinalized,
        logger: this.logger,
      });
  }

  /**
   * Executes a batch of tracks through lifecycle finalization and retrospective analysis.
   */
  public async runBatch(items: TrackBatchItem[]): Promise<BatchRunResult> {
    this.logger.log(`[BatchRunner] Starting batch finalization for ${items.length} track(s)...`);

    const results: FinalizationResult[] = [];
    const retrospectiveResults: RetrospectiveResult[] = [];
    const allSuggestions: string[] = [];

    for (const item of items) {
      const finalResult = await this.wizard.finalizeTrack({
        trackId: item.trackId,
        action: item.action || 'merge',
        targetBranch: item.targetBranch,
        trackBranch: item.trackBranch,
        oracleSignOff: item.oracleSignOff,
        force: item.force,
        touchedFiles: item.touchedFiles,
        remediationCycles: item.remediationCycles,
        errorCount: item.errorCount,
        skipRetrospective: item.skipRetrospective,
      });

      results.push(finalResult);

      if (finalResult.retrospective) {
        retrospectiveResults.push(finalResult.retrospective);
      }
      if (finalResult.suggestions && finalResult.suggestions.length > 0) {
        allSuggestions.push(...finalResult.suggestions);
      }
    }

    const successfulTracks = results.filter((r) => r.success).length;
    const failedTracks = results.length - successfulTracks;

    const batchResult: BatchRunResult = {
      totalTracks: items.length,
      successfulTracks,
      failedTracks,
      results,
      retrospectiveResults,
      allSuggestions,
    };

    // CLI post-run briefing summary
    this.logger.log('=====================================================');
    this.logger.log('              BATCH FINALIZATION BRIEFING            ');
    this.logger.log('=====================================================');
    this.logger.log(`Total Tracks Processed: ${batchResult.totalTracks}`);
    this.logger.log(`Successful:             ${batchResult.successfulTracks}`);
    this.logger.log(`Failed:                 ${batchResult.failedTracks}`);
    this.logger.log(`Suggestions Generated:  ${batchResult.allSuggestions.length}`);
    if (batchResult.allSuggestions.length > 0) {
      for (const sug of batchResult.allSuggestions) {
        this.logger.log(`  - Suggestion: ${sug}`);
      }
    }
    this.logger.log('=====================================================');

    if (this.onBatchFinalized) {
      try {
        await this.onBatchFinalized(batchResult);
      } catch (err: any) {
        this.logger.warn(`[BatchRunner] onBatchFinalized callback error: ${err.message}`);
      }
    }

    return batchResult;
  }
}
