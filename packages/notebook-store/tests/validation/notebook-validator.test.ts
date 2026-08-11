import { describe, it, expect, beforeEach } from 'vitest';
import {
  NotebookValidator,
  ValidationError,
  UnauthorizedNoteError,
  AuthorityError,
  RateLimitError,
} from '../../src/validation/notebook-validator.js';
import { NotebookEntry } from '../../src/types.js';

describe('NotebookValidator', () => {
  beforeEach(() => {
    NotebookValidator.resetRateLimits();
  });

  const baseEntry: Omit<NotebookEntry, 'id' | 'timestamp'> = {
    session_id: 'sess-1',
    track_id: 'track-1',
    agent_role: 'superconductor-processor',
    domain: 'core',
    files: ['src/index.ts'],
    note_type: 'spec',
    content: 'Valid spec note',
    severity: 'info',
  };

  it('validates content length <= 280 chars', () => {
    const validContent = 'a'.repeat(280);
    expect(() =>
      NotebookValidator.validate({ ...baseEntry, content: validContent })
    ).not.toThrow();

    const invalidContent = 'a'.repeat(281);
    expect(() =>
      NotebookValidator.validate({ ...baseEntry, content: invalidContent })
    ).toThrow(ValidationError);
  });

  it('requires reviewer_token for quorum and style notes', () => {
    expect(() =>
      NotebookValidator.validate({ ...baseEntry, note_type: 'quorum' })
    ).toThrow(UnauthorizedNoteError);

    expect(() =>
      NotebookValidator.validate({ ...baseEntry, note_type: 'style' })
    ).toThrow(UnauthorizedNoteError);

    expect(() =>
      NotebookValidator.validate({
        ...baseEntry,
        note_type: 'quorum',
        reviewer_token: 'rev-token-123',
      })
    ).not.toThrow();

    expect(() =>
      NotebookValidator.validate({
        ...baseEntry,
        note_type: 'style',
        reviewer_token: 'rev-token-123',
      })
    ).not.toThrow();
  });

  it('requires user_confirmed for preference and design notes', () => {
    expect(() =>
      NotebookValidator.validate({ ...baseEntry, note_type: 'preference' })
    ).toThrow(AuthorityError);

    expect(() =>
      NotebookValidator.validate({ ...baseEntry, note_type: 'design' })
    ).toThrow(AuthorityError);

    expect(() =>
      NotebookValidator.validate(
        { ...baseEntry, note_type: 'preference' },
        { user_confirmed: true }
      )
    ).not.toThrow();

    expect(() =>
      NotebookValidator.validate(
        { ...baseEntry, note_type: 'design' },
        { user_confirmed: true }
      )
    ).not.toThrow();
  });

  it('enforces rate limit of max 3 AGENT-authority notes per invocation_id', () => {
    const invocationId = 'inv-123';
    const agentNote: Omit<NotebookEntry, 'id' | 'timestamp'> = {
      ...baseEntry,
      note_type: 'spec', // AGENT authority
    };

    // 1st note
    expect(() =>
      NotebookValidator.validate(agentNote, { invocation_id: invocationId })
    ).not.toThrow();

    // 2nd note
    expect(() =>
      NotebookValidator.validate(agentNote, { invocation_id: invocationId })
    ).not.toThrow();

    // 3rd note
    expect(() =>
      NotebookValidator.validate(agentNote, { invocation_id: invocationId })
    ).not.toThrow();

    // 4th note -> throws RateLimitError
    expect(() =>
      NotebookValidator.validate(agentNote, { invocation_id: invocationId })
    ).toThrow(RateLimitError);
  });
});
