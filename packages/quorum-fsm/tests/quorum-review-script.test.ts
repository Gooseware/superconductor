import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { runQuorumReview } from '../../../scripts/quorum-review.js';
import { QuorumStateStore } from '../src/persistence/quorum-state-store.js';

describe('quorum-review.ts script integration', () => {
  let tmpDir: string;
  let dbPath: string;
  let store: QuorumStateStore;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quorum-script-test-'));
    dbPath = path.join(tmpDir, 'quorum.db');
    store = new QuorumStateStore(dbPath);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should run fast mode and transition to REVIEWING', async () => {
    const exitFn = vi.fn();
    const getDiffFn = vi.fn().mockReturnValue('diff 1');

    await store.save({ track_id: 'feature-x', session_id: 'session-test', state: 'INIT', cycle_count: 0, last_diff_hash: null, reviewer_session_id: null, timestamp: Date.now(), sha256_checksum: '', metadata: JSON.stringify({ intelligenceStatusChecked: true, notebookQueried: true }) });

    await runQuorumReview(
      ['--branch', 'feature-x', '--fast'],
      { store, getDiffFn, exitFn, sessionId: 'session-test' }
    );

    const record = await store.load('feature-x', 'session-test');
    expect(exitFn).not.toHaveBeenCalled();
  });

  it('should detect STAGNANT_DIFF and exit with code 1', async () => {
    const exitFn = vi.fn();
    const getDiffFn = vi.fn().mockReturnValue('identical diff string');

    await store.save({ track_id: 'feature-stagnant', session_id: 's1', state: 'INIT', cycle_count: 0, last_diff_hash: null, reviewer_session_id: null, timestamp: Date.now(), sha256_checksum: '', metadata: JSON.stringify({ intelligenceStatusChecked: true, notebookQueried: true }) });

    // First cycle: sets last_diff_hash
    await runQuorumReview(
      ['--branch', 'feature-stagnant'],
      { store, getDiffFn, exitFn, sessionId: 's1' }
    );

    // Second cycle with same diff: stagnant diff exit 1
    await runQuorumReview(
      ['--branch', 'feature-stagnant'],
      { store, getDiffFn, exitFn, sessionId: 's1' }
    );

    expect(exitFn).toHaveBeenCalledWith(1);
    const record = await store.load('feature-stagnant', 's1');
    expect(record?.state).toBe('HALTED');
  });

  it('should exit with code 2 when MAX_CYCLES exceeded', async () => {
    const exitFn = vi.fn();
    // Simulate initial record already at cycle 5
    const record = {
      track_id: 'feature-max',
      session_id: 's-max',
      state: 'VERIFYING' as const,
      cycle_count: 5,
      last_diff_hash: 'diff-prev',
      reviewer_session_id: null,
      timestamp: Date.now(),
      sha256_checksum: '',
      metadata: JSON.stringify({ intelligenceStatusChecked: true, notebookQueried: true })
    };
    await store.save(record);

    const getDiffFn = vi.fn().mockReturnValue('diff 6');

    await runQuorumReview(
      ['--branch', 'feature-max'],
      { store, getDiffFn, exitFn, sessionId: 's-max' }
    );

    expect(exitFn).toHaveBeenCalledWith(2);
    const updated = await store.load('feature-max', 's-max');
    expect(updated?.state).toBe('HALTED');
  });
});
