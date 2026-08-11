import { describe, it, expect } from 'vitest';
import { QuorumFSM } from '../../../quorum-fsm/src/index.js';

describe('QuorumFSM (core integration)', () => {
  it('should initialize and transition states correctly', () => {
    const fsm = new QuorumFSM();
    const res = fsm.transition('INIT', 'START');
    expect(res.newState).toBe('REVIEWING');
  });

  it('should transition to HALTED on MAX_CYCLES_EXCEEDED', () => {
    const fsm = new QuorumFSM();
    const res = fsm.transition('REVIEWING', 'MAX_CYCLES_EXCEEDED');
    expect(res.newState).toBe('HALTED');
  });

  it('should transition to HALTED on STAGNANT_DIFF', () => {
    const fsm = new QuorumFSM();
    const res = fsm.transition('REMEDIATING', 'STAGNANT_DIFF');
    expect(res.newState).toBe('HALTED');
  });
});
