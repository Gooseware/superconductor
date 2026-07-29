import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cp from 'child_process';

// Mock child_process before module import so the module picks up the mock
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof cp>();
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

import { notifyVerificationRequired, notifyRemediationLimitExceeded } from '../../src/cli/attention-notifier.js';

describe('attention-notifier', () => {
  let execSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execSpy = vi.mocked(cp.execFileSync);
    execSpy.mockReset();
    execSpy.mockReturnValue(Buffer.from(''));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('notifyVerificationRequired calls notify-send with sanitized body', () => {
    notifyVerificationRequired('track-123', 'Build the login page');
    expect(execSpy).toHaveBeenCalledOnce();
    expect(execSpy).toHaveBeenCalledWith(
      'notify-send',
      ['🔔 Superconductor: Action Required', expect.stringContaining('track-123')],
      expect.objectContaining({ stdio: 'ignore' })
    );
  });

  it('notifyRemediationLimitExceeded calls notify-send with iteration count', () => {
    notifyRemediationLimitExceeded('track-456', 7);
    expect(execSpy).toHaveBeenCalledOnce();
    const args = execSpy.mock.calls[0][1] as string[];
    expect(args[0]).toBe('⚠️ Superconductor: Needs Triage');
    expect(args[1]).toContain('track-456');
    expect(args[1]).toContain('7');
  });

  it('sanitizes shell metacharacters from body', () => {
    notifyVerificationRequired('track-123', '$(rm -rf /)');
    const args = execSpy.mock.calls[0][1] as string[];
    expect(args[1]).not.toContain('$');
    expect(args[1]).not.toContain('(');
    expect(args[1]).not.toContain(')');
  });

  it('truncates body to 120 characters maximum', () => {
    const longSpec = 'A'.repeat(200);
    notifyVerificationRequired('track-123', longSpec);
    const args = execSpy.mock.calls[0][1] as string[];
    // Body is the sanitized+truncated spec embedded in a larger string, but
    // the full second arg must not exceed MAX_BODY_LENGTH after sanitization
    expect(args[1].length).toBeLessThanOrEqual(120);
  });

  it('silently ignores when notify-send is not available', () => {
    execSpy.mockImplementation(() => { throw new Error('spawn notify-send ENOENT'); });
    expect(() => notifyRemediationLimitExceeded('track-123', 5)).not.toThrow();
  });

  it('silently ignores when notify-send throws a non-Error', () => {
    execSpy.mockImplementation(() => { throw 'unexpected string error'; });
    expect(() => notifyVerificationRequired('track-xyz', 'some spec')).not.toThrow();
  });
});
