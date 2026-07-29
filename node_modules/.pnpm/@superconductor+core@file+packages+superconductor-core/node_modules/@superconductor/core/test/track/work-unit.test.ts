import { describe, it, expect, beforeEach } from 'vitest';
import { WorkUnit, WorkUnitStateMachine, WorkUnitState, ConsensusArtifact } from '../../src/track/work-unit.js';

describe('WorkUnit & WorkUnitStateMachine', () => {
  it('should initialize a WorkUnit with required properties', () => {
    const wu: WorkUnit = {
      unitId: 'wu-123',
      domainScope: ['src/a.ts', 'src/b.ts'],
      spec: 'Update components to use new React 19 hooks',
      state: WorkUnitState.PENDING,
      implementorId: 'agent-1',
      unitType: 'TASK'
    };
    
    expect(wu.unitId).toBe('wu-123');
    expect(wu.domainScope).toEqual(['src/a.ts', 'src/b.ts']);
    expect(wu.spec).toBe('Update components to use new React 19 hooks');
    expect(wu.state).toBe(WorkUnitState.PENDING);
    expect(wu.implementorId).toBe('agent-1');
  });

  describe('WorkUnitStateMachine', () => {
    let stateMachine: WorkUnitStateMachine;
    let wu: WorkUnit;

    beforeEach(() => {
      stateMachine = new WorkUnitStateMachine();
      wu = {
        unitId: 'wu-1',
        domainScope: [],
        spec: 'Test',
        state: WorkUnitState.PENDING,
        implementorId: 'agent-2',
        unitType: 'TASK'
      };
    });


    it('should transition from PENDING to RESEARCHING', () => {
      const nextWu = stateMachine.transition(wu, WorkUnitState.RESEARCHING);
      expect(nextWu.state).toBe(WorkUnitState.RESEARCHING);
    });

    it('should transition from RESEARCHING to IN_PROGRESS', () => {
      const researchingWu = stateMachine.transition(wu, WorkUnitState.RESEARCHING);
      const nextWu = stateMachine.transition(researchingWu, WorkUnitState.IN_PROGRESS);
      expect(nextWu.state).toBe(WorkUnitState.IN_PROGRESS);
    });

    it('should transition from RESEARCHING to FAILED', () => {
      const researchingWu = stateMachine.transition(wu, WorkUnitState.RESEARCHING);
      const nextWu = stateMachine.transition(researchingWu, WorkUnitState.FAILED);
      expect(nextWu.state).toBe(WorkUnitState.FAILED);
    });

    it('should NOT transition from RESEARCHING to DONE', () => {
      const researchingWu = stateMachine.transition(wu, WorkUnitState.RESEARCHING);
      expect(() => {
        stateMachine.transition(researchingWu, WorkUnitState.DONE, { allGreen: true });
      }).toThrow(/Invalid state transition/);
    });

    it('should transition from PENDING to IN_PROGRESS', () => {
      const nextWu = stateMachine.transition(wu, WorkUnitState.IN_PROGRESS);
      expect(nextWu.state).toBe(WorkUnitState.IN_PROGRESS);
    });

    it('should transition from IN_PROGRESS to PAUSED', () => {
      wu.state = WorkUnitState.IN_PROGRESS;
      const nextWu = stateMachine.transition(wu, WorkUnitState.PAUSED);
      expect(nextWu.state).toBe(WorkUnitState.PAUSED);
    });

    it('should transition from PAUSED back to IN_PROGRESS', () => {
      wu.state = WorkUnitState.PAUSED;
      const nextWu = stateMachine.transition(wu, WorkUnitState.IN_PROGRESS);
      expect(nextWu.state).toBe(WorkUnitState.IN_PROGRESS);
    });

    it('should NOT transition to DONE without a green ConsensusArtifact', () => {
      wu.state = WorkUnitState.IN_PROGRESS;
      expect(() => {
        stateMachine.transition(wu, WorkUnitState.DONE);
      }).toThrow(/quorum/i); // or some specific error
      
      expect(() => {
        stateMachine.transition(wu, WorkUnitState.DONE, { allGreen: false });
      }).toThrow(/quorum/i);
    });

    it('should transition to DONE with a green ConsensusArtifact', () => {
      wu.state = WorkUnitState.IN_PROGRESS;
      const artifact: ConsensusArtifact = { allGreen: true };
      const nextWu = stateMachine.transition(wu, WorkUnitState.DONE, artifact);
      expect(nextWu.state).toBe(WorkUnitState.DONE);
      expect(nextWu.consensusArtifact).toBe(artifact);
    });

    it('should throw an error for invalid transitions', () => {
      expect(() => {
        stateMachine.transition(wu, WorkUnitState.DONE, { allGreen: true });
      }).toThrow(/Invalid state transition/);
    });
  });
});
