import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine.js';
import { DagNode } from '../src/types/index.js';
import { buildContext, resolveSymbols } from '../src/context/builder.js';

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

  it('should persist task state transitions in EventStore', async () => {
    const node: DagNode = {
      id: 'task-event-1',
      role: 'editor',
      tier: 1,
      status: 'pending',
      prompt: 'Test event store'
    };

    const engine = new Engine({ nodes: { [node.id]: node }, edges: [] });
    await engine.execute();

    const events = engine.eventStore.query({ taskId: 'task-event-1' });
    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.eventType === 'state')).toBe(true);
  });

  it('should inject diff payload in buildContext for reviewer role', () => {
    const reviewerNode: DagNode = {
      id: 'task-rev-diff',
      role: 'reviewer',
      tier: 3,
      status: 'pending',
      prompt: 'Perform review',
      contextFiles: ['packages/engine/src/engine.ts']
    };

    const config = buildContext(reviewerNode, '');
    expect(config.prompt).toContain('--- Diff Payload ---');
  });

  it('should resolve symbols in resolveSymbols', async () => {
    const res = await resolveSymbols([{ file: 'packages/engine/src/engine.ts', symbol: 'Engine' }]);
    expect(res).toContain('Symbol Context');
    expect(res).toContain('Engine');
  });

  it('should throw tool surface violation when a readonly node attempts write_to_file', async () => {
    const node: DagNode = {
      id: 'task-readonly-violator',
      role: 'reviewer',
      tier: 2,
      status: 'pending',
      prompt: 'Attempting write_to_file'
    };

    const engine = new Engine({ nodes: { [node.id]: node }, edges: [] });
    const result = await engine.execute();
    expect(result.success).toBe(false);
  });
});
