export enum WorkUnitState {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  DONE = 'DONE',
  FAILED = 'FAILED'
}

export interface ConsensusArtifact {
  allGreen: boolean;
  [key: string]: any;
}

export interface WorkUnit {
  unitId: string;
  domainScope: string[];
  spec: string;
  state: WorkUnitState;
  implementorId: string;
  consensusArtifact?: ConsensusArtifact;
}

export class WorkUnitStateMachine {
  private allowedTransitions: Record<WorkUnitState, WorkUnitState[]> = {
    [WorkUnitState.PENDING]: [WorkUnitState.IN_PROGRESS],
    [WorkUnitState.IN_PROGRESS]: [WorkUnitState.PAUSED, WorkUnitState.DONE, WorkUnitState.FAILED],
    [WorkUnitState.PAUSED]: [WorkUnitState.IN_PROGRESS, WorkUnitState.FAILED],
    [WorkUnitState.DONE]: [WorkUnitState.IN_PROGRESS, WorkUnitState.FAILED],
    [WorkUnitState.FAILED]: [WorkUnitState.PENDING, WorkUnitState.IN_PROGRESS] // e.g. for retry
  };

  transition(wu: WorkUnit, nextState: WorkUnitState, artifact?: ConsensusArtifact): WorkUnit {
    const allowed = this.allowedTransitions[wu.state];
    if (!allowed || !allowed.includes(nextState)) {
      throw new Error(`Invalid state transition from ${wu.state} to ${nextState}`);
    }
    
    if (nextState === WorkUnitState.DONE) {
      if (!artifact || !artifact.allGreen) {
        throw new Error("Quorum gate failed: Cannot transition to DONE without a ConsensusArtifact with allGreen: true");
      }
      return {
        ...wu,
        state: nextState,
        consensusArtifact: artifact
      };
    }
    
    return {
      ...wu,
      state: nextState
    };
  }
}
