import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  });

  it('generates deterministic SHA-256 sign key', () => {
    const ts = 1700000000000;
    const key1 = SignOffGate.generateSignKey(sessionId, trackId, ts);
    const key2 = SignOffGate.generateSignKey(sessionId, trackId, ts);
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[a-f0-9]{64}$/);
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
});
