import { describe, it, expect } from 'vitest';
import { ToolSurfaceFilter } from '../src/dispatcher/tool-surface-filter.js';
import { GitCheckpointManager } from '../src/safety/git-checkpoint-manager.js';
import { Engine } from '../src/engine.js';
import { DagNode } from '../src/types/index.js';

describe('Stateful Engine & Asymmetric Refinement Loop', () => {
  it('should deny write tool invocations when toolSurface is readonly', () => {
    const filter = new ToolSurfaceFilter();
    expect(filter.isAllowed('readonly', 'view_file')).toBe(true);
    expect(filter.isAllowed('readonly', 'write_to_file')).toBe(false);
    expect(filter.isAllowed('readonly', 'replace_file_content')).toBe(false);
    expect(filter.isAllowed('readonly', 'multi_replace_file_content')).toBe(false);
    expect(filter.isAllowed('readonly', 'run_command')).toBe(false);
  });

  it('should initialize and track TaskExecutionState in Engine', () => {
    const node: DagNode = {
      id: 'task-state-1',
      role: 'editor',
      tier: 3,
      status: 'pending',
      prompt: 'Test prompt'
    };

    const engine = new Engine({ nodes: { [node.id]: node }, edges: [] });
    const state = engine.initTaskState('track-1', node.id);

    expect(state.taskId).toBe('task-state-1');
    expect(state.iteration_count).toBe(0);
    expect(state.model_tier).toBe(3);
    expect(engine.getTaskState(node.id)).toBeDefined();
  });

  it('should create and verify git checkpoint manager API', () => {
    const manager = new GitCheckpointManager();
    expect(typeof manager.createCheckpoint).toBe('function');
    expect(typeof manager.rollbackToCheckpoint).toBe('function');
  });
});
