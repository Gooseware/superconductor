import { describe, it, expect } from 'vitest';
import { generateDag } from '../src/generator/generator';

describe('DAG Generator', () => {
  const mockSpec = '# Specification\nMock spec content.';
  const mockPlan = '# Plan\nMock plan content.';

  it('transforms spec.md and plan.md strings into a structured multi-task TaskGraph output', async () => {
    const graph = await generateDag(mockSpec, mockPlan);
    
    expect(graph).toBeDefined();
    expect(graph.nodes).toBeDefined();
    expect(graph.edges).toBeDefined();
    
    // Verify it generates multiple tasks
    const nodeIds = Object.keys(graph.nodes);
    expect(nodeIds.length).toBeGreaterThan(1);
    
    // Verify node structure matches DagNode interface
    const firstNode = graph.nodes[nodeIds[0]];
    expect(firstNode.id).toBeDefined();
    expect(firstNode.role).toBeDefined();
    expect(firstNode.tier).toBeDefined();
    expect(firstNode.status).toBe('pending');
    expect(firstNode.prompt).toBeDefined();
  });

  it('generates parallel paths when tasks are independent', async () => {
    const graph = await generateDag(mockSpec, mockPlan);
    
    // We expect the mock to generate a graph where 'task2' and 'task3' are parallel
    // Both should depend on 'task1' but not on each other.
    const task2 = graph.nodes['task2'];
    const task3 = graph.nodes['task3'];
    
    expect(task2).toBeDefined();
    expect(task3).toBeDefined();
    
    const task2Deps = task2.dependsOn || [];
    const task3Deps = task3.dependsOn || [];
    
    expect(task2Deps).toContain('task1');
    expect(task3Deps).toContain('task1');
    
    // Verify they don't depend on each other (parallel execution)
    expect(task2Deps).not.toContain('task3');
    expect(task3Deps).not.toContain('task2');
  });

  it('applies correct Tier assignment logic based on sub-task complexity', async () => {
    const graph = await generateDag(mockSpec, mockPlan);
    
    // We expect the mock to assign Tier 3 to a complex task (e.g. task1) 
    // and Tier 4 to simpler sub-tasks (e.g. task2, task3)
    const task1 = graph.nodes['task1'];
    const task2 = graph.nodes['task2'];
    
    expect(task1.tier).toBe(3); // More complex task -> Tier 3
    expect(task2.tier).toBe(4); // Simpler sub-task -> Tier 4
  });
});
