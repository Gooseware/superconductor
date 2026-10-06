import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BatchRunner } from '../../src/orchestration/batch-runner.js';
import { TrackLifecycleWizard } from '../../src/orchestration/track-lifecycle-wizard.js';

describe('BatchRunner', () => {
  let tmpDir: string;
  let mockGitExec: any;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-runner-test-'));
    mockGitExec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (args.includes('HEAD') && args.includes('--abbrev-ref')) {
        return 'track/test_track\n';
      }
      if (args.includes('HEAD') && args.includes('--short')) {
        return 'abc1234\n';
      }
      return '';
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs batch finalization and invokes onBatchFinalized callback', async () => {
    const mockRetroRun = vi.fn().mockResolvedValue({
      trackId: 'track_1',
      proposalsGenerated: [
        {
          proposalId: 'suggest_batch_1',
          filename: 'suggest_batch_1.md',
          relativeFilePath: 'superconductor/suggestions/suggest_batch_1.md',
          data: { category: 'process', title: 'Batch Reviewer Hardening' },
        },
      ],
      savedProposalPaths: ['/tmp/suggestions/suggest_batch_1.md'],
      confidence: 0.9,
      skippedDueToLowConfidence: false,
    });

    const mockOnBatchFinalized = vi.fn().mockResolvedValue(undefined);
    const mockOnTrackFinalized = vi.fn().mockResolvedValue(undefined);

    const wizard = new TrackLifecycleWizard({
      projectRoot: tmpDir,
      gitExecFn: mockGitExec,
      retrospectiveEngine: { run: mockRetroRun } as any,
    });

    const runner = new BatchRunner({
      projectRoot: tmpDir,
      wizard,
      onBatchFinalized: mockOnBatchFinalized,
      onTrackFinalized: mockOnTrackFinalized,
    });

    const batchResult = await runner.runBatch([
      {
        trackId: 'track_1',
        action: 'merge',
        oracleSignOff: true,
        remediationCycles: 2,
      },
      {
        trackId: 'track_2',
        action: 'skip',
      },
    ]);

    expect(batchResult.totalTracks).toBe(2);
    expect(batchResult.successfulTracks).toBe(2);
    expect(batchResult.failedTracks).toBe(0);
    expect(batchResult.allSuggestions).toContain('/tmp/suggestions/suggest_batch_1.md');
    expect(mockOnBatchFinalized).toHaveBeenCalledWith(batchResult);
    expect(mockRetroRun).toHaveBeenCalled();
  });
});
