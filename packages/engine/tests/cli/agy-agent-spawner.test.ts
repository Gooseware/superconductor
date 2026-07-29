/**
 * agy-agent-spawner.test.ts — Phase 5 TDD tests for AgyAgentSpawner
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgyAgentSpawner } from '../../src/cli/agy-agent-spawner.js';

describe('AgyAgentSpawner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-spawner-test-'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ── Missing config ───────────────────────────────────────────────────────

  it('missing spawner-config.json → logs warn, returns synthetic ID, does NOT throw', async () => {
    // No file written — config absent
    const spawner = new AgyAgentSpawner(tmpDir);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('spawner-config.json not found')
    );

    const result = await spawner.spawn({ role: 'processor', prompt: 'do work' });
    expect(result).toBeDefined();
    expect(typeof result.conversationId).toBe('string');
    expect(result.conversationId.length).toBeGreaterThan(0);
  });

  it('missing spawner-config.json → result has synthetic:true', async () => {
    const spawner = new AgyAgentSpawner(tmpDir);
    const result = await spawner.spawn({ role: 'processor', prompt: 'do work' });
    expect(result.synthetic).toBe(true);
  });

  // ── noop backend ─────────────────────────────────────────────────────────

  it('spawner-config.json with {"backend":"noop"} → logs warn, returns synthetic ID', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'spawner-config.json'),
      JSON.stringify({ backend: 'noop' }),
      'utf8'
    );

    const spawner = new AgyAgentSpawner(tmpDir);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('noop')
    );

    const result = await spawner.spawn({ role: 'reviewer', prompt: 'review it' });
    expect(result.synthetic).toBe(true);
    expect(typeof result.conversationId).toBe('string');
  });

  // ── invoke_subagent backend ──────────────────────────────────────────────

  it('spawner-config.json with {"backend":"invoke_subagent"} → logs info, returns pending synthetic ID, does NOT throw', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'spawner-config.json'),
      JSON.stringify({ backend: 'invoke_subagent' }),
      'utf8'
    );

    const spawner = new AgyAgentSpawner(tmpDir);

    const result = await spawner.spawn({ role: 'dreamer', prompt: 'plan something' });

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('invoke_subagent backend')
    );
    expect(result.synthetic).toBe(true);
    expect(result.conversationId).toMatch(/^pending-invoke-/);
  });

  // ── Malformed JSON ───────────────────────────────────────────────────────

  it('malformed JSON in spawner-config.json → treated as absent, warn logged, returns synthetic ID', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'spawner-config.json'),
      '{ not valid json !!!',
      'utf8'
    );

    const spawner = new AgyAgentSpawner(tmpDir);

    // Should warn about missing/unreadable config (fallback to noop)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('spawner-config.json not found')
    );

    const result = await spawner.spawn({ role: 'processor', prompt: 'do work' });
    expect(result.synthetic).toBe(true);
  });

  // ── synthetic:true on all noop responses ─────────────────────────────────

  it('synthetic:true on all noop responses regardless of config', async () => {
    // Test 1: missing config → noop → synthetic
    const spawner1 = new AgyAgentSpawner(tmpDir);
    const r1 = await spawner1.spawn({ role: 'a', prompt: 'p' });
    expect(r1.synthetic).toBe(true);

    // Test 2: explicit noop → synthetic
    fs.writeFileSync(
      path.join(tmpDir, 'spawner-config.json'),
      JSON.stringify({ backend: 'noop' }),
      'utf8'
    );
    const spawner2 = new AgyAgentSpawner(tmpDir);
    const r2 = await spawner2.spawn({ role: 'b', prompt: 'q' });
    expect(r2.synthetic).toBe(true);
  });

  // ── Unique conversationIds ────────────────────────────────────────────────

  it('spawn() called twice → unique conversationId values each time', async () => {
    const spawner = new AgyAgentSpawner(tmpDir);

    const r1 = await spawner.spawn({ role: 'role-a', prompt: 'prompt-1' });
    const r2 = await spawner.spawn({ role: 'role-b', prompt: 'prompt-2' });

    expect(r1.conversationId).not.toBe(r2.conversationId);
  });

  it('spawn() called twice with invoke_subagent → unique conversationId values each time', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'spawner-config.json'),
      JSON.stringify({ backend: 'invoke_subagent' }),
      'utf8'
    );
    const spawner = new AgyAgentSpawner(tmpDir);

    const r1 = await spawner.spawn({ role: 'role-a', prompt: 'prompt-1' });
    const r2 = await spawner.spawn({ role: 'role-b', prompt: 'prompt-2' });

    expect(r1.conversationId).not.toBe(r2.conversationId);
  });

  // ── Optional fields on AgentSpawnConfig ──────────────────────────────────

  it('spawn() accepts optional model and typeName fields without throwing', async () => {
    const spawner = new AgyAgentSpawner(tmpDir);

    await expect(
      spawner.spawn({ role: 'processor', prompt: 'do work', model: 'gemini-pro', typeName: 'ProcessorAgent' })
    ).resolves.toBeDefined();
  });
});
