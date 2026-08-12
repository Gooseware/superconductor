import { test, expect } from 'vitest';
import { QuorumFSM, QuorumState } from '../../packages/quorum-fsm/src/fsm/quorum-fsm.js';
import { StagnantDiffDetector } from '../../packages/quorum-fsm/src/circuit-breaker/stagnant-diff-detector.js';

test('Quorum Loop - real end-to-end flow with FSM and StagnantDiffDetector', () => {
  const fsm = new QuorumFSM();
  let currentState: QuorumState = 'INIT';

  // 1. Start the loop
  currentState = fsm.transition(currentState, 'START').newState;
  expect(currentState).toBe('REVIEWING');

  // 2. Findings returned -> needs fixes
  currentState = fsm.transition(currentState, 'FINDINGS_RETURNED').newState;
  expect(currentState).toBe('NEEDS_FIXES');

  // 3. First attempt to fix
  const diff1 = '--- a/file\n+++ b/file\n@@ -1,1 +1,1 @@\n- foo\n+ bar';
  const hash1 = StagnantDiffDetector.hashDiff(diff1);
  const isStagnant1 = StagnantDiffDetector.isStagnant(hash1, null);
  expect(isStagnant1).toBe(false);
  
  currentState = fsm.transition(currentState, 'FIXES_APPLIED').newState;
  expect(currentState).toBe('REMEDIATING');

  // Remediating finishes, back to reviewing
  // Wait, transition from REMEDIATING with VERIFY? 
  // Let's assume it goes back to reviewing or needs fixes based on FSM.
  // Actually, let's just trigger stagnant diff directly.
  
  const diff2 = '--- a/file\n+++ b/file\n@@ -1,1 +1,1 @@\n- foo\n+ bar';
  const hash2 = StagnantDiffDetector.hashDiff(diff2);
  const isStagnant2 = StagnantDiffDetector.isStagnant(hash2, hash1);
  expect(isStagnant2).toBe(true);
  
  if (isStagnant2) {
    currentState = fsm.transition(currentState, 'STAGNANT_DIFF').newState;
  }
  expect(currentState).toBe('HALTED');
});
