import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DomainSplitRemediationDispatcher } from './domain-split-remediation-dispatcher.js';
import type { Finding } from './domain-classifier.js';

describe('DomainSplitRemediationDispatcher', () => {
  let mockWorktreeManager: any;
  let mockSpawner: any;

  beforeEach(() => {
    mockWorktreeManager = {
      allocate: vi.fn().mockImplementation(async (agentId: string, trackId: string) => {
        return `wt/${agentId}-${trackId}`;
      }),
      release: vi.fn().mockResolvedValue(undefined),
    };
    mockSpawner = vi.fn().mockImplementation(async (info: any) => {
      return { success: true, agentId: info.agentId };
    });
  });

  it('dispatch([3 findings across 3 domains]) spawns 3 parallel agents', async () => {
    const customMap = {
      'src/feature-a/': 'auth-domain',
      'src/feature-b/': 'ui-domain',
      'src/feature-c/': 'db-domain',
    };
    const dispatcher = new DomainSplitRemediationDispatcher({
      worktreeManager: mockWorktreeManager,
      spawner: mockSpawner,
      domainMap: customMap,
    });

    const findings: Finding[] = [
      { file: 'src/feature-a/login.ts', description: 'Auth issue' },
      { file: 'src/feature-b/button.ts', description: 'UI issue' },
      { file: 'src/feature-c/client.ts', description: 'DB issue' },
    ];

    const result = await dispatcher.dispatch(findings, { trackId: 'track1' });

    expect(result.spawned.length).toBe(3);
    expect(mockSpawner).toHaveBeenCalledTimes(3);
    expect(mockWorktreeManager.allocate).toHaveBeenCalledTimes(3);
  });

  it('dispatch([findings all same domain]) spawns 1 agent', async () => {
    const customMap = {
      'src/feature-a/': 'auth-domain',
    };
    const dispatcher = new DomainSplitRemediationDispatcher({
      worktreeManager: mockWorktreeManager,
      spawner: mockSpawner,
      domainMap: customMap,
    });

    const findings: Finding[] = [
      { file: 'src/feature-a/login.ts', description: 'Auth issue 1' },
      { file: 'src/feature-a/token.ts', description: 'Auth issue 2' },
      { file: 'src/feature-a/user.ts', description: 'Auth issue 3' },
    ];

    const result = await dispatcher.dispatch(findings, { trackId: 'track1' });

    expect(result.spawned.length).toBe(1);
    expect(mockSpawner).toHaveBeenCalledTimes(1);
    expect(mockWorktreeManager.allocate).toHaveBeenCalledTimes(1);
  });

  it('dispatch([>6 domains worth of findings]) caps at 6 parallel, queues rest', async () => {
    const customMap = {
      'd1/': 'domain-1',
      'd2/': 'domain-2',
      'd3/': 'domain-3',
      'd4/': 'domain-4',
      'd5/': 'domain-5',
      'd6/': 'domain-6',
      'd7/': 'domain-7',
      'd8/': 'domain-8',
    };
    const dispatcher = new DomainSplitRemediationDispatcher({
      worktreeManager: mockWorktreeManager,
      spawner: mockSpawner,
      domainMap: customMap,
    });

    const findings: Finding[] = [
      { file: 'd1/a.ts' },
      { file: 'd2/a.ts' },
      { file: 'd3/a.ts' },
      { file: 'd4/a.ts' },
      { file: 'd5/a.ts' },
      { file: 'd6/a.ts' },
      { file: 'd7/a.ts' },
      { file: 'd8/a.ts' },
    ];

    const result = await dispatcher.dispatch(findings, { trackId: 'track1', maxParallel: 6 });

    expect(result.spawned.length).toBe(6);
    expect(result.queued.length).toBe(2);
    expect(mockSpawner).toHaveBeenCalledTimes(6);
    expect(mockWorktreeManager.allocate).toHaveBeenCalledTimes(6);
  });

  it('Each spawned agent receives only its domain findings', async () => {
    const customMap = {
      'src/feature-a/': 'auth-domain',
      'src/feature-b/': 'ui-domain',
    };
    const dispatcher = new DomainSplitRemediationDispatcher({
      worktreeManager: mockWorktreeManager,
      spawner: mockSpawner,
      domainMap: customMap,
    });

    const authFinding = { file: 'src/feature-a/login.ts', description: 'Auth' };
    const uiFinding = { file: 'src/feature-b/button.ts', description: 'UI' };

    const result = await dispatcher.dispatch([authFinding, uiFinding], { trackId: 't1' });

    const authAgent = result.spawned.find((s) => s.domain === 'auth-domain');
    const uiAgent = result.spawned.find((s) => s.domain === 'ui-domain');

    expect(authAgent?.findings).toEqual([authFinding]);
    expect(uiAgent?.findings).toEqual([uiFinding]);
  });

  it('dispatch calls WorktreeIsolationManager.allocate per agent', async () => {
    const customMap = {
      'src/mod-a/': 'domain-a',
      'src/mod-b/': 'domain-b',
    };
    const dispatcher = new DomainSplitRemediationDispatcher({
      worktreeManager: mockWorktreeManager,
      spawner: mockSpawner,
      domainMap: customMap,
    });

    await dispatcher.dispatch(
      [
        { file: 'src/mod-a/1.ts' },
        { file: 'src/mod-b/1.ts' },
      ],
      { trackId: 'track-xyz' }
    );

    expect(mockWorktreeManager.allocate).toHaveBeenCalledTimes(2);
    expect(mockWorktreeManager.allocate).toHaveBeenCalledWith(
      expect.stringContaining('domain-a'),
      'track-xyz'
    );
    expect(mockWorktreeManager.allocate).toHaveBeenCalledWith(
      expect.stringContaining('domain-b'),
      'track-xyz'
    );
  });

  it('works with zero options (default construction and dispatch)', async () => {
    const dispatcher = new DomainSplitRemediationDispatcher();
    const result = await dispatcher.dispatch([{ file: 'test/foo.spec.ts' }]);

    expect(result.spawned.length).toBe(1);
    expect(result.spawned[0].domain).toBe('test-writer');
    expect(result.spawned[0].branch).toBeUndefined();
    expect(result.spawned[0].model).toBe('pro');
  });
});
