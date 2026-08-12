import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LanceDBTaskProvider } from '../../src/providers/lancedb-task-provider.js';

describe('LanceDBTaskProvider', () => {
  let tmpDir: string;
  let provider: LanceDBTaskProvider;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'lancedb-task-test-'));
    provider = new LanceDBTaskProvider(tmpDir);
    await provider.init();
  });

  afterEach(async () => {
    await provider.close();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('initializes lancedb and creates vector schema', async () => {
    const task = await provider.createTask({
      track_id: 'track-1',
      title: 'Semantic Task',
      description: 'This is a test task for vector search.'
    });

    expect(task.id).toBeDefined();

    const results = await provider.queryTasks({ semantic_query: 'test task' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(task.id);
  });

  describe('init', () => {
    it('handles concurrent init() calls without throwing "Table \'tasks\' already exists"', async () => {
      const dir = fs.mkdtempSync(path.join(process.cwd(), 'lancedb-concurrent-init-'));
      const testProvider = new LanceDBTaskProvider(dir);
      try {
        await expect(Promise.all([
          testProvider.init(),
          testProvider.init(),
          testProvider.init()
        ])).resolves.not.toThrow();
      } finally {
        await testProvider.close();
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    });
  });

  describe('close', () => {
    it('successfully terminates LanceDB connection and resets initialized state', async () => {
      const dir = fs.mkdtempSync(path.join(process.cwd(), 'lancedb-close-1-'));
      const testProvider = new LanceDBTaskProvider(dir);
      await testProvider.init();

      expect((testProvider as any).initialized).toBe(true);
      await testProvider.close();
      expect((testProvider as any).initialized).toBe(false);

      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('invokes connection.close if present or sets connection to null on close()', async () => {
      const dir = fs.mkdtempSync(path.join(process.cwd(), 'lancedb-close-2-'));
      const testProvider = new LanceDBTaskProvider(dir);
      await testProvider.init();

      const closeSpy = vi.fn();
      if ((testProvider as any).connection) {
        (testProvider as any).connection.close = closeSpy;
      }

      await testProvider.close();
      expect((testProvider as any).initialized).toBe(false);
      expect(closeSpy.mock.calls.length > 0 || (testProvider as any).connection === null).toBe(true);

      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('queryTasks', () => {
    it('queries tasks across multi-track setup without filters', async () => {
      const task1 = await provider.createTask({
        track_id: 'track-alpha',
        title: 'Alpha task for vector search',
        description: 'First track description'
      });
      const task2 = await provider.createTask({
        track_id: 'track-beta',
        title: 'Beta task for vector search',
        description: 'Second track description'
      });

      const results = await provider.queryTasks({ semantic_query: 'vector search' });
      expect(results.length).toBe(2);
      const ids = results.map(r => r.id);
      expect(ids).toContain(task1.id);
      expect(ids).toContain(task2.id);
    });

    it('combines semantic_query with track_id metadata filter', async () => {
      const task1 = await provider.createTask({
        track_id: 'track-alpha',
        title: 'Alpha search target',
        description: 'Searching alpha'
      });
      await provider.createTask({
        track_id: 'track-beta',
        title: 'Beta search target',
        description: 'Searching beta'
      });

      const results = await provider.queryTasks({
        semantic_query: 'search target',
        track_id: 'track-alpha'
      });

      expect(results.length).toBe(1);
      expect(results[0].id).toBe(task1.id);
      expect(results[0].track_id).toBe('track-alpha');
    });

    it('combines semantic_query with status metadata filter', async () => {
      const task1 = await provider.createTask({
        track_id: 'track-1',
        title: 'Task in progress',
        description: 'Working on feature'
      });
      const task2 = await provider.createTask({
        track_id: 'track-1',
        title: 'Completed task',
        description: 'Working on feature'
      });

      await provider.updateTask({ id: task2.id, status: 'completed' });

      const pendingResults = await provider.queryTasks({
        semantic_query: 'Working on feature',
        status: 'pending'
      });
      expect(pendingResults.length).toBe(1);
      expect(pendingResults[0].id).toBe(task1.id);

      const completedResults = await provider.queryTasks({
        semantic_query: 'Working on feature',
        status: 'completed'
      });
      expect(completedResults.length).toBe(1);
      expect(completedResults[0].id).toBe(task2.id);
    });

    it('combines semantic_query, track_id, status, and limit filters', async () => {
      await provider.createTask({
        track_id: 'track-multi',
        title: 'Critical fix for auth 1',
        description: 'Fixing authentication'
      });
      await provider.createTask({
        track_id: 'track-multi',
        title: 'Critical fix for auth 2',
        description: 'Fixing authentication'
      });

      const results = await provider.queryTasks({
        semantic_query: 'Fixing authentication',
        track_id: 'track-multi',
        status: 'pending',
        limit: 1
      });

      expect(results.length).toBe(1);
      expect(results[0].track_id).toBe('track-multi');
      expect(results[0].status).toBe('pending');
    });

    it('returns empty array when semantic query matches no metadata filters', async () => {
      await provider.createTask({
        track_id: 'track-1',
        title: 'Unmatched task',
        description: 'Some description'
      });

      const results = await provider.queryTasks({
        semantic_query: 'Unmatched task',
        track_id: 'non-existent-track'
      });

      expect(results).toEqual([]);
    });

    it('queries tasks without semantic_query using metadata filters and limit', async () => {
      await provider.createTask({
        track_id: 'track-plain',
        title: 'Plain task 1',
        agent: 'processor-1'
      });
      await provider.createTask({
        track_id: 'track-plain',
        title: 'Plain task 2',
        agent: 'processor-2'
      });

      const agentResults = await provider.queryTasks({ agent: 'processor-1' });
      expect(agentResults.length).toBe(1);
      expect(agentResults[0].title).toBe('Plain task 1');

      const limitResults = await provider.queryTasks({ track_id: 'track-plain', limit: 1 });
      expect(limitResults.length).toBe(1);
    });
  });

  describe('updateTask', () => {
    it('updates task status and committed_sha', async () => {
      const { id } = await provider.createTask({
        track_id: 'track-update',
        title: 'Task to update'
      });

      const updateRes = await provider.updateTask({
        id,
        status: 'in_progress',
        committed_sha: 'sha123456'
      });
      expect(updateRes.success).toBe(true);

      const tasks = await provider.queryTasks({ track_id: 'track-update' });
      expect(tasks[0].status).toBe('in_progress');
      expect(tasks[0].committed_sha).toBe('sha123456');
    });

    it('returns success: false when updating non-existent task', async () => {
      const updateRes = await provider.updateTask({
        id: 'non-existent-task-id',
        status: 'completed'
      });
      expect(updateRes.success).toBe(false);
    });

    it('throws or handles failure when LanceDB table update fails (simulate table.update throwing)', async () => {
      const { id } = await provider.createTask({
        track_id: 'track-update-fail',
        title: 'Task update failure test'
      });

      const table = (provider as any).table;
      if (table) {
        table.update = vi.fn().mockRejectedValue(new Error('LanceDB update error'));
      }

      let errorCaught = false;
      try {
        const res = await provider.updateTask({ id, status: 'completed' });
        if (!res.success) {
          errorCaught = true;
        }
      } catch (err: any) {
        errorCaught = true;
        expect(err.message).toContain('LanceDB update error');
      }

      expect(errorCaught).toBe(true);

      const innerTasks = await (provider as any).inner.queryTasks({ track_id: 'track-update-fail' });
      expect(innerTasks.length).toBe(1);
      expect(innerTasks[0].status).toBe('pending');
    });
  });

  describe('invariants and overrides', () => {
    it('creates and queries invariants', async () => {
      const { id } = await provider.createInvariant({
        capability: 'Security Check',
        path: 'src/security.ts',
        rationale: 'Prevent unauthorized access',
        track_id: 'track-inv',
        status: 'active'
      });

      const invariants = await provider.queryInvariants({
        status: 'active',
        capability: 'Security Check',
        path: 'src/security.ts',
        track_id: 'track-inv'
      });

      expect(invariants.length).toBe(1);
      expect(invariants[0].id).toBe(id);
      expect(invariants[0].capability).toBe('Security Check');
      expect(invariants[0].path).toBe('src/security.ts');
    });

    it('creates override and updates invariant status', async () => {
      const inv = await provider.createInvariant({
        capability: 'Legacy Auth',
        path: 'src/legacy.ts',
        track_id: 'track-inv-1'
      });

      const override = await provider.createOverride({
        invariant_id: inv.id,
        track_id: 'track-inv-2',
        reason: 'Migrated to OAuth2'
      });

      expect(override.override_id).toMatch(/^ovr-/);

      const invariants = await provider.queryInvariants({ path: 'src/legacy.ts' });
      expect(invariants[0].status).toBe('overridden');

      const overrides = await provider.queryOverrides({
        invariant_id: inv.id,
        track_id: 'track-inv-2'
      });
      expect(overrides.length).toBe(1);
      expect(overrides[0].reason).toBe('Migrated to OAuth2');
    });

    it('auto-seeds invariants during createTask and allows overrides', async () => {
      const task = await provider.createTask({
        track_id: 'track-lance-auto',
        title: 'LanceDB Auto Invariant Task',
        protected: ['src/lance/core.ts'],
        invariant_after: 'Core must not degrade'
      });

      const invariants = await provider.queryInvariants({ track_id: 'track-lance-auto' });
      expect(invariants.length).toBe(1);
      expect(invariants[0].task_id).toBe(task.id);
      expect(invariants[0].path).toBe('src/lance/core.ts');
      expect(invariants[0].capability).toBe('Core must not degrade');

      const override = await provider.createOverride({
        invariant_id: invariants[0].id,
        track_id: 'track-lance-override',
        reason: 'Authorized core change'
      });

      expect(override.override_id).toMatch(/^ovr-/);

      const updated = await provider.queryInvariants({ track_id: 'track-lance-auto' });
      expect(updated[0].status).toBe('overridden');
    });
  });
});

