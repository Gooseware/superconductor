/**
 * mock-agent-spawner.test.ts — Phase 5 TDD tests for MockAgentSpawner
 */
import { describe, it, expect } from 'vitest';
import { MockAgentSpawner } from '../../src/cli/mock-agent-spawner.js';
import type { SpawnedAgent } from '../../src/cli/agent-spawner.js';

describe('MockAgentSpawner', () => {
  // ── callCount ────────────────────────────────────────────────────────────

  it('callCount reflects number of spawn() calls', async () => {
    const mock = new MockAgentSpawner();
    expect(mock.callCount).toBe(0);

    await mock.spawn({ role: 'role-a', prompt: 'p1' });
    expect(mock.callCount).toBe(1);

    await mock.spawn({ role: 'role-b', prompt: 'p2' });
    expect(mock.callCount).toBe(2);

    await mock.spawn({ role: 'role-c', prompt: 'p3' });
    expect(mock.callCount).toBe(3);
  });

  // ── Response queue ───────────────────────────────────────────────────────

  it('response queue returns scripted responses in order', async () => {
    const scripted: SpawnedAgent[] = [
      { conversationId: 'first', synthetic: false },
      { conversationId: 'second', synthetic: false },
      { conversationId: 'third', synthetic: true },
    ];

    const mock = new MockAgentSpawner(scripted);

    const r1 = await mock.spawn({ role: 'r', prompt: 'p' });
    const r2 = await mock.spawn({ role: 'r', prompt: 'p' });
    const r3 = await mock.spawn({ role: 'r', prompt: 'p' });

    expect(r1.conversationId).toBe('first');
    expect(r2.conversationId).toBe('second');
    expect(r3.conversationId).toBe('third');
  });

  // ── Queue exhaustion ─────────────────────────────────────────────────────

  it('after queue is exhausted, returns auto-generated IDs', async () => {
    const scripted: SpawnedAgent[] = [
      { conversationId: 'scripted-1', synthetic: false },
    ];

    const mock = new MockAgentSpawner(scripted);

    const r1 = await mock.spawn({ role: 'r', prompt: 'p' }); // from queue
    const r2 = await mock.spawn({ role: 'r', prompt: 'p' }); // auto-generated
    const r3 = await mock.spawn({ role: 'r', prompt: 'p' }); // auto-generated

    expect(r1.conversationId).toBe('scripted-1');
    // Auto-generated IDs use the format `mock-<callCount>`
    expect(r2.conversationId).toBe('mock-2');
    expect(r3.conversationId).toBe('mock-3');
  });

  it('with no scripted responses, all IDs are auto-generated', async () => {
    const mock = new MockAgentSpawner();

    const r1 = await mock.spawn({ role: 'r', prompt: 'p' });
    const r2 = await mock.spawn({ role: 'r', prompt: 'p' });

    expect(r1.conversationId).toBe('mock-1');
    expect(r2.conversationId).toBe('mock-2');
    expect(r1.synthetic).toBe(true);
    expect(r2.synthetic).toBe(true);
  });

  // ── spawned array records all configs ────────────────────────────────────

  it('spawned array records all configs passed to spawn()', async () => {
    const mock = new MockAgentSpawner();

    const config1 = { role: 'processor', prompt: 'implement feature X', model: 'gemini-pro' };
    const config2 = { role: 'reviewer', prompt: 'review feature X' };
    const config3 = { role: 'dreamer', prompt: 'plan phase 2', typeName: 'DreamerAgent' };

    await mock.spawn(config1);
    await mock.spawn(config2);
    await mock.spawn(config3);

    expect(mock.spawned).toHaveLength(3);
    expect(mock.spawned[0]).toEqual(config1);
    expect(mock.spawned[1]).toEqual(config2);
    expect(mock.spawned[2]).toEqual(config3);
  });

  it('spawned array is empty before any calls', () => {
    const mock = new MockAgentSpawner();
    expect(mock.spawned).toHaveLength(0);
  });

  // ── Response queue does not mutate the original array ────────────────────

  it('constructor copies the response queue, not a reference', async () => {
    const scripted: SpawnedAgent[] = [
      { conversationId: 'original-1', synthetic: false },
    ];

    const mock = new MockAgentSpawner(scripted);

    // Mutate original after construction
    scripted.push({ conversationId: 'added-after', synthetic: false });

    // Only the first response should be in the queue
    const r1 = await mock.spawn({ role: 'r', prompt: 'p' });
    const r2 = await mock.spawn({ role: 'r', prompt: 'p' }); // should be auto-gen, not 'added-after'

    expect(r1.conversationId).toBe('original-1');
    expect(r2.conversationId).toBe('mock-2'); // auto-generated, not 'added-after'
  });

  // ── IAgentSpawner interface compliance ───────────────────────────────────

  it('implements IAgentSpawner interface (spawn returns Promise<SpawnedAgent>)', async () => {
    const mock = new MockAgentSpawner();
    const result = mock.spawn({ role: 'r', prompt: 'p' });
    expect(result).toBeInstanceOf(Promise);
    const resolved = await result;
    expect(typeof resolved.conversationId).toBe('string');
    expect(typeof resolved.synthetic).toBe('boolean');
  });
});
