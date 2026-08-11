import { describe, it, expect } from 'vitest';
import {
  QuorumFSM,
  QuorumState,
  QuorumEvent,
  InvalidTransitionError,
} from '../src/fsm/quorum-fsm.js';

describe('QuorumFSM', () => {
  const fsm = new QuorumFSM();

  it('should handle INIT + START -> REVIEWING', () => {
    const res = fsm.transition('INIT', 'START');
    expect(res.newState).toBe('REVIEWING');
  });

  it('should handle REVIEWING transitions', () => {
    expect(fsm.transition('REVIEWING', 'FINDINGS_RETURNED').newState).toBe('NEEDS_FIXES');
    expect(fsm.transition('REVIEWING', 'ALL_PASSED').newState).toBe('PASSED');
  });

  it('should handle NEEDS_FIXES + FIXES_APPLIED -> REMEDIATING', () => {
    expect(fsm.transition('NEEDS_FIXES', 'FIXES_APPLIED').newState).toBe('REMEDIATING');
  });

  it('should handle REMEDIATING + FIXES_APPLIED -> VERIFYING', () => {
    expect(fsm.transition('REMEDIATING', 'FIXES_APPLIED').newState).toBe('VERIFYING');
  });

  it('should handle VERIFYING transitions', () => {
    expect(fsm.transition('VERIFYING', 'ALL_PASSED').newState).toBe('PASSED');
    expect(fsm.transition('VERIFYING', 'FINDINGS_RETURNED').newState).toBe('NEEDS_FIXES');
  });

  it('should handle wildcard HALTED transitions for MAX_CYCLES_EXCEEDED and STAGNANT_DIFF', () => {
    const states: QuorumState[] = ['INIT', 'REVIEWING', 'NEEDS_FIXES', 'REMEDIATING', 'VERIFYING'];
    for (const state of states) {
      expect(fsm.transition(state, 'MAX_CYCLES_EXCEEDED').newState).toBe('HALTED');
      expect(fsm.transition(state, 'STAGNANT_DIFF').newState).toBe('HALTED');
    }
  });

  it('should throw InvalidTransitionError for illegal transitions', () => {
    expect(() => fsm.transition('INIT', 'ALL_PASSED')).toThrow(InvalidTransitionError);
    expect(() => fsm.transition('PASSED', 'START')).toThrow(InvalidTransitionError);
    expect(() => fsm.transition('HALTED', 'FIXES_APPLIED')).toThrow(InvalidTransitionError);
  });
});
