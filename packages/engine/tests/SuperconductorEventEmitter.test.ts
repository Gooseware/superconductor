import { describe, it, expect, vi } from 'vitest';
import { SuperconductorEventEmitter } from '../src/events/SuperconductorEventEmitter.js';
import type { AgentTurnEvent } from '../src/types/shared-schema.js';

describe('SuperconductorEventEmitter', () => {
  const sampleEvent: AgentTurnEvent = {
    id: 'evt_100',
    eventType: 'task_completed',
    sessionId: 'sess_abc',
    trackId: 'track_123',
    phase: 'Phase 2',
    taskDescription: 'Implement CacheManager',
    modelUsed: 'gemini-2.5-pro',
    taskType: 'feature',
    success: true,
    timestamp: new Date().toISOString()
  };

  it('silently returns false when endpoint is down/unreachable', async () => {
    const emitter = new SuperconductorEventEmitter({ caduceusApiUrl: 'http://localhost:19999', timeoutMs: 100 });
    const success = await emitter.emit(sampleEvent);
    expect(success).toBe(false);
  });

  it('returns true when endpoint succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202
    });

    const emitter = new SuperconductorEventEmitter({ caduceusApiUrl: 'http://localhost:1691' });
    const success = await emitter.emit(sampleEvent);
    expect(success).toBe(true);
  });
});
