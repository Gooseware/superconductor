import { describe, it, expect } from 'vitest';
import {
  QuorumFSM,
  QuorumState,
  QuorumEvent,
  InvalidTransitionError,
} from '../src/fsm/quorum-fsm.js';

describe('Quorum Remediation Loop (FSM transitions & circuit breaker)', () => {
  const fsm = new QuorumFSM();

  it('executes full auto-remediation loop: Quorum → NEEDS_FIXES → Remediation → VERIFYING → PASSED (all green)', () => {
    // Initial state
    let state: QuorumState = 'INIT';
    expect(fsm.isTerminal(state)).toBe(false);

    // Cycle 1: Start review
    state = fsm.transition(state, 'START').newState;
    expect(state).toBe('REVIEWING');

    // Reviewer returns findings
    state = fsm.transition(state, 'FINDINGS_RETURNED').newState;
    expect(state).toBe('NEEDS_FIXES');
    expect(fsm.canRemediate(state)).toBe(true);

    // Remediation started / dispatched
    state = fsm.transition(state, 'START_REMEDIATION').newState;
    expect(state).toBe('REMEDIATING');

    // Fixes applied -> trigger verification re-review
    state = fsm.transition(state, 'RE_REVIEW').newState;
    expect(state).toBe('VERIFYING');
    expect(fsm.isVerifying(state)).toBe(true);

    // Re-review 1: Still has remaining findings
    state = fsm.transition(state, 'FINDINGS_RETURNED').newState;
    expect(state).toBe('NEEDS_FIXES');

    // Remediation 2: Dispatched
    state = fsm.transition(state, 'FIXES_APPLIED').newState;
    expect(state).toBe('REMEDIATING');

    // Fixes applied -> verifying
    state = fsm.transition(state, 'FIXES_APPLIED').newState;
    expect(state).toBe('VERIFYING');

    // Re-review 2: All findings resolved (all green)
    state = fsm.transition(state, 'ALL_PASSED').newState;
    expect(state).toBe('PASSED');
    expect(fsm.isTerminal(state)).toBe(true);
  });

  it('stops immediately when review is all green on first pass', () => {
    let state: QuorumState = 'INIT';
    state = fsm.transition(state, 'START').newState;
    expect(state).toBe('REVIEWING');

    state = fsm.transition(state, 'ALL_PASSED').newState;
    expect(state).toBe('PASSED');
    expect(fsm.isTerminal(state)).toBe(true);
  });

  it('trips circuit breaker when MAX_CYCLES_EXCEEDED (3-5 cycles)', () => {
    let state: QuorumState = 'INIT';
    state = fsm.transition(state, 'START').newState;

    // Simulate 4 cycles of failed fixes
    for (let cycle = 1; cycle <= 4; cycle++) {
      state = fsm.transition(state, 'FINDINGS_RETURNED').newState;
      expect(state).toBe('NEEDS_FIXES');
      state = fsm.transition(state, 'START_REMEDIATION').newState;
      expect(state).toBe('REMEDIATING');
      state = fsm.transition(state, 'RE_REVIEW').newState;
      expect(state).toBe('VERIFYING');
    }

    // On 5th cycle, circuit breaker trips
    state = fsm.transition(state, 'MAX_CYCLES_EXCEEDED').newState;
    expect(state).toBe('HALTED');
    expect(fsm.isTerminal(state)).toBe(true);
  });

  it('trips circuit breaker and escalates to Deep Research / HALTED on repeated stall', () => {
    let state: QuorumState = 'REMEDIATING';
    state = fsm.transition(state, 'DEEP_RESEARCH').newState;
    expect(state).toBe('HALTED');
    expect(fsm.isTerminal(state)).toBe(true);

    let state2: QuorumState = 'NEEDS_FIXES';
    state2 = fsm.transition(state2, 'ESCALATE').newState;
    expect(state2).toBe('HALTED');
  });

  it('trips circuit breaker immediately on STAGNANT_DIFF', () => {
    let state: QuorumState = 'VERIFYING';
    state = fsm.transition(state, 'STAGNANT_DIFF').newState;
    expect(state).toBe('HALTED');
    expect(fsm.isTerminal(state)).toBe(true);
  });

  it('throws InvalidTransitionError on disallowed state transitions', () => {
    expect(() => fsm.transition('INIT', 'FIXES_APPLIED')).toThrow(InvalidTransitionError);
    expect(() => fsm.transition('PASSED', 'START')).toThrow(InvalidTransitionError);
    expect(() => fsm.transition('HALTED', 'ALL_PASSED')).toThrow(InvalidTransitionError);
  });
});
