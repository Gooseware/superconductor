import { describe, it, expect } from 'vitest';
import { buildContext } from '../src/context/builder';
import { DagNode } from '../src/types';

describe('context builder', () => {
  const mockTask: DagNode = {
    id: 'test-task-1',
    name: 'Context Test Task',
    description: 'This is a test task for building context',
    role: 'editor',
    tier: 3,
    status: 'pending',
    prompt: 'Implement a feature that does X',
    contextFiles: ['fileA.ts'],
    constraints: ['Must follow TDD', 'Must be fast'],
    variables: { API_KEY: 'test-key', URL: 'http://localhost' }
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
    expect(config.prompt).toContain('Name: Context Test Task');
    expect(config.prompt).toContain('Description: This is a test task for building context');
    expect(config.prompt).toContain('Role: editor');
    expect(config.prompt).toContain('Constraints:\n- Must follow TDD\n- Must be fast');
    expect(config.prompt).toContain('Variables:\n- API_KEY: test-key\n- URL: http://localhost');
    expect(config.prompt).toContain('Implement a feature that does X');
    expect(config.prompt).toContain('Context Files: fileA.ts');
  });

  it('Merges common context (like codebase wide AGENTS.md) correctly with task specific context', () => {
    const config = buildContext(mockTask, commonContext);
    expect(config.prompt).toContain(commonContext);
  });

  it('Collects file context limits and enforces standard max length by truncating task prompt, keeping commonContext intact', () => {
    const longPrompt = 'A'.repeat(200000);
    const longTask: DagNode = { ...mockTask, prompt: longPrompt };
    const longCommonContext = 'B'.repeat(1000);
    const config = buildContext(longTask, longCommonContext);
    
    // Expect it to be truncated or limited
    expect(config.prompt.length).toBeLessThanOrEqual(100000);
    // Should still contain a good chunk of task prompt
    expect(config.prompt).toContain('A'.repeat(50000));
    // Most importantly, the common context should be fully intact
    expect(config.prompt).toContain(longCommonContext);
  });

  it('Handles undefined/falsy values gracefully', () => {
    const minimalTask: DagNode = {
      id: '',
      role: '' as any,
      tier: 1,
      status: 'pending',
      prompt: ''
    };
    const config = buildContext(minimalTask, '');
    
    expect(config.agentName).toBe('unknown');
    expect(config.role).toBe('unknown');
    expect(config.prompt).not.toContain('undefined');
  });
});
