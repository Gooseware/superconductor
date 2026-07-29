import { describe, it, expect } from 'vitest';
import { ExecutionMode, NonInteractiveModeError } from '../../src/guard/execution-mode.js';

describe('ExecutionMode', () => {
  it('has exactly 3 values: INTERACTIVE, HEADLESS, BATCH_OVERNIGHT', () => {
    const values = Object.values(ExecutionMode);
    expect(values).toHaveLength(3);
    expect(values).toContain('INTERACTIVE');
    expect(values).toContain('HEADLESS');
    expect(values).toContain('BATCH_OVERNIGHT');
  });
});

describe('NonInteractiveModeError', () => {
  it('is an instance of Error', () => {
    const err = new NonInteractiveModeError(ExecutionMode.HEADLESS);
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct mode property', () => {
    const err = new NonInteractiveModeError(ExecutionMode.BATCH_OVERNIGHT);
    expect(err.mode).toBe(ExecutionMode.BATCH_OVERNIGHT);
  });

  it('has name === NonInteractiveModeError', () => {
    const err = new NonInteractiveModeError(ExecutionMode.HEADLESS, 'some context');
    expect(err.name).toBe('NonInteractiveModeError');
  });

  it('instanceof NonInteractiveModeError works correctly (prototype chain)', () => {
    const err = new NonInteractiveModeError(ExecutionMode.HEADLESS);
    expect(err).toBeInstanceOf(NonInteractiveModeError);
  });

  it('includes context in the message when provided', () => {
    const err = new NonInteractiveModeError(ExecutionMode.HEADLESS, 'user approval prompt');
    expect(err.message).toContain('user approval prompt');
    expect(err.message).toContain('HEADLESS');
  });

  it('message works without context', () => {
    const err = new NonInteractiveModeError(ExecutionMode.BATCH_OVERNIGHT);
    expect(err.message).toContain('BATCH_OVERNIGHT');
  });
});
