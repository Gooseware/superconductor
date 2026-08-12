import { test, expect, vi } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { runQuorumReview } from '../../scripts/quorum-review.js';
import { QuorumStateStore } from '../../packages/quorum-fsm/src/persistence/quorum-state-store.js';

vi.mock('../../packages/superconductor-core/dist/orchestration/preflight-gate.js', () => {
  return {
    PreflightGate: class {
      async check() { return { passed: true }; }
    }
  };
});

let diffCounter = 0;
const dbPath = path.join(os.tmpdir(), 'quorum_test_' + Date.now() + '.db');

vi.mock('node:child_process', () => {
  return {
    execFile: async (cmd: string, args: string[], callback: any) => {
      const { QuorumStateStore } = await import('../../packages/quorum-fsm/src/persistence/quorum-state-store.js');
      // The track_id and session_id should be extracted from args if possible, 
      // but we know them: 'test-track' and 'test-session'.
      const innerStore = new QuorumStateStore(dbPath);
      await innerStore.init();
      const record = await innerStore.load('test-track', 'test-session');
      if (record) {
        record.metadata = JSON.stringify({
          unresolvedFindings: []
        });
        await innerStore.save(record);
      }
      callback(null, { stdout: '', stderr: '' });
    },
    execFileSync: () => Buffer.from(`mock-diff-${diffCounter++}`)
  };
});

test('Quorum Loop - validates DB transition path to PASSED using runQuorumReview', async () => {
  const store = new QuorumStateStore(dbPath);
  await store.init();
  const trackId = 'test-track';
  const sessionId = 'test-session';

  await store.save({
    track_id: trackId,
    session_id: sessionId,
    state: 'REVIEWING',
    cycle_count: 0,
    last_diff_hash: null,
    reviewer_session_id: null,
    timestamp: Date.now(),
    sha256_checksum: ''
  });

  await runQuorumReview(['--branch', trackId], {
    store,
    sessionId,
    getDiffFn: () => `mock-diff-${diffCounter++}`,
    exitFn: (code) => { return undefined as never; }
  });

  const finalRecord = await store.load(trackId, sessionId);
  expect(finalRecord?.state).toBe('PASSED');
});
