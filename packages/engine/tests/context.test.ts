import { describe, it, expect } from 'vitest';
import { buildContext } from '../src/context/builder';
import { DagNode } from '../src/types';

describe('context builder', () => {
  const mockTask: DagNode = {
    id: 'test-task-1',
    role: 'editor',
    tier: 3,
    status: 'pending',
    prompt: 'Implement a feature that does X',
    contextFiles: ['fileA.ts'],
  };

  const commonContext = '# Base Agent Context\nThis is AGENTS.md content.';

  it('Generates a system prompt section dynamically by extracting task constraints and variables', () => {
    const config = buildContext(mockTask, commonContext);
    
    // Check that it assembled SubagentConfig correctly
    expect(config.agentName).toBe('test-task-1');
    expect(config.role).toBe('editor');
    expect(config.tier).toBe(3);
    
    // Check prompt generation includes constraints/name/description/prompt
    expect(config.prompt).toContain('Task ID: test-task-1');
    expect(config.prompt).toContain('Role: editor');
    expect(config.prompt).toContain('Implement a feature that does X');
    expect(config.prompt).toContain('Context Files: fileA.ts');
  });

  it('Merges common context (like codebase wide AGENTS.md) correctly with task specific context', () => {
    const config = buildContext(mockTask, commonContext);
    expect(config.prompt).toContain(commonContext);
  });

  it('Collects file context limits and enforces standard max length', () => {
    const longPrompt = 'A'.repeat(200000);
    const longTask: DagNode = { ...mockTask, prompt: longPrompt };
    const config = buildContext(longTask, commonContext);
    
    // Expect it to be truncated or limited
    expect(config.prompt.length).toBeLessThanOrEqual(100000);
    expect(config.prompt).toContain('A'.repeat(50000)); // Should still contain a good chunk
  });
});
