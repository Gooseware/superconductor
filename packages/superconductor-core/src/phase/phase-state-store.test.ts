import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import lockfile from 'proper-lockfile';
import { PhaseStateStore, DEFAULT_LOCK_OPTIONS } from './phase-state-store.js';
import type { RegistryManifest } from './phase-manifest.js';

describe('PhaseStateStore', () => {
  let tmpDir: string;
  let scDir: string;
  let tracksFile: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sc-state-store-test-'));
    scDir = path.join(tmpDir, 'superconductor');
    tracksFile = path.join(scDir, 'tracks.md');
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
    vi.restoreAllMocks();
  });

  describe('getTracksPath', () => {
    it('resolves default canonical path when given projectRoot', () => {
      const p = PhaseStateStore.getTracksPath('/test/project');
      expect(p).toBe(path.resolve('/test/project', 'superconductor', 'tracks.md'));
    });

    it('resolves canonical nested path when projectRoot is named superconductor containing nested superconductor/tracks.md', async () => {
      const fakeRepo = path.join(tmpDir, 'superconductor');
      const innerMeta = path.join(fakeRepo, 'superconductor');
      await fs.promises.mkdir(innerMeta, { recursive: true });
      await fs.promises.writeFile(path.join(innerMeta, 'tracks.md'), '# Tracks\n', 'utf-8');

      const p = PhaseStateStore.getTracksPath(fakeRepo);
      expect(p).toBe(path.join(innerMeta, 'tracks.md'));
    });

    it('resolves direct tracks.md when given metadata directory named superconductor containing tracks.md', async () => {
      const metaDir = path.join(tmpDir, 'direct-meta', 'superconductor');
      await fs.promises.mkdir(metaDir, { recursive: true });
      await fs.promises.writeFile(path.join(metaDir, 'tracks.md'), '# Tracks\n', 'utf-8');

      const p = PhaseStateStore.getTracksPath(metaDir);
      expect(p).toBe(path.join(metaDir, 'tracks.md'));
    });

    it('resolves path when given full tracks.md path', () => {
      const p = PhaseStateStore.getTracksPath('/test/project/superconductor/tracks.md');
      expect(p).toBe(path.resolve('/test/project', 'superconductor', 'tracks.md'));
    });

    it('defaults to process.cwd() when projectRoot is omitted', () => {
      const p = PhaseStateStore.getTracksPath();
      expect(p).toBeDefined();
      expect(p).toContain('tracks.md');
    });
  });

  describe('load', () => {
    it('returns empty manifest when tracks.md does not exist', async () => {
      const manifest = await PhaseStateStore.load(tmpDir);
      expect(manifest).toEqual({ phases: [] });
    });

    it('loads and parses existing tracks.md', async () => {
      await fs.promises.mkdir(scDir, { recursive: true });
      const initialContent = `# Tracks Registry

## Phase 1: Foundation (Active)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`track_alpha\` | Alpha Track | \`feat/alpha\` |
`;
      await fs.promises.writeFile(tracksFile, initialContent, 'utf-8');

      const manifest = await PhaseStateStore.load(tmpDir);
      expect(manifest.phases).toHaveLength(1);
      expect(manifest.phases[0].phaseId).toBe('foundation');
      expect(manifest.phases[0].name).toBe('Foundation');
      expect(manifest.phases[0].status).toBe('active');
      expect(manifest.phases[0].tracks).toHaveLength(1);
      expect(manifest.phases[0].tracks[0]).toEqual({
        trackId: 'track_alpha',
        title: 'Alpha Track',
        status: 'completed',
        branch: 'feat/alpha',
      });
    });

    it('releases lock cleanly after reading', async () => {
      await fs.promises.mkdir(scDir, { recursive: true });
      await fs.promises.writeFile(tracksFile, '# Tracks Registry\n', 'utf-8');

      const manifest = await PhaseStateStore.load(tmpDir);
      expect(manifest.phases).toEqual([]);

      // Lock should not remain held
      const locked = await PhaseStateStore.isLocked(tmpDir);
      expect(locked).toBe(false);
    });
  });

  describe('save', () => {
    it('saves a manifest to tracks.md atomically', async () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'phase-one',
            name: 'Phase One',
            status: 'active',
            ordinal: 1,
            tracks: [
              {
                trackId: 'track_01',
                title: 'Track One',
                status: 'in_progress',
                branch: 'feat/track-01',
              },
            ],
          },
        ],
      };

      await PhaseStateStore.save(tmpDir, manifest);

      expect(fs.existsSync(tracksFile)).toBe(true);
      const content = await fs.promises.readFile(tracksFile, 'utf-8');
      expect(content).toContain('## Phase 1: Phase One (Active)');
      expect(content).toContain('`track_01`');
      expect(content).toContain('`[~]`');

      // Lock released
      const locked = await PhaseStateStore.isLocked(tmpDir);
      expect(locked).toBe(false);
    });

    it('round-trips save and load faithfully', async () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'foundation',
            name: 'Foundation Phase',
            status: 'completed',
            ordinal: 1,
            tracks: [
              {
                trackId: 'init_arch',
                title: 'Initial Architecture',
                status: 'completed',
                branch: 'main',
              },
            ],
          },
          {
            phaseId: 'scaling',
            name: 'Scaling Phase',
            status: 'active',
            ordinal: 2,
            tracks: [
              {
                trackId: 'distributed_cache',
                title: 'Distributed Cache',
                status: 'in_progress',
                branch: 'feat/cache',
                note: 'Pending Redis deployment',
              },
            ],
          },
        ],
        absorbed: [
          {
            trackId: 'old_track',
            absorbedBy: 'init_arch',
            reason: 'Consolidated into Initial Architecture',
          },
        ],
        archived: ['track_legacy_0'],
      };

      await PhaseStateStore.save(tmpDir, manifest);
      const loaded = await PhaseStateStore.load(tmpDir);

      expect(loaded.phases).toHaveLength(2);
      expect(loaded.phases[0].phaseId).toBe('foundation');
      expect(loaded.phases[0].status).toBe('completed');
      expect(loaded.phases[1].phaseId).toBe('scaling');
      expect(loaded.phases[1].status).toBe('active');
      expect(loaded.phases[1].tracks[0].note).toBe('Pending Redis deployment');
      expect(loaded.absorbed).toHaveLength(1);
      expect(loaded.absorbed![0].trackId).toBe('old_track');
      expect(loaded.archived).toEqual(['track_legacy_0']);
    });
  });

  describe('mutate', () => {
    beforeEach(async () => {
      const initialManifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'phase-one',
            name: 'Phase One',
            status: 'active',
            ordinal: 1,
            tracks: [
              {
                trackId: 'track_a',
                title: 'Track A',
                status: 'in_progress',
              },
            ],
          },
        ],
      };
      await PhaseStateStore.save(tmpDir, initialManifest);
    });

    it('atomically updates phase status in place', async () => {
      await PhaseStateStore.mutate(tmpDir, (manifest) => {
        manifest.phases[0].status = 'completed';
      });

      const updated = await PhaseStateStore.load(tmpDir);
      expect(updated.phases[0].status).toBe('completed');
    });

    it('atomically adds a track to a phase and returns custom value', async () => {
      const newTrack = {
        trackId: 'track_b',
        title: 'Track B',
        status: 'planned' as const,
        branch: 'feat/track-b',
      };

      const result = await PhaseStateStore.mutate(tmpDir, (manifest) => {
        manifest.phases[0].tracks.push(newTrack);
        return { added: newTrack.trackId, totalTracks: manifest.phases[0].tracks.length };
      });

      expect(result).toEqual({ added: 'track_b', totalTracks: 2 });

      const updated = await PhaseStateStore.load(tmpDir);
      expect(updated.phases[0].tracks).toHaveLength(2);
      expect(updated.phases[0].tracks[1].trackId).toBe('track_b');
      expect(updated.phases[0].tracks[1].status).toBe('planned');
    });

    it('supports returning a modified manifest object from mutator', async () => {
      await PhaseStateStore.mutate(tmpDir, (manifest) => {
        return {
          ...manifest,
          phases: [
            ...manifest.phases,
            {
              phaseId: 'phase-two',
              name: 'Phase Two',
              status: 'planned',
              ordinal: 2,
              tracks: [],
            },
          ],
        };
      });

      const updated = await PhaseStateStore.load(tmpDir);
      expect(updated.phases).toHaveLength(2);
      expect(updated.phases[1].phaseId).toBe('phase-two');
    });

    it('releases lock and rolls back when mutator throws an error', async () => {
      const contentBefore = await fs.promises.readFile(tracksFile, 'utf-8');

      await expect(
        PhaseStateStore.mutate(tmpDir, () => {
          throw new Error('Mutation validation failed');
        })
      ).rejects.toThrow('Mutation validation failed');

      // Lock should be released
      const locked = await PhaseStateStore.isLocked(tmpDir);
      expect(locked).toBe(false);

      // File content should be unmodified
      const contentAfter = await fs.promises.readFile(tracksFile, 'utf-8');
      expect(contentAfter).toBe(contentBefore);

      // Subsequent mutation must succeed
      await PhaseStateStore.mutate(tmpDir, (manifest) => {
        manifest.phases[0].status = 'blocked';
      });
      const updated = await PhaseStateStore.load(tmpDir);
      expect(updated.phases[0].status).toBe('blocked');
    });
  });

  describe('concurrency', () => {
    it('handles concurrent mutate calls without race conditions or lost updates', async () => {
      const initialManifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'concurrency-phase',
            name: 'Concurrency Phase',
            status: 'active',
            ordinal: 1,
            tracks: [],
          },
        ],
      };
      await PhaseStateStore.save(tmpDir, initialManifest);

      const trackCount = 8;
      const promises: Promise<void>[] = [];

      for (let i = 0; i < trackCount; i++) {
        promises.push(
          PhaseStateStore.mutate(
            tmpDir,
            async (manifest) => {
              // Introduce artificial jitter to test lock contention
              await new Promise((resolve) => setTimeout(resolve, Math.random() * 25));
              manifest.phases[0].tracks.push({
                trackId: `concurrent_track_${i}`,
                title: `Concurrent Track ${i}`,
                status: 'planned',
              });
            },
            {
              lockOptions: {
                retries: {
                  retries: 25,
                  minTimeout: 30,
                  maxTimeout: 300,
                  factor: 1.5,
                },
              },
            }
          )
        );
      }

      await Promise.all(promises);

      const finalManifest = await PhaseStateStore.load(tmpDir);
      expect(finalManifest.phases[0].tracks).toHaveLength(trackCount);

      const trackIds = finalManifest.phases[0].tracks.map((t) => t.trackId);
      for (let i = 0; i < trackCount; i++) {
        expect(trackIds).toContain(`concurrent_track_${i}`);
      }

      const locked = await PhaseStateStore.isLocked(tmpDir);
      expect(locked).toBe(false);
    });

    it('handles concurrent save calls resolving in series', async () => {
      await fs.promises.mkdir(scDir, { recursive: true });
      await fs.promises.writeFile(tracksFile, '# Tracks Registry\n', 'utf-8');

      const saveResults = await Promise.all([
        PhaseStateStore.save(
          tmpDir,
          {
            phases: [
              {
                phaseId: 'writer-one',
                name: 'Writer One',
                status: 'active',
                ordinal: 1,
                tracks: [{ trackId: 't1', title: 'T1', status: 'planned' }],
              },
            ],
          },
          { lockOptions: { retries: { retries: 15, minTimeout: 40, maxTimeout: 300 } } }
        ),
        PhaseStateStore.save(
          tmpDir,
          {
            phases: [
              {
                phaseId: 'writer-two',
                name: 'Writer Two',
                status: 'active',
                ordinal: 1,
                tracks: [{ trackId: 't2', title: 'T2', status: 'planned' }],
              },
            ],
          },
          { lockOptions: { retries: { retries: 15, minTimeout: 40, maxTimeout: 300 } } }
        ),
      ]);

      expect(saveResults).toHaveLength(2);
      const locked = await PhaseStateStore.isLocked(tmpDir);
      expect(locked).toBe(false);

      const loaded = await PhaseStateStore.load(tmpDir);
      expect(loaded.phases).toHaveLength(1);
      // Either writer-one or writer-two won the final write, but registry is fully intact
      expect(['writer-one', 'writer-two']).toContain(loaded.phases[0].phaseId);
    });
  });

  describe('atomic write-rename & cleanup', () => {
    it('uses sibling .tmp file and cleans it up if rename fails', async () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'cleanup-test',
            name: 'Cleanup Test',
            status: 'active',
            ordinal: 1,
            tracks: [],
          },
        ],
      };

      // Spy on fs.promises.rename and simulate failure
      const originalRename = fs.promises.rename;
      vi.spyOn(fs.promises, 'rename').mockImplementation(async (oldPath, newPath) => {
        // Confirm that the oldPath is a sibling .tracks.md.*.tmp file in scDir
        expect(path.dirname(String(oldPath))).toBe(scDir);
        expect(path.basename(String(oldPath))).toMatch(/^\.tracks\.md\.\d+\.[a-z0-9]+\.tmp$/);
        expect(fs.existsSync(String(oldPath))).toBe(true);

        throw new Error('EACCES: permission denied during rename simulation');
      });

      await expect(PhaseStateStore.save(tmpDir, manifest)).rejects.toThrow(
        'EACCES: permission denied during rename simulation'
      );

      // Verify all .tmp files in scDir were cleaned up
      const files = await fs.promises.readdir(scDir);
      const tmpFiles = files.filter((f) => f.includes('.tmp'));
      expect(tmpFiles).toHaveLength(0);

      // Verify lock was released
      const locked = await PhaseStateStore.isLocked(tmpDir);
      expect(locked).toBe(false);

      // Restore rename
      vi.spyOn(fs.promises, 'rename').mockImplementation(originalRename);
    });

    it('cleans up .tmp file if write fails midway', async () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'write-failure-test',
            name: 'Write Failure Test',
            status: 'active',
            ordinal: 1,
            tracks: [],
          },
        ],
      };

      const originalWriteFile = fs.promises.writeFile;
      vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (file, data, options) => {
        if (String(file).includes('.tmp')) {
          await originalWriteFile(file, 'partial content', options);
          throw new Error('ENOSPC: no space left on device');
        }
        return originalWriteFile(file, data, options);
      });

      await expect(PhaseStateStore.save(tmpDir, manifest)).rejects.toThrow('ENOSPC');

      // No lingering .tmp files
      const files = await fs.promises.readdir(scDir);
      const tmpFiles = files.filter((f) => f.includes('.tmp'));
      expect(tmpFiles).toHaveLength(0);

      // Lock is released
      const locked = await PhaseStateStore.isLocked(tmpDir);
      expect(locked).toBe(false);
    });
  });

  describe('configuration', () => {
    it('exposes DEFAULT_LOCK_OPTIONS matching acceptance criteria', () => {
      expect(PhaseStateStore.DEFAULT_LOCK_OPTIONS).toEqual({
        retries: { retries: 5, minTimeout: 50, maxTimeout: 500, factor: 2 },
      });
      expect(DEFAULT_LOCK_OPTIONS).toEqual(PhaseStateStore.DEFAULT_LOCK_OPTIONS);
    });
  });
});
