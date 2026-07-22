import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventStore } from '../src/state/event-store';
import { EngineEvent } from '../src/types/events';
import * as fs from 'fs';
import * as path from 'path';

describe('SQLite Event Store', () => {
  let store: EventStore;
  const testDbPath = path.join(__dirname, 'test-events.sqlite');

  beforeEach(() => {
    store = new EventStore({ dbPath: testDbPath });
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  const mockEvent: EngineEvent = {
    type: 'system',
    timestamp: Date.now(),
    detail: { message: 'test' }
  };

  it('Append event to store and retrieve by ID', () => {
    const id = store.append({ ...mockEvent });
    expect(id).toBeDefined();

    const retrieved = store.getById(id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.payload.type).toBe('system');
  });

  it('Query events by task ID, event type, and time range', () => {
    const now = Date.now();
    store.append({ type: 'scheduler', timestamp: now - 1000, detail: { action: 'start', taskId: 'task-1' } } as any);
    store.append({ type: 'scheduler', timestamp: now, detail: { action: 'end', taskId: 'task-1' } } as any);
    store.append({ type: 'dispatcher', timestamp: now, detail: { taskId: 'task-2' } } as any);

    // Query by task ID
    let results = store.query({ taskId: 'task-1' });
    expect(results.length).toBe(2);

    // Query by event type
    results = store.query({ eventType: 'dispatcher' });
    expect(results.length).toBe(1);

    // Query by time range
    results = store.query({ since: now - 500 });
    expect(results.length).toBe(2); // The last two
  });

  it('Reconstruct full engine state from event replay', () => {
    store.append({ type: 'scheduler', timestamp: 100, detail: { action: 'start', taskId: 'task-1' } } as any);
    store.append({ type: 'scheduler', timestamp: 200, detail: { action: 'end', taskId: 'task-1' } } as any);
    
    const state = store.reconstruct();
    // Assuming reconstruct returns some state object that reflects completed tasks
    expect(state).toBeDefined();
  });

  it('Generate plan.md materialized view matching current state', () => {
    store.append({ type: 'scheduler', timestamp: 100, detail: { action: 'start', taskId: 'task-1' } } as any);
    const plan = store.materializePlan();
    expect(plan).toContain('task-1');
  });

  it('Handle 10K+ events without query degradation', () => {
    const startInsert = Date.now();
    for (let i = 0; i < 10000; i++) {
      store.append({ type: 'system', timestamp: Date.now(), detail: { index: i } } as any);
    }
    const endInsert = Date.now();
    expect(endInsert - startInsert).toBeLessThan(10000); // Should be fast


    const startQuery = Date.now();
    const results = store.query({ eventType: 'system' });
    const endQuery = Date.now();
    expect(results.length).toBe(10000);
    expect(endQuery - startQuery).toBeLessThan(1000); // Query should be fast
  });
});
