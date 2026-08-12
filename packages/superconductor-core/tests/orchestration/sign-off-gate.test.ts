import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SignOffGate, SignOffRequiredError } from '../../src/orchestration/sign-off-gate.js';
import { GateContext } from '../../src/orchestration/abstract-gate.js';

describe('SignOffGate', () => {
  const trackId = 'test-track-signoff';
  const sessionId = 'test-session-signoff';

  beforeEach(() => {
    SignOffGate.clearInMemory();
  });

  afterEach(() => {
    SignOffGate.clearInMemory();
    const files = [
      path.resolve(`superconductor/quorum/signoff_${trackId}.json`),
      path.resolve(`superconductor/quorum/signoff_test-check-gate.json`),
      path.resolve(`superconductor/quorum/signoff_unapproved-track.json`),
    ];
    for (const f of files) {
      if (fs.existsSync(f)) {
        fs.rmSync(f, { force: true });
      }
    }
    vi.restoreAllMocks();
  });

  it('generates deterministic SHA-256 sign key', () => {
    const ts = 1700000000000;
    process.env.SIGN_OFF_SECRET = 'test-secret';
    const key1 = SignOffGate.generateSignKey(sessionId, trackId, ts);
    const key2 = SignOffGate.generateSignKey(sessionId, trackId, ts);
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('falls back to dev-secret if SIGN_OFF_SECRET is not set', () => {
    const originalSecret = process.env.SIGN_OFF_SECRET;
    delete process.env.SIGN_OFF_SECRET;
    const key = SignOffGate.generateSignKey(sessionId, trackId, 1700000000);
    expect(typeof key).toBe('string');
    if (originalSecret) process.env.SIGN_OFF_SECRET = originalSecret;
  });

  it('returns false for isApproved when no sign_off_record exists', async () => {
    const approved = await SignOffGate.isApproved(trackId, sessionId);
    expect(approved).toBe(false);
  });

  it('returns true for isApproved when valid sign_off_record exists', async () => {
    const ts = Date.now();
    await SignOffGate.recordSignOff(trackId, sessionId, ts, 'oracle-conv-123');
    const approved = await SignOffGate.isApproved(trackId, sessionId);
    expect(approved).toBe(true);
  });

  it('check() returns passed false when not approved and passed true when approved', async () => {
    const gate = new SignOffGate();
    const context: GateContext = { trackId: 'test-check-gate', sessionId: 'test-sess' };

    let res = await gate.check(context);
    expect(res.passed).toBe(false);
    expect(res.reason).toContain('Sign-off not yet recorded');

    await SignOffGate.recordSignOff('test-check-gate', 'test-sess', Date.now());
    res = await gate.check(context);
    expect(res.passed).toBe(true);
  });

  it('assert() throws SignOffRequiredError on failure', async () => {
    const gate = new SignOffGate();
    const context: GateContext = { trackId: 'unapproved-track', sessionId: 'unapproved-sess' };
    await expect(gate.assert(context)).rejects.toThrow(SignOffRequiredError);
  });

  it('returns passed true for --no-signoff bypass', async () => {
    process.env.SUPERCONDUCTOR_FLAGS = '--no-signoff';
    const oldStdoutIsTTY = process.stdout.isTTY;
    const oldStdinIsTTY = process.stdin.isTTY;
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    try {
      const gate = new SignOffGate();
      const context: GateContext = { trackId: 'test-track', sessionId: 'test-sess' };
      const res = await gate.check(context);
      expect(res.passed).toBe(true);
      expect(res.reason).toContain('Bypassed via --no-signoff');
    } finally {
      process.stdout.isTTY = oldStdoutIsTTY;
      process.stdin.isTTY = oldStdinIsTTY;
      delete process.env.SUPERCONDUCTOR_FLAGS;
    }
  });

  it('returns passed false for interactive mode', async () => {
    process.env.SUPERCONDUCTOR_INTERACTIVE = 'true';
    try {
      const gate = new SignOffGate();
      const context: GateContext = { trackId: 'test-track', sessionId: 'test-sess' };
      const askUserSpy = vi.spyOn(gate, 'askUser').mockRejectedValue(new Error('ask_user'));
      const res = await gate.check(context);
      expect(res.passed).toBe(false);
      expect(res.reason).toBe('ask_user');
      expect(askUserSpy).toHaveBeenCalledWith(context);
    } finally {
      delete process.env.SUPERCONDUCTOR_INTERACTIVE;
    }
  });

  it('returns passed false for headless mode and sets pending_merge', async () => {
    process.env.SUPERCONDUCTOR_HEADLESS = 'true';
    try {
      const mockStore = { saveSignOffRecord: vi.fn() };
      const gate = new SignOffGate(mockStore);
      const context: GateContext = { trackId: 'test-track', sessionId: 'test-sess' };
      const res = await gate.check(context);
      expect(res.passed).toBe(false);
      expect(res.reason).toBe('pending_merge: true');
      expect(mockStore.saveSignOffRecord).toHaveBeenCalledWith('test-track', 'test-sess', { pending_merge: true });
    } finally {
      delete process.env.SUPERCONDUCTOR_HEADLESS;
    }
  });
});
