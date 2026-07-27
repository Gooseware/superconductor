export enum WorkUnitState {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface WorkUnit {
  unitId: string;
  domainScope: string[];
  spec: string;
  state: WorkUnitState;
  implementorId: string;
}

export class WorkUnitStateMachine {
  private allowedTransitions: Record<WorkUnitState, WorkUnitState[]> = {
    [WorkUnitState.PENDING]: [WorkUnitState.IN_PROGRESS],
    [WorkUnitState.IN_PROGRESS]: [WorkUnitState.PAUSED, WorkUnitState.COMPLETED, WorkUnitState.FAILED],
    [WorkUnitState.PAUSED]: [WorkUnitState.IN_PROGRESS, WorkUnitState.FAILED],
    [WorkUnitState.COMPLETED]: [],
    [WorkUnitState.FAILED]: [WorkUnitState.PENDING] // e.g. for retry
  };

  transition(wu: WorkUnit, nextState: WorkUnitState): WorkUnit {
    const allowed = this.allowedTransitions[wu.state];
    if (!allowed || !allowed.includes(nextState)) {
      throw new Error(`Invalid state transition from ${wu.state} to ${nextState}`);
    }
    
    return {
      ...wu,
      state: nextState
    };
  }
}
