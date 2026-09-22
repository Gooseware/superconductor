import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runPhaseCli, resolveTargetPhase } from './phase-cli.js';
import { PhaseStateStore } from '../phase/phase-state-store.js';
import { PhaseTransitionService } from '../phase/phase-transition-service.js';
import type { RegistryManifest } from '../phase/phase-manifest.js';

describe('runPhaseCli', () => {
  let tmpDir: string;
  let stdoutLogs: string[];
  let stderrLogs: string[];

  const mockStdout = (msg: string) => {
    stdoutLogs.push(msg);
  };

  const mockStderr = (msg: string) => {
    stderrLogs.push(msg);
  };

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sc-phase-cli-test-'));
    stdoutLogs = [];
    stderrLogs = [];
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  const createSampleManifest = (): RegistryManifest => ({
    phases: [
      {
        phaseId: 'core-foundation',
        name: 'Core Foundation',
        status: 'active',
        ordinal: 1,
        tracks: [
          {
            trackId: 'track_1',
            title: 'Foundation Track 1',
            status: 'completed',
          },
          {
            trackId: 'track_2',
            title: 'Foundation Track 2',
            status: 'in_progress',
          },
        ],
      },
      {
        phaseId: 'ux-polish',
        name: 'UX Polish',
        status: 'planned',
        ordinal: 2,
        tracks: [
          {
            trackId: 'track_3',
            title: 'UX Track 1',
            status: 'planned',
          },
        ],
      },
      {
        phaseId: 'scale-up',
        name: 'Scale Up',
        status: 'planned',
        ordinal: 3,
        tracks: [
          {
            trackId: 'track_4',
            title: 'Scale Track 1',
            status: 'planned',
          },
        ],
      },
    ],
  });

  describe('resolveTargetPhase', () => {
    it('resolves by exact phaseId', () => {
      const manifest = createSampleManifest();
      const phase = resolveTargetPhase(manifest, 'core-foundation');
      expect(phase?.phaseId).toBe('core-foundation');
    });

    it('resolves by case-insensitive phaseId', () => {
      const manifest = createSampleManifest();
      const phase = resolveTargetPhase(manifest, 'CORE-FOUNDATION');
      expect(phase?.phaseId).toBe('core-foundation');
    });

    it('resolves by numeric ordinal', () => {
      const manifest = createSampleManifest();
      const phase1 = resolveTargetPhase(manifest, '1');
      expect(phase1?.phaseId).toBe('core-foundation');

      const phase2 = resolveTargetPhase(manifest, '2');
      expect(phase2?.phaseId).toBe('ux-polish');
    });

    it('resolves by Phase prefix ordinal', () => {
      const manifest = createSampleManifest();
      const phase = resolveTargetPhase(manifest, 'Phase 2');
      expect(phase?.phaseId).toBe('ux-polish');
    });

    it('resolves by case-insensitive name', () => {
      const manifest = createSampleManifest();
      const phase = resolveTargetPhase(manifest, 'core foundation');
      expect(phase?.phaseId).toBe('core-foundation');
    });

    it('returns undefined if not found', () => {
      const manifest = createSampleManifest();
      const phase = resolveTargetPhase(manifest, 'nonexistent');
      expect(phase).toBeUndefined();
    });
  });

  describe('list subcommand', () => {
    it('prints formatted list of phases with ordinals, percentages, and track counts', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['list'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toHaveLength(3);
      expect(stdoutLogs[0]).toBe('Phase 1 (Active): Core Foundation (core-foundation) [1/2 tracks, 50%]');
      expect(stdoutLogs[1]).toBe('Phase 2 (Pending): UX Polish (ux-polish) [0/1 tracks, 0%]');
      expect(stdoutLogs[2]).toBe('Phase 3 (Pending): Scale Up (scale-up) [0/1 tracks, 0%]');
    });

    it('handles completed phases in list output', async () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'bootstrap',
            name: 'Bootstrap',
            status: 'completed',
            tracks: [
              { trackId: 't0', title: 'Init', status: 'completed' },
            ],
          },
          {
            phaseId: 'core-foundation',
            name: 'Core Foundation',
            status: 'active',
            ordinal: 1,
            tracks: [
              { trackId: 't1', title: 'Task 1', status: 'completed' },
            ],
          },
        ],
      };
      await PhaseStateStore.save(tmpDir, manifest);

      const code = await runPhaseCli(['list'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs[0]).toBe('Phase (Completed): Bootstrap (bootstrap) [1/1 tracks, 100%]');
      expect(stdoutLogs[1]).toBe('Phase 1 (Active): Core Foundation (core-foundation) [1/1 tracks, 100%]');
    });

    it('handles empty manifest or missing tracks.md gracefully', async () => {
      const code = await runPhaseCli(['list'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain('No phases found.');
    });
  });

  describe('status subcommand', () => {
    it('displays concise glancable status of active phase conforming to UX-2 formatting', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['status'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain(
        '[PHASE] Active: Phase 1: Core Foundation (core-foundation) [1/2 tracks, 50%]'
      );
    });

    it('emits warning and exit code 1 if no active phase is found', async () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'pending-only',
            name: 'Pending Only',
            status: 'planned',
            tracks: [],
          },
        ],
      };
      await PhaseStateStore.save(tmpDir, manifest);

      const code = await runPhaseCli(['status'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(1);
      expect(stderrLogs).toContain('[WARN] No active phase found.');
    });

    it('handles missing tracks.md gracefully', async () => {
      const code = await runPhaseCli(['status'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(1);
      expect(stderrLogs).toContain('[WARN] No active phase found.');
    });
  });

  describe('switch subcommand', () => {
    it('switches active phase by symbolic ID and emits banner', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['switch', 'ux-polish'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain('[OK] Switched active phase to Phase 1: UX Polish (ux-polish)');

      // Verify persistence on disk
      const updated = await PhaseStateStore.load(tmpDir);
      const active = updated.phases.find((p) => p.status === 'active');
      expect(active?.phaseId).toBe('ux-polish');
      const prev = updated.phases.find((p) => p.phaseId === 'core-foundation');
      expect(prev?.status).toBe('planned');
    });

    it('switches active phase by numeric ordinal', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['switch', '2'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain('[OK] Switched active phase to Phase 1: UX Polish (ux-polish)');

      const updated = await PhaseStateStore.load(tmpDir);
      expect(updated.phases.find((p) => p.status === 'active')?.phaseId).toBe('ux-polish');
    });

    it('switches active phase by "Phase 3" ordinal string', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['switch', 'Phase 3'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain('[OK] Switched active phase to Phase 1: Scale Up (scale-up)');
    });

    it('returns exit code 1 when target phase is not found', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['switch', 'nonexistent-phase'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(1);
      expect(stderrLogs[0]).toContain(
        "[FAIL] Phase 'nonexistent-phase' not found in manifest. Run 'superconductor phase list' to inspect available phases."
      );
    });

    it('returns exit code 1 when target phase is already completed', async () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'done-phase',
            name: 'Done Phase',
            status: 'completed',
            tracks: [{ trackId: 't0', title: 'T0', status: 'completed' }],
          },
          {
            phaseId: 'active-phase',
            name: 'Active Phase',
            status: 'active',
            ordinal: 1,
            tracks: [],
          },
        ],
      };
      await PhaseStateStore.save(tmpDir, manifest);

      const code = await runPhaseCli(['switch', 'done-phase'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(1);
      expect(stderrLogs[0]).toContain("Cannot switch to phase 'done-phase' because it is already completed");
    });

    it('supports interactive phase selection when no target arg is passed', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const mockPromptFn = async () => ({ phaseId: 'scale-up' });

      const code = await runPhaseCli(['switch'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
        promptFn: mockPromptFn,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain('[OK] Switched active phase to Phase 1: Scale Up (scale-up)');

      const updated = await PhaseStateStore.load(tmpDir);
      expect(updated.phases.find((p) => p.status === 'active')?.phaseId).toBe('scale-up');
    });

    it('handles interactive selection cancellation gracefully', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const mockPromptFn = async () => ({});

      const code = await runPhaseCli(['switch'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
        promptFn: mockPromptFn,
      });

      expect(code).toBe(1);
      expect(stderrLogs).toContain('[FAIL] Phase selection cancelled.');
    });

    it('returns exit code 1 when target is missing and non-interactive', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['switch'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(1);
      expect(stderrLogs[0]).toContain('Missing target phase identifier');
    });
  });

  describe('advance subcommand', () => {
    it('fails to advance when Phase 1 has pending/in-progress tracks', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['advance'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(1);
      expect(stderrLogs).toContain(
        '[WARN] Cannot advance window: Phase 1 still has pending/in-progress tracks.'
      );

      // Verify phase states on disk remained active
      const manifest = await PhaseStateStore.load(tmpDir);
      expect(manifest.phases[0].status).toBe('active');
    });

    it('advances window when Phase 1 is 100% completed', async () => {
      const manifest = createSampleManifest();
      // Mark all Phase 1 tracks completed
      manifest.phases[0].tracks[1].status = 'completed';
      await PhaseStateStore.save(tmpDir, manifest);

      const code = await runPhaseCli(['advance'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain(
        '[OK] Sliding window advanced: Core Foundation marked complete. Phase 2: UX Polish is now Phase 1 (Active).'
      );

      // Verify persistence on disk
      const updated = await PhaseStateStore.load(tmpDir);
      expect(updated.phases[0].status).toBe('completed');
      expect(PhaseTransitionService.getDisplayOrdinal(updated.phases[0].phaseId, updated)).toBeUndefined();
      expect(updated.phases[1].status).toBe('active');
      expect(PhaseTransitionService.getDisplayOrdinal(updated.phases[1].phaseId, updated)).toBe(1);
      expect(updated.phases[2].status).toBe('planned');
      expect(PhaseTransitionService.getDisplayOrdinal(updated.phases[2].phaseId, updated)).toBe(2);
    });

    it('advances window and detects all phases completed when last phase finishes', async () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'final-phase',
            name: 'Final Phase',
            status: 'active',
            ordinal: 1,
            tracks: [
              { trackId: 't_final', title: 'Final Task', status: 'completed' },
            ],
          },
        ],
      };
      await PhaseStateStore.save(tmpDir, manifest);

      const code = await runPhaseCli(['advance'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain(
        '[OK] Sliding window advanced: Final Phase marked complete. All phases completed.'
      );

      const updated = await PhaseStateStore.load(tmpDir);
      expect(updated.phases[0].status).toBe('completed');
    });

    it('handles advance failure on empty tracks.md', async () => {
      const code = await runPhaseCli(['advance'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(1);
      expect(stderrLogs).toContain(
        '[WARN] Cannot advance window: Phase 1 still has pending/in-progress tracks.'
      );
    });
  });

  describe('help and unknown commands', () => {
    it('displays help when no arguments provided', async () => {
      const code = await runPhaseCli([], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs.some((l) => l.includes('Usage:'))).toBe(true);
    });

    it('displays help when --help flag is passed', async () => {
      const code = await runPhaseCli(['--help'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs.some((l) => l.includes('Superconductor Phase Management CLI'))).toBe(true);
    });

    it('returns exit code 1 for unknown command', async () => {
      const code = await runPhaseCli(['unknown-subcommand'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(1);
      expect(stderrLogs[0]).toContain('[FAIL] Unknown command: unknown-subcommand');
    });
  });

  describe('--project-root flag', () => {
    it('respects --project-root argument in args array', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['--project-root', tmpDir, 'status'], {
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain(
        '[PHASE] Active: Phase 1: Core Foundation (core-foundation) [1/2 tracks, 50%]'
      );
    });

    it('respects --project-root=path syntax', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli([`--project-root=${tmpDir}`, 'status'], {
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain(
        '[PHASE] Active: Phase 1: Core Foundation (core-foundation) [1/2 tracks, 50%]'
      );
    });

    it('tolerates leading "phase" in args', async () => {
      await PhaseStateStore.save(tmpDir, createSampleManifest());

      const code = await runPhaseCli(['phase', 'status'], {
        projectRoot: tmpDir,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      expect(code).toBe(0);
      expect(stdoutLogs).toContain(
        '[PHASE] Active: Phase 1: Core Foundation (core-foundation) [1/2 tracks, 50%]'
      );
    });
  });
});
