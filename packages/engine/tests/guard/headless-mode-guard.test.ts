import { describe, it, expect, vi, afterEach } from 'vitest';
import { ExecutionMode, NonInteractiveModeError } from '../../src/guard/execution-mode.js';
import { HeadlessModeGuard, createHeadlessModeGuard } from '../../src/guard/headless-mode-guard.js';
import { SwarmPermissionEvaluator } from '../../src/cli/swarm-permission-evaluator.js';

describe('HeadlessModeGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('assertInteractiveAllowed() in INTERACTIVE mode does NOT throw', () => {
    const guard = new HeadlessModeGuard(ExecutionMode.INTERACTIVE);
    expect(() => guard.assertInteractiveAllowed('some prompt')).not.toThrow();
  });

  it('assertInteractiveAllowed() in HEADLESS mode throws NonInteractiveModeError', () => {
    const guard = new HeadlessModeGuard(ExecutionMode.HEADLESS);
    expect(() => guard.assertInteractiveAllowed('some prompt')).toThrow(NonInteractiveModeError);
  });

  it('assertInteractiveAllowed() in BATCH_OVERNIGHT mode throws NonInteractiveModeError', () => {
    const guard = new HeadlessModeGuard(ExecutionMode.BATCH_OVERNIGHT);
    expect(() => guard.assertInteractiveAllowed('overnight prompt')).toThrow(NonInteractiveModeError);
  });

  it('FATAL call in HEADLESS mode writes to process.stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const guard = new HeadlessModeGuard(ExecutionMode.HEADLESS);
    expect(() => guard.assertInteractiveAllowed('fatal prompt', true)).toThrow(NonInteractiveModeError);
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain('fatal prompt');
  });

  it('{ notifyOnFatal: false, stderrOnFatal: false } suppresses side effects in FATAL call', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const guard = new HeadlessModeGuard(ExecutionMode.HEADLESS, { notifyOnFatal: false, stderrOnFatal: false });
    expect(() => guard.assertInteractiveAllowed('silent fatal', true)).toThrow(NonInteractiveModeError);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('thrown error has correct mode property matching the guard mode', () => {
    const guard = new HeadlessModeGuard(ExecutionMode.HEADLESS);
    let caughtErr: NonInteractiveModeError | undefined;
    try {
      guard.assertInteractiveAllowed('test context');
    } catch (e) {
      caughtErr = e as NonInteractiveModeError;
    }
    expect(caughtErr).toBeInstanceOf(NonInteractiveModeError);
    expect(caughtErr!.mode).toBe(ExecutionMode.HEADLESS);
  });

  it('thrown error from BATCH_OVERNIGHT has correct mode', () => {
    const guard = new HeadlessModeGuard(ExecutionMode.BATCH_OVERNIGHT);
    let caughtErr: NonInteractiveModeError | undefined;
    try {
      guard.assertInteractiveAllowed('batch ctx');
    } catch (e) {
      caughtErr = e as NonInteractiveModeError;
    }
    expect(caughtErr!.mode).toBe(ExecutionMode.BATCH_OVERNIGHT);
  });

  // SEC-1: Shell metacharacters in context must NOT cause shell execution.
  // notify-send has been REMOVED from the guard entirely — notifications now go
  // through attention-notifier.ts only for high-attention events.
  // notifyOnFatal is a deprecated no-op retained for interface backward compat.
  it('SEC-1: FATAL call in headless mode throws NonInteractiveModeError — no shell execution (notify-send removed from guard)', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const maliciousContext = '$(rm -rf /)';
    // notifyOnFatal is now a no-op — the guard never calls notify-send or any shell.
    // Verify the guard still throws NonInteractiveModeError correctly.
    const guard = new HeadlessModeGuard(ExecutionMode.HEADLESS, { notifyOnFatal: true, stderrOnFatal: false });
    expect(() => guard.assertInteractiveAllowed(maliciousContext, true)).toThrow(NonInteractiveModeError);
  });

  // ADV-2: createHeadlessModeGuard factory
  describe('createHeadlessModeGuard', () => {
    it('ADV-2: with a HEADLESS evaluator returns a guard that throws NonInteractiveModeError', () => {
      const evaluator = new SwarmPermissionEvaluator('/nonexistent/path', { headless: true });
      const guard = createHeadlessModeGuard(evaluator);
      expect(() => guard.assertInteractiveAllowed('test')).toThrow(NonInteractiveModeError);
    });

    it('ADV-2: with an INTERACTIVE evaluator returns a guard that does NOT throw', () => {
      const savedCI = process.env.CI;
      delete process.env.CI;
      try {
        const evaluator = new SwarmPermissionEvaluator('/nonexistent/path', { headless: false });
        const guard = createHeadlessModeGuard(evaluator);
        expect(() => guard.assertInteractiveAllowed('test')).not.toThrow();
      } finally {
        if (savedCI !== undefined) process.env.CI = savedCI;
      }
    });
  });
});
