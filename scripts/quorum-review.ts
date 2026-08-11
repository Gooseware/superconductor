#!/usr/bin/env node
// Usage: node scripts/quorum-review.ts --branch <b> [--codebase] [--fast] [--remediate] [--no-signoff]

import { parseArgs } from 'node:util';
import * as child_process from 'node:child_process';
import { QuorumFSM } from '../packages/quorum-fsm/src/fsm/quorum-fsm.js';
import { QuorumStateStore } from '../packages/quorum-fsm/src/persistence/quorum-state-store.js';
import { StagnantDiffDetector } from '../packages/quorum-fsm/src/circuit-breaker/stagnant-diff-detector.js';

const MAX_CYCLES = 5;

export interface RunQuorumOptions {
  store?: QuorumStateStore;
  fsm?: QuorumFSM;
  getDiffFn?: (branch?: string) => string;
  exitFn?: (code: number) => never | void;
  sessionId?: string;
}

export async function runQuorumReview(rawArgs: string[], options: RunQuorumOptions = {}) {
  const { values } = parseArgs({
    args: rawArgs,
    options: {
      branch: { type: 'string' },
      codebase: { type: 'boolean' },
      fast: { type: 'boolean' },
      remediate: { type: 'boolean' },
      'no-signoff': { type: 'boolean' },
    },
  });

  const track_id = values.branch || 'codebase';
  const session_id = options.sessionId || Date.now().toString();
  const store = options.store || new QuorumStateStore();
  const fsm = options.fsm || new QuorumFSM();
  const exit = options.exitFn || ((code: number) => process.exit(code));
  const defaultGetDiff = (branchName?: string) => {
    try {
      return child_process.execFileSync('git', ['diff', `main..${branchName || 'HEAD'}`]).toString();
    } catch {
      return '';
    }
  };
  const getDiff = options.getDiffFn || defaultGetDiff;

  let record = await store.load(track_id, session_id);
  if (!record) {
    record = {
      track_id,
      session_id,
      state: 'INIT',
      cycle_count: 0,
      last_diff_hash: null,
      reviewer_session_id: null,
      timestamp: Date.now(),
      sha256_checksum: '',
    };
  }

  if (record.cycle_count >= MAX_CYCLES) {
    record.state = fsm.transition(record.state, 'MAX_CYCLES_EXCEEDED').newState;
    await store.save(record);
    console.error(`[QuorumFSM] MAX_CYCLES (${MAX_CYCLES}) exceeded. Escalating to Oracle.`);
    return exit(2);
  }

  if (record.state === 'INIT') {
    record.state = fsm.transition(record.state, 'START').newState;
    await store.save(record);
    console.log(`[QuorumFSM] State: ${record.state} | Cycle: ${record.cycle_count}/${MAX_CYCLES}`);
  }

  // In --fast mode: single pass, no loop
  if (values.fast) {
    console.log('[QuorumFSM] Fast mode: single pass, no quorum loop.');
    return;
  }

  // Main quorum loop (max MAX_CYCLES)
  while (record.state !== 'PASSED' && record.state !== 'HALTED' && record.cycle_count < MAX_CYCLES) {
    const diff = getDiff(values.branch);
    const diffHash = StagnantDiffDetector.hashDiff(diff);

    // Check stagnant diff
    if (StagnantDiffDetector.isStagnant(diffHash, record.last_diff_hash)) {
      console.error('[QuorumFSM] STAGNANT_DIFF detected: remediation produced identical diff. Halting.');
      record.state = fsm.transition(record.state, 'STAGNANT_DIFF').newState;
      await store.save(record);
      return exit(1);
    }

    record.last_diff_hash = diffHash;
    record.cycle_count++;
    await store.save(record);

    console.log(`[QuorumFSM] Cycle ${record.cycle_count}: reviewing diff (hash: ${diffHash.slice(0, 8)}...)`);
    console.log(`[QuorumFSM] State persisted. Orchestrator should dispatch reviewer for cycle ${record.cycle_count}.`);
    break; // Orchestrator re-invokes this script after each reviewer cycle
  }

  if (record.cycle_count >= MAX_CYCLES && record.state !== 'PASSED') {
    record.state = fsm.transition(record.state, 'MAX_CYCLES_EXCEEDED').newState;
    await store.save(record);
    console.error(`[QuorumFSM] MAX_CYCLES (${MAX_CYCLES}) exceeded. Escalating to Oracle.`);
    return exit(2);
  }

  console.log(`[QuorumFSM] Final state: ${record.state}`);
}

if (process.argv[1] && process.argv[1].endsWith('quorum-review.ts')) {
  runQuorumReview(process.argv.slice(2)).catch(console.error);
}
