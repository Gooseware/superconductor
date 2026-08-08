import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BiasIsolatedReviewGate, ReviewerSpawner } from './bias-isolated-review-gate';

describe('BiasIsolatedReviewGate', () => {
  let mockSpawner: { spawn: any };
  let gate: BiasIsolatedReviewGate;

  beforeEach(() => {
    mockSpawner = {
      spawn: vi.fn().mockResolvedValue('test-agent-id-123')
    };
    gate = new BiasIsolatedReviewGate(mockSpawner as unknown as ReviewerSpawner);
  });

  it('produces new conversation IDs (not reusing prior IDs)', async () => {
    mockSpawner.spawn.mockResolvedValueOnce('agent-1').mockResolvedValueOnce('agent-2');
    
    const promise1 = gate.evaluate({ id: '1', severity: 'HIGH', ruleId: 'rule1', file: 'a.js' }, 'diff1', 'preflight1');
    const promise2 = gate.evaluate({ id: '2', severity: 'LOW', ruleId: 'rule2', file: 'b.js' }, 'diff2', 'preflight2');
    
    await new Promise(r => setTimeout(r, 0));
    gate.handleResponse('agent-1', '```json:review-findings\n{"status":"RESOLVED"}\n```');
    gate.handleResponse('agent-2', '```json:review-findings\n{"status":"RESOLVED"}\n```');
    
    await promise1;
    await promise2;
    
    expect(mockSpawner.spawn).toHaveBeenCalledTimes(2);
  });

  it('strips prior reviewer reasoning text from context', async () => {
    const p = gate.evaluate({ id: '1', severity: 'HIGH', ruleId: 'rule1', file: 'a.js', priorReasoning: 'This was a bad fix' } as any, 'diff', 'preflight');
    await new Promise(r => setTimeout(r, 0));
    gate.handleResponse('test-agent-id-123', '```json:review-findings\n{"status":"RESOLVED"}\n```');
    await p;

    const spawnCall = mockSpawner.spawn.mock.calls[0][0];
    expect(spawnCall.fingerprint.priorReasoning).toBeUndefined();
  });

  it('contains finding fingerprint (severity, ruleId, file)', async () => {
    const p = gate.evaluate({ id: '1', severity: 'HIGH', ruleId: 'rule1', file: 'a.js' }, 'diff', 'preflight');
    await new Promise(r => setTimeout(r, 0));
    gate.handleResponse('test-agent-id-123', '```json:review-findings\n{"status":"RESOLVED"}\n```');
    await p;

    const spawnCall = mockSpawner.spawn.mock.calls[0][0];
    expect(spawnCall.fingerprint.severity).toBe('HIGH');
    expect(spawnCall.fingerprint.ruleId).toBe('rule1');
    expect(spawnCall.fingerprint.file).toBe('a.js');
    expect(spawnCall.fingerprint.id).toBe('1');
  });

  it('contains git diff string and preflight output', async () => {
    const p = gate.evaluate({ id: '1', severity: 'HIGH', ruleId: 'rule1', file: 'a.js' }, 'git diff my_file', 'preflight ok');
    await new Promise(r => setTimeout(r, 0));
    gate.handleResponse('test-agent-id-123', '```json:review-findings\n{"status":"RESOLVED"}\n```');
    await p;

    const spawnCall = mockSpawner.spawn.mock.calls[0][0];
    expect(spawnCall.diff).toBe('git diff my_file');
    expect(spawnCall.preflightOutput).toBe('preflight ok');
  });

  it('does not contain full finding description/prose', async () => {
    const p = gate.evaluate({ id: '1', severity: 'HIGH', ruleId: 'rule1', file: 'a.js', description: 'Long prose describing issue' } as any, 'diff', 'preflight');
    await new Promise(r => setTimeout(r, 0));
    gate.handleResponse('test-agent-id-123', '```json:review-findings\n{"status":"RESOLVED"}\n```');
    await p;

    const spawnCall = mockSpawner.spawn.mock.calls[0][0];
    expect(spawnCall.fingerprint.description).toBeUndefined();
  });

  it('verifies senderID before accepting verdict (ignores mismatch)', async () => {
    const p = gate.evaluate({ id: '1', severity: 'HIGH', ruleId: 'rule1', file: 'a.js' }, 'diff', 'preflight');
    await new Promise(r => setTimeout(r, 0));
    
    // Call with wrong sender ID
    expect(() => gate.handleResponse('wrong-agent', '```json:review-findings\n{"status":"RESOLVED"}\n```')).toThrowError('Unknown SenderID');
    
    // Call with correct sender ID
    gate.handleResponse('test-agent-id-123', '```json:review-findings\n{"status":"RESOLVED"}\n```');
    const result = await p;
    expect(result.status).toBe('RESOLVED');
  });

  it('returns RESOLVED status when reviewer emits status: RESOLVED', async () => {
    const p = gate.evaluate({ id: '1', severity: 'HIGH', ruleId: 'rule1', file: 'a.js' }, 'diff', 'preflight');
    await new Promise(r => setTimeout(r, 0));
    gate.handleResponse('test-agent-id-123', '```json:review-findings\n{"status": "RESOLVED"}\n```');
    const result = await p;
    expect(result.status).toBe('RESOLVED');
    expect(result.findings).toEqual([]);
    expect(result.senderId).toBe('test-agent-id-123');
  });

  it('returns UNRESOLVED status when reviewer emits findings', async () => {
    const p = gate.evaluate({ id: '1', severity: 'HIGH', ruleId: 'rule1', file: 'a.js' }, 'diff', 'preflight');
    await new Promise(r => setTimeout(r, 0));
    gate.handleResponse('test-agent-id-123', '```json:review-findings\n{"findings": [{"file": "a.js", "description": "still failing", "ruleId": "rule1"}]}\n```');
    const result = await p;
    expect(result.status).toBe('UNRESOLVED');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toBe('still failing');
    expect(result.senderId).toBe('test-agent-id-123');
  });
});
