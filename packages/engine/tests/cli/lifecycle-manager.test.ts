import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { QuorumStore } from '../../src/cli/quorum-store.js';
import {
  TrackLifecycleManager,
  IAgentKiller,
  CleanupReport,
} from '../../src/cli/lifecycle-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKiller(responses: Record<string, 'killed' | 'already_dead'> = {}): IAgentKiller & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async kill(conversationId: string): Promise<'killed' | 'already_dead'> {
      calls.push(conversationId);
      return responses[conversationId] ?? 'killed';
    }
  };
}

function makeFailingKiller(failIds: Set<string> = new Set()): IAgentKiller & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async kill(conversationId: string): Promise<'killed' | 'already_dead'> {
      calls.push(conversationId);
      if (failIds.has(conversationId)) {
        throw new Error(`Kill failed for ${conversationId}`);
      }
      return 'killed';
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrackLifecycleManager', () => {
  let tmpDir: string;
  let store: QuorumStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-manager-test-'));
    store = new QuorumStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('cleanup()', () => {
    it('should kill all registered agents and return correct counts', async () => {
      const trackId = 'track-001';
      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-aaa',
        wuId: 'wu-1',
        role: 'agent-ui',
        spawnedAt: new Date().toISOString(),
      });
      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-bbb',
        wuId: 'wu-2',
        role: 'agent-api',
        spawnedAt: new Date().toISOString(),
      });

      const killer = makeKiller();
      const manager = new TrackLifecycleManager(store, tmpDir, killer);

      const report = await manager.cleanup(trackId);

      expect(report.trackId).toBe(trackId);
      expect(report.agentsKilled).toBe(2);
      expect(report.agentsAlreadyDead).toBe(0);
      expect(report.worktreesRemoved).toBe(0);
      expect(report.errors).toEqual([]);
      expect(killer.calls).toContain('conv-aaa');
      expect(killer.calls).toContain('conv-bbb');
    });

    it('should handle already-dead agents gracefully (counted separately, no error)', async () => {
      const trackId = 'track-dead';
      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-alive',
        wuId: 'wu-1',
        role: 'agent-a',
        spawnedAt: new Date().toISOString(),
      });
      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-dead',
        wuId: 'wu-2',
        role: 'agent-b',
        spawnedAt: new Date().toISOString(),
      });

      const killer = makeKiller({ 'conv-alive': 'killed', 'conv-dead': 'already_dead' });
      const manager = new TrackLifecycleManager(store, tmpDir, killer);

      const report = await manager.cleanup(trackId);

      expect(report.agentsKilled).toBe(1);
      expect(report.agentsAlreadyDead).toBe(1);
      expect(report.errors).toEqual([]);
    });

    it('should remove worktrees for entries with worktreePath', async () => {
      const trackId = 'track-worktrees';

      const worktreePath = path.join(tmpDir, 'worktrees', 'agent-wt-1');
      fs.mkdirSync(worktreePath, { recursive: true });

      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-wt1',
        wuId: 'wu-1',
        role: 'agent-wt',
        spawnedAt: new Date().toISOString(),
        worktreePath,
      });

      const execCalls: string[] = [];
      const killer = makeKiller();
      const manager = new TrackLifecycleManager(store, tmpDir, killer, {
        execWorktreeRemove: async (wPath: string) => {
          execCalls.push(wPath);
        }
      });

      const report = await manager.cleanup(trackId);

      expect(report.worktreesRemoved).toBe(1);
      expect(execCalls).toContain(worktreePath);
      expect(report.errors).toEqual([]);
    });

    it('should collect error and NOT increment worktreesRemoved when execWorktreeRemove throws', async () => {
      const trackId = 'track-wt-fail';
      const goodPath = '/some/good/worktree';
      const badPath = '/some/bad/worktree';

      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-good-wt',
        wuId: 'wu-1',
        role: 'agent-good',
        spawnedAt: new Date().toISOString(),
        worktreePath: goodPath,
      });
      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-bad-wt',
        wuId: 'wu-2',
        role: 'agent-bad',
        spawnedAt: new Date().toISOString(),
        worktreePath: badPath,
      });

      const killer = makeKiller();
      const manager = new TrackLifecycleManager(store, tmpDir, killer, {
        execWorktreeRemove: async (wPath: string) => {
          if (wPath === badPath) {
            throw new Error(`git worktree remove failed for ${wPath}`);
          }
          // goodPath succeeds silently
        }
      });

      // Should NOT throw — errors are collected
      const report = await manager.cleanup(trackId);

      // Only the successful removal increments the counter
      expect(report.worktreesRemoved).toBe(1);
      // The failed removal is recorded in errors
      expect(report.errors.length).toBe(1);
      expect(report.errors[0]).toMatch(/bad\/worktree/);
      // Both agents were still killed (cleanup continued past the failure)
      expect(report.agentsKilled).toBe(2);
    });

        it('should return errors array for failed kills without throwing', async () => {
      const trackId = 'track-fail';
      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-ok',
        wuId: 'wu-1',
        role: 'agent-a',
        spawnedAt: new Date().toISOString(),
      });
      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-fail',
        wuId: 'wu-2',
        role: 'agent-b',
        spawnedAt: new Date().toISOString(),
      });

      const killer = makeFailingKiller(new Set(['conv-fail']));
      const manager = new TrackLifecycleManager(store, tmpDir, killer);

      // Should NOT throw
      const report = await manager.cleanup(trackId);

      expect(report.agentsKilled).toBe(1);
      expect(report.errors.length).toBe(1);
      expect(report.errors[0]).toMatch(/conv-fail/);
    });

    it('should handle missing agents.json gracefully (returns empty report)', async () => {
      const trackId = 'track-no-manifest';
      const killer = makeKiller();
      const manager = new TrackLifecycleManager(store, tmpDir, killer);

      const report = await manager.cleanup(trackId);

      expect(report.trackId).toBe(trackId);
      expect(report.agentsKilled).toBe(0);
      expect(report.agentsAlreadyDead).toBe(0);
      expect(report.worktreesRemoved).toBe(0);
      expect(report.errors).toEqual([]);
      expect(killer.calls).toEqual([]);
    });

    it('should be safe when called concurrently on same trackId', async () => {
      const trackId = 'track-concurrent';
      const N = 5;
      for (let i = 0; i < N; i++) {
        await store.appendToAgentsManifest(trackId, {
          conversationId: `conv-${i}`,
          wuId: `wu-${i}`,
          role: `agent-${i}`,
          spawnedAt: new Date().toISOString(),
        });
      }

      const killer = makeKiller();
      const manager = new TrackLifecycleManager(store, tmpDir, killer);

      const results = await Promise.all([
        manager.cleanup(trackId),
        manager.cleanup(trackId),
        manager.cleanup(trackId),
      ]);

      for (const report of results) {
        expect(report.trackId).toBe(trackId);
        expect(typeof report.agentsKilled).toBe('number');
        expect(typeof report.agentsAlreadyDead).toBe('number');
        expect(Array.isArray(report.errors)).toBe(true);
      }
    });
  });

  describe('onTrackComplete()', () => {
    it('should call cleanup() and log the report without throwing', async () => {
      const trackId = 'track-complete';
      await store.appendToAgentsManifest(trackId, {
        conversationId: 'conv-done',
        wuId: 'wu-1',
        role: 'agent-done',
        spawnedAt: new Date().toISOString(),
      });

      const killer = makeKiller();
      const manager = new TrackLifecycleManager(store, tmpDir, killer);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(manager.onTrackComplete(trackId)).resolves.toBeUndefined();
      expect(killer.calls).toContain('conv-done');

      consoleSpy.mockRestore();
    });
  });
});
