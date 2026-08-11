import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AbstractGate, GateContext, GateResult, GateError } from '../../src/orchestration/abstract-gate';
import fs from 'fs';
import path from 'path';

// Mock fs to intercept log writes
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      appendFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    }
  };
});

class TestGateError extends GateError {
  constructor(message: string) {
    super(message);
    this.name = 'TestGateError';
  }
}

class TestGate extends AbstractGate {
  public gateName = 'TestGate';
  public checkResult: GateResult = { passed: true };

  protected createError(message: string): GateError {
    return new TestGateError(message);
  }

  async check(context: GateContext): Promise<GateResult> {
    return this.checkResult;
  }
}

describe('AbstractGate', () => {
  let gate: TestGate;

  beforeEach(() => {
    gate = new TestGate();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should pass if check returns passed: true', async () => {
    gate.checkResult = { passed: true };
    const context: GateContext = { trackId: 'track-123', sessionId: 'session-123' };

    await expect(gate.assert(context)).resolves.toBeUndefined();

    // Verify audit log
    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    const logCall = vi.mocked(fs.appendFileSync).mock.calls[0];
    const logPath = logCall[0] as string;
    const logMessage = logCall[1] as string;
    
    expect(logPath).toContain(path.normalize('superconductor/logs/gate-audit.log'));
    expect(logMessage).toBe('[2026-08-12T12:00:00.000Z] [TestGate] trackId=track-123 result=PASS\n');
  });

  it('should throw typed error and log failure if check returns passed: false', async () => {
    gate.checkResult = { passed: false, reason: 'Failed for test reasons' };
    const context: GateContext = { trackId: 'track-456', sessionId: 'session-456' };

    await expect(gate.assert(context)).rejects.toThrow(TestGateError);
    await expect(gate.assert(context)).rejects.toThrow('Failed for test reasons');

    // Verify audit log (called twice because assert is called twice in expect)
    expect(fs.appendFileSync).toHaveBeenCalledTimes(2);
    const logCall = vi.mocked(fs.appendFileSync).mock.calls[0];
    const logPath = logCall[0] as string;
    const logMessage = logCall[1] as string;
    
    expect(logPath).toContain(path.normalize('superconductor/logs/gate-audit.log'));
    expect(logMessage).toBe('[2026-08-12T12:00:00.000Z] [TestGate] trackId=track-456 result=FAIL reason=Failed for test reasons\n');
  });

  it('should log FAIL if check throws an unexpected error', async () => {
    const error = new Error('Unexpected crash');
    vi.spyOn(gate, 'check').mockRejectedValue(error);
    
    const context: GateContext = { trackId: 'track-789', sessionId: 'session-789' };

    await expect(gate.assert(context)).rejects.toThrow(TestGateError);
    await expect(gate.assert(context)).rejects.toThrow('Unexpected error in TestGate: Unexpected crash');

    expect(fs.appendFileSync).toHaveBeenCalled();
    const logCall = vi.mocked(fs.appendFileSync).mock.calls[0];
    const logMessage = logCall[1] as string;
    
    expect(logMessage).toBe('[2026-08-12T12:00:00.000Z] [TestGate] trackId=track-789 result=FAIL reason=Unexpected error in TestGate: Unexpected crash\n');
  });
});
