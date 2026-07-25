import { expect, test, vi } from 'vitest';
import { ParallelDispatcher } from '../src/dispatcher/parallel-dispatcher.js';
import { DagNode } from '../src/types/dag.types.js';

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

  const dispatchPromises = tasks.map(t => dispatcher.dispatch(t));

  // Allow promises to resolve
  await new Promise(r => setTimeout(r, 50));

  // Should immediately start first 2
  expect(dispatcher.activeAgents).toBe(2);
  expect(dispatcher.queueLength).toBe(2);
  expect(taskCompleters.length).toBe(2);
  
  // Complete first task
  taskCompleters[0]();
  await new Promise(r => setTimeout(r, 50));
  
  expect(dispatcher.activeAgents).toBe(2);
  expect(dispatcher.queueLength).toBe(1);
  expect(taskCompleters.length).toBe(3);

  // Complete second task
  taskCompleters[1]();
  await new Promise(r => setTimeout(r, 50));

  expect(dispatcher.activeAgents).toBe(2);
  expect(dispatcher.queueLength).toBe(0);
  expect(taskCompleters.length).toBe(4);
  
  // Complete rest
  taskCompleters[2]();
  taskCompleters[3]();
  await Promise.all(dispatchPromises);
  await new Promise(r => setTimeout(r, 50));
  
  expect(maxObserved).toBeLessThanOrEqual(2);
  expect(dispatcher.activeAgents).toBe(0);
});
