export type QuorumState =
  | 'INIT'
  | 'REVIEWING'
  | 'NEEDS_FIXES'
  | 'REMEDIATING'
  | 'VERIFYING'
  | 'PASSED'
  | 'HALTED'
  | 'ESCALATED';

export type QuorumEvent =
  | 'START'
  | 'FINDINGS_RETURNED'
  | 'ALL_PASSED'
  | 'FIXES_APPLIED'
  | 'START_REMEDIATION'
  | 'REMEDIATE'
  | 'RE_REVIEW'
  | 'MAX_CYCLES_EXCEEDED'
  | 'STAGNANT_DIFF'
  | 'ESCALATE'
  | 'DEEP_RESEARCH';

export class InvalidTransitionError extends Error {
  constructor(public readonly currentState: QuorumState, public readonly event: QuorumEvent) {
    super(`Invalid transition from state '${currentState}' with event '${event}'`);
    this.name = 'InvalidTransitionError';
  }
}

export class QuorumFSM {
  public transition(currentState: QuorumState, event: QuorumEvent): { newState: QuorumState } {
    if (event === 'MAX_CYCLES_EXCEEDED' || event === 'STAGNANT_DIFF' || event === 'ESCALATE' || event === 'DEEP_RESEARCH') {
      return { newState: 'HALTED' };
    }

    switch (currentState) {
      case 'INIT':
        if (event === 'START') return { newState: 'REVIEWING' };
        break;
      case 'REVIEWING':
        if (event === 'FINDINGS_RETURNED') return { newState: 'NEEDS_FIXES' };
        if (event === 'ALL_PASSED') return { newState: 'PASSED' };
        break;
      case 'NEEDS_FIXES':
        if (event === 'FIXES_APPLIED' || event === 'START_REMEDIATION' || event === 'REMEDIATE') {
          return { newState: 'REMEDIATING' };
        }
        break;
      case 'REMEDIATING':
        if (event === 'FIXES_APPLIED' || event === 'RE_REVIEW') {
          return { newState: 'VERIFYING' };
        }
        break;
      case 'VERIFYING':
        if (event === 'ALL_PASSED') return { newState: 'PASSED' };
        if (event === 'FINDINGS_RETURNED') return { newState: 'NEEDS_FIXES' };
        break;
      case 'PASSED':
      case 'HALTED':
      case 'ESCALATED':
        break;
    }

    throw new InvalidTransitionError(currentState, event);
  }

  public isTerminal(state: QuorumState): boolean {
    return state === 'PASSED' || state === 'HALTED' || state === 'ESCALATED';
  }

  public canRemediate(state: QuorumState): boolean {
    return state === 'NEEDS_FIXES';
  }

  public isVerifying(state: QuorumState): boolean {
    return state === 'VERIFYING';
  }
}

