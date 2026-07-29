import { expect, test, vi } from 'vitest';
import { ParallelDispatcher } from '../src/dispatcher/parallel-dispatcher.js';
import { DagNode } from '../src/types/dag.types.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';

test('ParallelDispatcher respects maxConcurrent limits and queues tasks', async () => {
  const dispatcher = new ParallelDispatcher(2);
  let activeExecutions = 0;
  let maxObserved = 0;
  let taskCompleters: (() => void)[] = [];

  // Mock lock manager
  dispatcher['lockManager'].acquireLock = vi.fn().mockResolvedValue(true);
  dispatcher['lockManager'].releaseLock = vi.fn().mockResolvedValue(true);

  // Mock simulateExecution to control when tasks finish
  dispatcher['simulateExecution'] = async (task: DagNode) => {
    activeExecutions++;
    if (activeExecutions > maxObserved) {
      maxObserved = activeExecutions;
    }
    return new Promise((resolve) => {
      taskCompleters.push(() => {
        activeExecutions--;
        resolve({
          agentId: 'sim-agent',
          status: 'success',
          output: 'done'
        });
      });
    });
  };

  const tasks: DagNode[] = [
    { id: '1', role: 'coder', prompt: 'test', dependencies: [] },
    { id: '2', role: 'coder', prompt: 'test', dependencies: [] },
    { id: '3', role: 'coder', prompt: 'test', dependencies: [] },
    { id: '4', role: 'coder', prompt: 'test', dependencies: [] },
  ];

  let resolvedCount = 0;
  const dispatchPromises = tasks.map(async t => {
    await dispatcher.dispatch(t);
    resolvedCount++;
  });

  // Flush microtasks to allow simulateExecution to be called
  await new Promise(process.nextTick);

  // Should immediately start first 2
  expect(dispatcher.activeAgents).toBe(2);
  expect(dispatcher.queueLength).toBe(2);
  expect(taskCompleters.length).toBe(2);
  expect(resolvedCount).toBe(0); // Ensure promises haven't resolved early
  
  // Complete first task
  taskCompleters[0]();
  await new Promise(process.nextTick);
  await new Promise(process.nextTick); // sometimes multiple ticks needed for promise chaining
  
  expect(dispatcher.activeAgents).toBe(2);
  expect(dispatcher.queueLength).toBe(1);
  expect(taskCompleters.length).toBe(3);
  expect(resolvedCount).toBe(1);

  // Complete second task
  taskCompleters[1]();
  await new Promise(process.nextTick);
  await new Promise(process.nextTick);

  expect(dispatcher.activeAgents).toBe(2);
  expect(dispatcher.queueLength).toBe(0);
  expect(taskCompleters.length).toBe(4);
  expect(resolvedCount).toBe(2);
  
  // Complete rest
  taskCompleters[2]();
  taskCompleters[3]();
  await Promise.all(dispatchPromises);
  
  expect(resolvedCount).toBe(4);
  expect(maxObserved).toBeLessThanOrEqual(2);
  expect(dispatcher.activeAgents).toBe(0);
});

test('ParallelDispatcher holds lock until WorkUnit reaches DONE via green quorum', async () => {
  const dispatcher = new ParallelDispatcher(2);
  let lockReleased = false;

  dispatcher['lockManager'].acquireLock = vi.fn().mockResolvedValue(true);
  dispatcher['lockManager'].releaseLock = vi.fn().mockImplementation(async () => {
    lockReleased = true;
    return true;
  });

  const task: DagNode = { id: 'test-lock-task', role: 'coder', prompt: 'test', dependencies: [] };
  
  dispatcher['simulateExecution'] = async (t: DagNode) => {
    dispatcher['agentToTaskId'].set('agent-lock', t.id);
    return { agentId: 'agent-lock', status: 'success', output: 'done' };
  };

  // Register a work unit so it can transition
  dispatcher.implementorRegistry.register('agent-lock', {
    unitId: 'wu-test',
    domainScope: ['src/a.ts'],
    spec: 'Test',
    state: WorkUnitState.IN_PROGRESS,
    implementorId: 'agent-lock',
    unitType: 'TASK'
  });

  await dispatcher.dispatch(task);

  // Execution is done, but lock should not be released yet
  expect(lockReleased).toBe(false);

  // When we handle the quorum with allGreen: true
  await dispatcher.handleQuorumResult('agent-lock', { allGreen: true });

  // Now the lock should be released
  expect(lockReleased).toBe(true);
  
  // The state should be DONE
  const wu = dispatcher.implementorRegistry.getWorkUnit('agent-lock');
  expect(wu?.state).toBe(WorkUnitState.DONE);
});
