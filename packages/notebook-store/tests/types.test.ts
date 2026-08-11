import { describe, it, expect } from 'vitest';
import { NOTE_AUTHORITY, NOTE_STORE } from '../src/types.js';

describe('NotebookStore Types & Mappings', () => {
  it('should map note types to correct authority levels', () => {
    expect(NOTE_AUTHORITY.preference).toBe('authoritative');
    expect(NOTE_AUTHORITY.design).toBe('authoritative');
    expect(NOTE_AUTHORITY.quorum).toBe('system');
    expect(NOTE_AUTHORITY.style).toBe('system');
    expect(NOTE_AUTHORITY.spec).toBe('agent');
    expect(NOTE_AUTHORITY.failure).toBe('agent');
    expect(NOTE_AUTHORITY.dependency).toBe('agent');
    expect(NOTE_AUTHORITY.procedure).toBe('agent');
    expect(NOTE_AUTHORITY.warning).toBe('agent');
  });

  it('should map note types to global or project store routing', () => {
    expect(NOTE_STORE.preference).toBe('global');
    expect(NOTE_STORE.design).toBe('global');
    expect(NOTE_STORE.style).toBe('global');
    expect(NOTE_STORE.procedure).toBe('global');
    expect(NOTE_STORE.quorum).toBe('project');
    expect(NOTE_STORE.failure).toBe('project');
    expect(NOTE_STORE.dependency).toBe('project');
    expect(NOTE_STORE.warning).toBe('project');
    expect(NOTE_STORE.spec).toBe('project');
  });
});
