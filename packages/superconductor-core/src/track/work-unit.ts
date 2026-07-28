export enum WorkUnitState {
  PENDING = 'PENDING',
  RESEARCHING = 'RESEARCHING',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  DONE = 'DONE',
  FAILED = 'FAILED'
}

export interface ConsensusArtifact<T = unknown> {
  allGreen: boolean;
  payload?: T;
  arbitrations?: Array<{ rule: 'Security' | 'Performance' | 'UX'; winner: string; rationale: string }>;
}

export interface WorkUnit<T = unknown> {
  unitId: string;
  domainScope: string[];
  spec: string;
  state: WorkUnitState;
  implementorId: string;
  researchContext?: any;
  consensusArtifact?: ConsensusArtifact<T>;
  reviewers?: string[];
}

export class WorkUnitStateMachine {
  private allowedTransitions: Record<WorkUnitState, WorkUnitState[]> = {
    [WorkUnitState.PENDING]: [WorkUnitState.RESEARCHING, WorkUnitState.IN_PROGRESS],
    [WorkUnitState.RESEARCHING]: [WorkUnitState.IN_PROGRESS, WorkUnitState.FAILED],
    [WorkUnitState.IN_PROGRESS]: [WorkUnitState.PAUSED, WorkUnitState.DONE, WorkUnitState.FAILED],
    [WorkUnitState.PAUSED]: [WorkUnitState.IN_PROGRESS, WorkUnitState.FAILED, WorkUnitState.DONE],
    [WorkUnitState.DONE]: [WorkUnitState.IN_PROGRESS, WorkUnitState.FAILED],
    [WorkUnitState.FAILED]: [WorkUnitState.PENDING, WorkUnitState.IN_PROGRESS] // e.g. for retry
  };

  transition<T = unknown>(wu: WorkUnit<T>, nextState: WorkUnitState, artifact?: ConsensusArtifact<T>): WorkUnit<T> {
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
