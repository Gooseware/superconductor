import { describe, it, expect, vi } from 'vitest';
import { Scheduler } from '../src/scheduler/scheduler.js';
import { TaskGraph, DagNode } from '../src/types/dag.types.js';
import { SchedulerEvent } from '../src/types/scheduler.types.js';

const createNode = (id: string, dependsOn: string[] = []): DagNode => ({
  id,
  role: 'editor',
  tier: 1,
  status: 'pending',
  prompt: 'Task ' + id,
  dependsOn,
});

const createGraph = (nodes: DagNode[]): TaskGraph => {
  const nodeMap: Record<string, DagNode> = {};
  nodes.forEach(n => nodeMap[n.id] = n);
  
  // Note: we might not strictly need edges array populated if the scheduler uses dependsOn or vice-versa,
  // but to be complete let's populate edges based on dependsOn
  const edges = [];
  for (const n of nodes) {
    for (const dep of (n.dependsOn || [])) {
      edges.push({ from: dep, to: n.id });
    }
  }

  return { nodes: nodeMap, edges };
};

describe('Scheduler', () => {
  it('Empty graph returns empty batch', () => {
    const graph = createGraph([]);
    const scheduler = new Scheduler(graph);
    expect(scheduler.nextBatch().tasks).toEqual([]);
  });

  it('Single-node graph works correctly', () => {
    const nodeA = createNode('A');
    const graph = createGraph([nodeA]);
    const scheduler = new Scheduler(graph);
    
    const batch1 = scheduler.nextBatch();
    expect(batch1.tasks.map(t => t.id)).toEqual(['A']);
    
    scheduler.completeTask('A');
    
    const batch2 = scheduler.nextBatch();
    expect(batch2.tasks).toEqual([]);
  });

  it('nextBatch() returns root tasks (no dependencies) first', () => {
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C', ['A']);
    const graph = createGraph([nodeA, nodeB, nodeC]);
    
    const scheduler = new Scheduler(graph);
    const batch = scheduler.nextBatch();
    
    const ids = batch.tasks.map(t => t.id).sort();
    expect(ids).toEqual(['A', 'B']);
  });

  it('Sequential dependencies are respected (B depends on A -> B not in batch until A completes)', () => {
    const nodeA = createNode('A');
    const nodeB = createNode('B', ['A']);
    const graph = createGraph([nodeA, nodeB]);
    
    const scheduler = new Scheduler(graph);
    
    let batch = scheduler.nextBatch();
    expect(batch.tasks.map(t => t.id)).toEqual(['A']);
    
    // B shouldn't be returned yet if we call nextBatch again
    batch = scheduler.nextBatch();
    expect(batch.tasks).toEqual([]); 

    scheduler.completeTask('A');
    
    batch = scheduler.nextBatch();
    expect(batch.tasks.map(t => t.id)).toEqual(['B']);
  });

  it('nextBatch() returns maximal parallel set after completing a task', () => {
    const nodeA = createNode('A');
    const nodeB = createNode('B', ['A']);
    const nodeC = createNode('C', ['A']);
    const nodeD = createNode('D', ['B']);
    const graph = createGraph([nodeA, nodeB, nodeC, nodeD]);
    
    const scheduler = new Scheduler(graph);
    
    scheduler.nextBatch(); // returns A
    scheduler.completeTask('A');
    
    const batch = scheduler.nextBatch();
    const ids = batch.tasks.map(t => t.id).sort();
    expect(ids).toEqual(['B', 'C']); // Maximal parallel set
  });

  it('Diamond dependency pattern resolves correctly (D depends on B and C, both depend on A)', () => {
    const nodeA = createNode('A');
    const nodeB = createNode('B', ['A']);
    const nodeC = createNode('C', ['A']);
    const nodeD = createNode('D', ['B', 'C']);
    const graph = createGraph([nodeA, nodeB, nodeC, nodeD]);
    
    const scheduler = new Scheduler(graph);
    
    // A starts
    let batch = scheduler.nextBatch();
    expect(batch.tasks.map(t => t.id)).toEqual(['A']);
    
    scheduler.completeTask('A');
    
    // B and C start
    batch = scheduler.nextBatch();
    expect(batch.tasks.map(t => t.id).sort()).toEqual(['B', 'C']);
    
    scheduler.completeTask('B');
    
    // D should not start yet because C is not complete
    batch = scheduler.nextBatch();
    expect(batch.tasks).toEqual([]);
    
    scheduler.completeTask('C');
    
    // Now D starts
    batch = scheduler.nextBatch();
    expect(batch.tasks.map(t => t.id)).toEqual(['D']);
  });

  it('Task failure propagation marks all downstream dependents as blocked', () => {
    const nodeA = createNode('A');
    const nodeB = createNode('B', ['A']);
    const nodeC = createNode('C', ['B']);
    const nodeD = createNode('D', ['A']); // Independent of B's failure path
    const graph = createGraph([nodeA, nodeB, nodeC, nodeD]);
    
    const events: SchedulerEvent[] = [];
    const scheduler = new Scheduler(graph, (e) => events.push(e));
    
    // Complete A
    scheduler.nextBatch();
    scheduler.completeTask('A');
    
    // B and D are now ready
    const batch2 = scheduler.nextBatch();
    expect(batch2.tasks.map(t => t.id).sort()).toEqual(['B', 'D']);
    
    // Fail B
    scheduler.failTask('B');
    
    // C should be marked as blocked
    expect(graph.nodes['C'].status).toBe('blocked');
    expect(graph.nodes['B'].status).toBe('failed');
    
    // D should still be available or already running (it was returned in batch2)
    // Next batch shouldn't contain C
    const batch3 = scheduler.nextBatch();
    expect(batch3.tasks).toEqual([]);
    
    // Check if task_failed event is emitted
    expect(events).toContainEqual(expect.objectContaining({ type: 'task_failed' }));
  });
  
  it('Emits correct SchedulerEvents on transitions', () => {
    const nodeA = createNode('A');
    const graph = createGraph([nodeA]);
    
    const events: SchedulerEvent[] = [];
    const scheduler = new Scheduler(graph, (e) => events.push(e));
    
    scheduler.nextBatch();
    expect(events).toContainEqual({ type: 'batch_ready', payload: { tasks: [nodeA] } });
    
    scheduler.completeTask('A');
    expect(events).toContainEqual({ type: 'task_completed', payload: { taskId: 'A' } });
    
    // Assuming nextBatch emits workflow_finished when nothing is left and active is 0
    scheduler.nextBatch();
    expect(events).toContainEqual({ type: 'workflow_finished' });
  });
});
