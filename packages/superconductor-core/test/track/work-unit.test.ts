import { describe, it, expect, beforeEach } from 'vitest';
import { WorkUnit, WorkUnitStateMachine, WorkUnitState } from '../../src/track/work-unit.js';

describe('WorkUnit & WorkUnitStateMachine', () => {
  it('should initialize a WorkUnit with required properties', () => {
    const wu: WorkUnit = {
      unitId: 'wu-123',
      domainScope: ['src/a.ts', 'src/b.ts'],
      spec: 'Update components to use new React 19 hooks',
      state: WorkUnitState.PENDING,
      implementorId: 'agent-1'
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
        implementorId: 'agent-2'
      };
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

    it('should transition to COMPLETED', () => {
      wu.state = WorkUnitState.IN_PROGRESS;
      const nextWu = stateMachine.transition(wu, WorkUnitState.COMPLETED);
      expect(nextWu.state).toBe(WorkUnitState.COMPLETED);
    });

    it('should throw an error for invalid transitions', () => {
      expect(() => {
        stateMachine.transition(wu, WorkUnitState.COMPLETED);
      }).toThrow(/Invalid state transition/);
    });
  });
});
