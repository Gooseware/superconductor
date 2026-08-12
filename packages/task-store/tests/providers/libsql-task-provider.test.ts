import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LibSQLTaskProvider } from '../../src/providers/libsql-task-provider.js';

describe('LibSQLTaskProvider', () => {
  let tmpDir: string;
  let provider: LibSQLTaskProvider;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'libsql-task-test-'));
    provider = new LibSQLTaskProvider(tmpDir);
    await provider.init();
  });

  afterEach(async () => {
    await provider.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes tables successfully', async () => {
    expect(provider).toBeDefined();
  });

  it('creates and queries a task', async () => {
    const { id } = await provider.createTask({
      track_id: 'track-123',
      title: 'Add Auth Guard',
      description: 'Implement auth guard',
      creates: ['src/auth/guard.ts'],
      protected: ['src/auth/session.ts'],
      invariant_after: 'The session validator MUST never bypass token signature checks.',
      tier: 'TIER-3',
      agent: 'superconductor-processor'
    });

    expect(id).toMatch(/^task-/);

    const tasks = await provider.queryTasks({ track_id: 'track-123' });
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(id);
    expect(tasks[0].status).toBe('pending');
    expect(tasks[0].creates).toEqual(['src/auth/guard.ts']);
    expect(tasks[0].protected).toEqual(['src/auth/session.ts']);
  });

  it('updates a task status', async () => {
    const { id } = await provider.createTask({ track_id: 't-1', title: 'Task 1', description: '' });
    await provider.updateTask({ id, status: 'in_progress', committed_sha: 'abc1234' });

    const tasks = await provider.queryTasks({ track_id: 't-1' });
    expect(tasks[0].status).toBe('in_progress');
    expect(tasks[0].committed_sha).toBe('abc1234');
  });

  it('creates and queries invariants', async () => {
    const { id } = await provider.createInvariant({
      capability: 'Must auth',
      path: 'src/auth.ts',
      track_id: 't-1',
      status: 'active'
    });

    const invariants = await provider.queryInvariants({ status: 'active' });
    expect(invariants.length).toBe(1);
    expect(invariants[0].id).toBe(id);
    expect(invariants[0].path).toBe('src/auth.ts');
  });

  it('overrides an invariant', async () => {
    const { id } = await provider.createInvariant({
      capability: 'Must auth',
      path: 'src/auth.ts',
      track_id: 't-1'
    });

    const { override_id } = await provider.createOverride({
      invariant_id: id,
      track_id: 't-2',
      reason: 'Replaced with OIDC'
    });
    expect(override_id).toMatch(/^ovr-/);

    // Verify invariant status is overridden
    const invariants = await provider.queryInvariants({ path: 'src/auth.ts' });
    expect(invariants[0].status).toBe('overridden');
  });
});
