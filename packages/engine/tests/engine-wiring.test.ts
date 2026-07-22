import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine.js';
import { DagNode } from '../src/types/index.js';

describe('Engine Integration Wiring (Swarm Excellence Safety Systems)', () => {
  it('should initialize checkpoint, DoD level, and toolFilter for reviewer nodes', async () => {
    const reviewerNode: DagNode = {
      id: 'task-rev-1',
      role: 'reviewer',
      tier: 3,
      status: 'pending',
      prompt: 'Review PR code',
      contextFiles: ['src/auth/login.ts']
    };

    const engine = new Engine({ nodes: { [reviewerNode.id]: reviewerNode }, edges: [] });
    await engine.execute();

    const state = engine.getTaskState('task-rev-1');
    expect(state).toBeDefined();
    expect(state?.checkpointSha).toBeDefined();
    expect(state?.dodLevel).toBe(4); // Classified as Level 4 due to /auth/
    expect(reviewerNode.toolSurface).toBe('readonly');
  });

  it('should trigger model escalation and update task state on failure signal', async () => {
    const node: DagNode = {
      id: 'task-fail-1',
      role: 'editor',
      tier: 2,
      status: 'pending',
      prompt: 'Fail me'
    };

    const engine = new Engine({ nodes: { [node.id]: node }, edges: [] });
    const result = await engine.execute();
    
    expect(result.success).toBe(false);
    const state = engine.getTaskState('task-fail-1');
    expect(state).toBeDefined();
    expect(state?.iteration_count).toBeGreaterThan(0);
  });
});
