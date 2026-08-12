import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  QuorumFSM,
  StagnantDiffDetector,
  QuorumStateStore,
  QuorumStateRecord,
} from '../../../quorum-fsm/src/index.js';

describe('Quorum loop state transitions', () => {
  it('simulates full quorum loop state transition to PASSED', () => {
    const fsm = new QuorumFSM();
    let state = fsm.transition('INIT', 'START').newState;
    expect(state).toBe('REVIEWING');

    state = fsm.transition(state, 'FINDINGS_RETURNED').newState;
    expect(state).toBe('NEEDS_FIXES');

    state = fsm.transition(state, 'FIXES_APPLIED').newState;
    expect(state).toBe('REMEDIATING');

    state = fsm.transition(state, 'FIXES_APPLIED').newState;
    expect(state).toBe('VERIFYING');

    state = fsm.transition(state, 'ALL_PASSED').newState;
    expect(state).toBe('PASSED');
  });
});

describe('STAGNANT_DIFF circuit breaker', () => {
  it('detects stagnant diff when hash is identical and returns false for different inputs', () => {
    const diffA = 'diff --git a/src/index.ts b/src/index.ts\n+const a = 1;';
    const diffB = 'diff --git a/src/index.ts b/src/index.ts\n+const a = 2;';

    const hash1 = StagnantDiffDetector.hashDiff(diffA);
    const hash1Again = StagnantDiffDetector.hashDiff(diffA);
    const hash2 = StagnantDiffDetector.hashDiff(diffB);

    expect(StagnantDiffDetector.isStagnant(hash1, hash1Again)).toBe(true);
    expect(StagnantDiffDetector.isStagnant(hash1, hash2)).toBe(false);
  });
});

describe('MAX_CYCLES halts', () => {
  let tmpDir: string;
  let dbPath: string;
  let store: QuorumStateStore;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quorum-e2e-test-'));
    dbPath = path.join(tmpDir, 'quorum.db');
    store = new QuorumStateStore(dbPath);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('halts execution when cycle_count is 5 and MAX_CYCLES_EXCEEDED event occurs', async () => {
    const fsm = new QuorumFSM();
    const record: QuorumStateRecord = {
      track_id: 'e2e-track',
      session_id: 'e2e-session',
      state: 'REVIEWING',
      cycle_count: 5,
      last_diff_hash: null,
      reviewer_session_id: null,
      timestamp: Date.now(),
      sha256_checksum: '',
    };

    record.state = fsm.transition(record.state, 'MAX_CYCLES_EXCEEDED').newState;
    await store.save(record);

    const loaded = await store.load('e2e-track', 'e2e-session');
    expect(loaded).not.toBeNull();
    expect(loaded?.cycle_count).toBe(5);
    expect(loaded?.state).toBe('HALTED');
  });
});
