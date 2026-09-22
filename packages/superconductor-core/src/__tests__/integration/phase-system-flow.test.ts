import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  PhaseRegistryParser,
  PhaseStateStore,
  PhaseTransitionService,
  validatePhaseDependencies,
} from '../../phase/index.js';
import { runPhaseCli } from '../../cli/phase-cli.js';
import type { RegistryManifest, PhaseItem } from '../../phase/index.js';

describe('Phase System End-to-End Integration Flow', () => {
  let tempBaseDir: string;
  let tracksPath: string;

  beforeEach(async () => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-phase-flow-'));
    tracksPath = PhaseStateStore.getTracksPath(tempBaseDir);
    await PhaseStateStore.ensureTracksFile(tracksPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempBaseDir)) {
      try {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // Helper to construct a realistic 3-phase tracks.md fixture
  function create3PhaseMarkdownFixture(): string {
    return `# Project Track Registry

## Phase 1: Core Foundation (Active)

| Status | Track ID | Title | Branch |
|---|---|---|---|
| \`[ ]\` | \`track_auth_01\` | [Authentication System](./tracks/track_auth_01/index.md) | \`track/track_auth_01\` |
| \`[ ]\` | \`track_db_02\` | [Database Engine & Schemas](./tracks/track_db_02/index.md) | \`track/track_db_02\` |

## Phase 2: User Experience (Pending)

| Status | Track ID | Title | Branch |
|---|---|---|---|
| \`[ ]\` | \`track_ui_01\` | [Modern Dashboard](./tracks/track_ui_01/index.md) | \`track/track_ui_01\` |
| \`[ ]\` | \`track_ui_02\` | [Design Token System](./tracks/track_ui_02/index.md) | \`track/track_ui_02\` |

## Phase 3: Analytics & Scale (Planned)

| Status | Track ID | Title | Branch |
|---|---|---|---|
| \`[ ]\` | \`track_perf_01\` | [Telemetry & Monitoring](./tracks/track_perf_01/index.md) | \`track/track_perf_01\` |

## Absorbed / Closed Tracks

| Track ID | Absorbed By | Reason |
|---|---|---|
| \`track_legacy_auth\` | \`track_auth_01\` | Consolidated |

## Archived Tracks (Completed)

- \`archive_20260101\`
`;
  }

  // =========================================================================
  // 1. Multi-Phase Initialization & Parsing
  // =========================================================================
  describe('1. Multi-Phase Initialization & Parsing', () => {
    it('initializes a 3-phase registry fixture and verifies round-trip persistence without data loss', async () => {
      const fixtureMarkdown = create3PhaseMarkdownFixture();
      fs.writeFileSync(tracksPath, fixtureMarkdown, 'utf-8');

      // 1. Parse markdown via PhaseRegistryParser
      const manifest = PhaseRegistryParser.parse(fixtureMarkdown);
      expect(manifest.phases).toHaveLength(3);

      // Verify Phase 1: Active
      const phase1 = manifest.phases[0];
      expect(phase1.phaseId).toBe('core-foundation');
      expect(phase1.name).toBe('Core Foundation');
      expect(phase1.status).toBe('active');
      expect(phase1.ordinal).toBe(1);
      expect(phase1.tracks).toHaveLength(2);
      expect(phase1.tracks[0]).toEqual({
        trackId: 'track_auth_01',
        title: 'Authentication System',
        status: 'planned',
        branch: 'track/track_auth_01',
        link: './tracks/track_auth_01/index.md',
      });
      expect(phase1.tracks[1]).toEqual({
        trackId: 'track_db_02',
        title: 'Database Engine & Schemas',
        status: 'planned',
        branch: 'track/track_db_02',
        link: './tracks/track_db_02/index.md',
      });

      // Verify Phase 2: Pending (mapped to 'planned' status)
      const phase2 = manifest.phases[1];
      expect(phase2.phaseId).toBe('user-experience');
      expect(phase2.name).toBe('User Experience');
      expect(phase2.status).toBe('planned');
      expect(phase2.ordinal).toBe(2);
      expect(phase2.tracks).toHaveLength(2);

      // Verify Phase 3: Planned
      const phase3 = manifest.phases[2];
      expect(phase3.phaseId).toBe('analytics-scale');
      expect(phase3.name).toBe('Analytics & Scale');
      expect(phase3.status).toBe('planned');
      expect(phase3.ordinal).toBe(3);
      expect(phase3.tracks).toHaveLength(1);

      // Verify Absorbed & Archived sections preserved
      expect(manifest.absorbed).toEqual([
        { trackId: 'track_legacy_auth', absorbedBy: 'track_auth_01', reason: 'Consolidated' },
      ]);
      expect(manifest.archived).toEqual(['archive_20260101']);

      // 2. Test PhaseStateStore load under concurrency lock
      const loadedManifest = await PhaseStateStore.load(tempBaseDir);
      expect(loadedManifest).toEqual(manifest);

      // 3. Serialize and save back to disk via PhaseStateStore
      await PhaseStateStore.save(tempBaseDir, loadedManifest);

      // 4. Reload from disk and verify byte-level and semantic round-trip idempotency
      const roundTripped = await PhaseStateStore.load(tempBaseDir);
      expect(roundTripped.phases).toHaveLength(3);
      expect(roundTripped.phases[0].phaseId).toBe('core-foundation');
      expect(roundTripped.phases[1].phaseId).toBe('user-experience');
      expect(roundTripped.phases[2].phaseId).toBe('analytics-scale');
      expect(roundTripped.absorbed).toEqual(manifest.absorbed);
      expect(roundTripped.archived).toEqual(manifest.archived);
    });
  });

  // =========================================================================
  // 2. CLI Commands Integration
  // =========================================================================
  describe('2. CLI Commands Integration', () => {
    let stdoutLines: string[];
    let stderrLines: string[];

    const captureOut = (msg: string) => stdoutLines.push(msg);
    const captureErr = (msg: string) => stderrLines.push(msg);

    beforeEach(() => {
      stdoutLines = [];
      stderrLines = [];
      fs.writeFileSync(tracksPath, create3PhaseMarkdownFixture(), 'utf-8');
    });

    it('formats dynamic ordinals, percentages, and track counts with "list"', async () => {
      const code = await runPhaseCli(['list', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });

      expect(code).toBe(0);
      expect(stderrLines).toHaveLength(0);
      expect(stdoutLines).toHaveLength(3);

      expect(stdoutLines[0]).toBe(
        'Phase 1 (Active): Core Foundation (core-foundation) [0/2 tracks, 0%]'
      );
      expect(stdoutLines[1]).toBe(
        'Phase 2 (Pending): User Experience (user-experience) [0/2 tracks, 0%]'
      );
      expect(stdoutLines[2]).toBe(
        'Phase 3 (Pending): Analytics & Scale (analytics-scale) [0/1 tracks, 0%]'
      );
    });

    it('outputs UX-2 compliant glancable active phase status with "status"', async () => {
      const code = await runPhaseCli(['status', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });

      expect(code).toBe(0);
      expect(stderrLines).toHaveLength(0);
      expect(stdoutLines).toHaveLength(1);
      expect(stdoutLines[0]).toBe(
        '[PHASE] Active: Phase 1: Core Foundation (core-foundation) [0/2 tracks, 0%]'
      );
    });

    it('switches active phase by ordinal and persists change to disk', async () => {
      // Switch to Phase 2 by ordinal "2"
      const code = await runPhaseCli(['switch', '2', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });

      expect(code).toBe(0);
      expect(stdoutLines[0]).toBe(
        '[OK] Switched active phase to Phase 1: User Experience (user-experience)'
      );

      // Verify change persisted to tracks.md on disk
      const updatedManifest = await PhaseStateStore.load(tempBaseDir);
      const activePhase = PhaseTransitionService.getActivePhase(updatedManifest);
      expect(activePhase?.phaseId).toBe('user-experience');
      expect(activePhase?.ordinal).toBe(1);

      // Previously active phase becomes planned/pending
      const oldPhase = updatedManifest.phases.find((p) => p.phaseId === 'core-foundation');
      expect(oldPhase?.status).toBe('planned');

      // Status command now reflects new active phase
      stdoutLines = [];
      await runPhaseCli(['status', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });
      expect(stdoutLines[0]).toBe(
        '[PHASE] Active: Phase 1: User Experience (user-experience) [0/2 tracks, 0%]'
      );
    });

    it('switches active phase by symbolic ID and persists change to disk', async () => {
      // Switch to analytics-scale
      const code = await runPhaseCli(['switch', 'analytics-scale', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });

      expect(code).toBe(0);
      expect(stdoutLines[0]).toBe(
        '[OK] Switched active phase to Phase 1: Analytics & Scale (analytics-scale)'
      );

      const manifest = await PhaseStateStore.load(tempBaseDir);
      expect(PhaseTransitionService.getActivePhase(manifest)?.phaseId).toBe('analytics-scale');

      // Switch back to core-foundation
      stdoutLines = [];
      const codeBack = await runPhaseCli(['switch', 'core-foundation', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });

      expect(codeBack).toBe(0);
      expect(stdoutLines[0]).toBe(
        '[OK] Switched active phase to Phase 1: Core Foundation (core-foundation)'
      );

      const manifestBack = await PhaseStateStore.load(tempBaseDir);
      expect(PhaseTransitionService.getActivePhase(manifestBack)?.phaseId).toBe('core-foundation');
    });

    it('rejects switching to completed or nonexistent phases', async () => {
      // Nonexistent phase
      const code1 = await runPhaseCli(['switch', 'unknown-phase', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });
      expect(code1).toBe(1);
      expect(stderrLines[0]).toContain("Phase 'unknown-phase' not found in manifest");

      // Mark Phase 1 as completed
      await PhaseStateStore.mutate(tempBaseDir, (manifest) => {
        manifest.phases[0].status = 'completed';
        manifest.phases[1].status = 'active';
        return manifest;
      });

      stderrLines = [];
      // Cannot switch to completed phase
      const code2 = await runPhaseCli(['switch', 'core-foundation', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });
      expect(code2).toBe(1);
      expect(stderrLines[0]).toContain("Cannot switch to phase 'core-foundation' because it is already completed");
    });
  });

  // =========================================================================
  // 3. Sliding-Window Progression
  // =========================================================================
  describe('3. Sliding-Window Progression', () => {
    let stdoutLines: string[];
    let stderrLines: string[];

    const captureOut = (msg: string) => stdoutLines.push(msg);
    const captureErr = (msg: string) => stderrLines.push(msg);

    beforeEach(() => {
      stdoutLines = [];
      stderrLines = [];
      fs.writeFileSync(tracksPath, create3PhaseMarkdownFixture(), 'utf-8');
    });

    it('blocks advancement when Phase 1 still has incomplete tracks', async () => {
      const code = await runPhaseCli(['advance', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });

      expect(code).toBe(1);
      expect(stderrLines[0]).toContain(
        '[WARN] Cannot advance window: Phase 1 still has pending/in-progress tracks.'
      );
    });

    it('advances sliding window when all Phase 1 tracks complete, renumbering Phase 2 to Phase 1', async () => {
      // 1. Mark all tracks in Phase 1 as completed
      await PhaseStateStore.mutate(tempBaseDir, (manifest) => {
        manifest.phases[0].tracks.forEach((t) => {
          t.status = 'completed';
        });
        return manifest;
      });

      // Verify completion evaluated to true
      const loaded = await PhaseStateStore.load(tempBaseDir);
      expect(PhaseTransitionService.evaluatePhaseCompletion(loaded.phases[0])).toBe(true);
      expect(PhaseTransitionService.canAdvanceWindow(loaded)).toBe(true);

      // 2. Execute CLI advance command
      const code = await runPhaseCli(['advance', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });

      expect(code).toBe(0);
      expect(stdoutLines[0]).toBe(
        '[OK] Sliding window advanced: Core Foundation marked complete. Phase 2: User Experience is now Phase 1 (Active).'
      );

      // 3. Verify manifest in memory / reloaded from disk
      const updatedManifest = await PhaseStateStore.load(tempBaseDir);

      // Phase 1 is marked 'completed' with dynamic ordinal cleared (undefined)
      const p1 = updatedManifest.phases[0];
      expect(p1.phaseId).toBe('core-foundation');
      expect(p1.status).toBe('completed');
      expect(p1.ordinal).toBeUndefined();

      // Phase 2 becomes the new active Phase 1 with ordinal 1
      const p2 = updatedManifest.phases[1];
      expect(p2.phaseId).toBe('user-experience');
      expect(p2.status).toBe('active');
      expect(p2.ordinal).toBe(1);

      // Phase 3 becomes Phase 2 (Pending) with ordinal 2
      const p3 = updatedManifest.phases[2];
      expect(p3.phaseId).toBe('analytics-scale');
      expect(p3.status).toBe('planned');
      expect(p3.ordinal).toBe(2);

      // 4. Verify updated markdown written to superconductor/tracks.md
      const onDiskMarkdown = fs.readFileSync(tracksPath, 'utf-8');

      // Completed phase header has dynamic ordinal cleared
      expect(onDiskMarkdown).toContain('## Phase: Core Foundation (Completed)');
      // New active phase is Phase 1
      expect(onDiskMarkdown).toContain('## Phase 1: User Experience (Active)');
      // Upcoming phase is renumbered to Phase 2
      expect(onDiskMarkdown).toContain('## Phase 2: Analytics & Scale (Planned)');

      // 5. Verify CLI list command reflects new sliding-window numbering
      stdoutLines = [];
      await runPhaseCli(['list', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });
      expect(stdoutLines).toEqual([
        'Phase (Completed): Core Foundation (core-foundation) [2/2 tracks, 100%]',
        'Phase 1 (Active): User Experience (user-experience) [0/2 tracks, 0%]',
        'Phase 2 (Pending): Analytics & Scale (analytics-scale) [0/1 tracks, 0%]',
      ]);
    });

    it('advances through entire pipeline until all phases are complete', async () => {
      // Complete Phase 1 and advance
      await PhaseStateStore.mutate(tempBaseDir, (m) => {
        m.phases[0].tracks.forEach((t) => (t.status = 'completed'));
        return m;
      });
      await runPhaseCli(['advance', '--project-root', tempBaseDir]);

      // Complete Phase 2 and advance
      await PhaseStateStore.mutate(tempBaseDir, (m) => {
        m.phases[1].tracks.forEach((t) => (t.status = 'completed'));
        return m;
      });
      stdoutLines = [];
      await runPhaseCli(['advance', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });
      expect(stdoutLines[0]).toBe(
        '[OK] Sliding window advanced: User Experience marked complete. Phase 2: Analytics & Scale is now Phase 1 (Active).'
      );

      // Complete Phase 3 and advance final phase
      await PhaseStateStore.mutate(tempBaseDir, (m) => {
        m.phases[2].tracks.forEach((t) => (t.status = 'completed'));
        return m;
      });
      stdoutLines = [];
      await runPhaseCli(['advance', '--project-root', tempBaseDir], {
        stdout: captureOut,
        stderr: captureErr,
      });
      expect(stdoutLines[0]).toBe(
        '[OK] Sliding window advanced: Analytics & Scale marked complete. All phases completed.'
      );

      const finalManifest = await PhaseStateStore.load(tempBaseDir);
      expect(finalManifest.phases.every((p) => p.status === 'completed')).toBe(true);
      expect(finalManifest.phases.every((p) => p.ordinal === undefined)).toBe(true);
      expect(PhaseTransitionService.getActivePhase(finalManifest)).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. Cross-Phase Dependency Deadlock Prevention
  // =========================================================================
  describe('4. Cross-Phase Dependency Deadlock Prevention', () => {
    let manifest: RegistryManifest;

    beforeEach(() => {
      manifest = PhaseRegistryParser.parse(create3PhaseMarkdownFixture());
    });

    it('detects and blocks illegal forward dependencies from earlier to later phases', () => {
      // Phase 1 track (track_auth_01) depending on Phase 2 track (track_ui_01)
      const invalidForwardDeps: Record<string, string[]> = {
        track_auth_01: ['track_ui_01'],
      };

      const result = validatePhaseDependencies(manifest, invalidForwardDeps);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        "Forward phase dependency: track 'track_auth_01' in phase 'core-foundation' (phase 1) cannot depend on track 'track_ui_01' in later phase 'user-experience' (phase 2)"
      );
    });

    it('detects forward dependencies across multiple skipped phases', () => {
      // Phase 1 track depending on Phase 3 track
      const forwardSkipDeps: Record<string, string[]> = {
        track_db_02: ['track_perf_01'],
      };

      const result = validatePhaseDependencies(manifest, forwardSkipDeps);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain(
        "Forward phase dependency: track 'track_db_02' in phase 'core-foundation' (phase 1) cannot depend on track 'track_perf_01' in later phase 'analytics-scale' (phase 3)"
      );
    });

    it('permits legal backward dependencies (later phase depending on earlier phase)', () => {
      // Phase 2 track (track_ui_01) depending on Phase 1 track (track_auth_01)
      const validBackwardDeps: Record<string, string[]> = {
        track_ui_01: ['track_auth_01'],
        track_perf_01: ['track_db_02', 'track_ui_01'],
      };

      const result = validatePhaseDependencies(manifest, validBackwardDeps);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('permits legal intra-phase dependencies (same phase)', () => {
      // track_db_02 depending on track_auth_01 within Phase 1
      const intraPhaseDeps: Record<string, string[]> = {
        track_db_02: ['track_auth_01'],
      };

      const result = validatePhaseDependencies(manifest, intraPhaseDeps);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects circular dependencies within or across tracks', () => {
      // Mutual cycle between track_auth_01 and track_db_02
      const circularDeps: Record<string, string[]> = {
        track_auth_01: ['track_db_02'],
        track_db_02: ['track_auth_01'],
      };

      const result = validatePhaseDependencies(manifest, circularDeps);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Circular dependency detected'))).toBe(true);
    });
  });

  // =========================================================================
  // 5. Batch Execution & Failure Continuation ("Morning Presents")
  // =========================================================================
  describe('5. Batch Execution & Failure Continuation ("Morning Presents")', () => {
    beforeEach(() => {
      fs.writeFileSync(tracksPath, create3PhaseMarkdownFixture(), 'utf-8');
    });

    it('isolates the batch execution queue strictly to pending tracks in the active phase', async () => {
      const manifest = await PhaseStateStore.load(tempBaseDir);
      const activePhase = PhaseTransitionService.getActivePhase(manifest);
      expect(activePhase).toBeDefined();

      // Batch queue resolution logic per Section 1.1 of batch-execute:
      // 1. Target active phase
      // 2. Filter tracks strictly within activePhase having status 'planned' (pending [ ])
      const activeQueue = activePhase!.tracks
        .filter((t) => t.status === 'planned')
        .map((t) => t.trackId);

      expect(activeQueue).toEqual(['track_auth_01', 'track_db_02']);

      // Tracks in downstream Phase 2 and Phase 3 are completely excluded
      expect(activeQueue).not.toContain('track_ui_01');
      expect(activeQueue).not.toContain('track_ui_02');
      expect(activeQueue).not.toContain('track_perf_01');
    });

    it('executes continue-on-failure policy: resets failed track to pending [ ], preserves morning present, and proceeds with remaining tracks', async () => {
      // Simulate Batch Execution Loop (Section 2.0 of batch-execute)
      const manifest = await PhaseStateStore.load(tempBaseDir);
      const activePhase = PhaseTransitionService.getActivePhase(manifest)!;
      const queue = activePhase.tracks.filter((t) => t.status === 'planned');

      const morningPresents: Array<{
        trackId: string;
        phaseId: string;
        error: string;
      }> = [];
      const successfulTracks: string[] = [];

      // Loop through queue sequentially without halting
      for (const track of queue) {
        // 2.1 Set track to in_progress [~] in tracks.md
        await PhaseStateStore.mutate(tempBaseDir, (m) => {
          const t = m.phases[0].tracks.find((item) => item.trackId === track.trackId);
          if (t) t.status = 'in_progress';
          return m;
        });

        if (track.trackId === 'track_auth_01') {
          // Simulate failure on track_auth_01 (e.g. build failure or failing test)
          // 2.4 Continue-on-Failure protocol:
          // Revert status back to pending [ ] so it is not lost and clean worktree state
          await PhaseStateStore.mutate(tempBaseDir, (m) => {
            const t = m.phases[0].tracks.find((item) => item.trackId === track.trackId);
            if (t) t.status = 'planned'; // reverts to [ ]
            return m;
          });

          // Record as morning present
          morningPresents.push({
            trackId: track.trackId,
            phaseId: activePhase.phaseId,
            error: 'TypeScript compile error in packages/auth/src/guard.ts#L42',
          });

          // Policy: DO NOT HALT. Proceed directly to next track!
          continue;
        }

        if (track.trackId === 'track_db_02') {
          // Simulate success on track_db_02
          await PhaseStateStore.mutate(tempBaseDir, (m) => {
            const t = m.phases[0].tracks.find((item) => item.trackId === track.trackId);
            if (t) t.status = 'completed'; // marks as [x]
            return m;
          });
          successfulTracks.push(track.trackId);
        }
      }

      // Assert Batch Loop Results
      expect(morningPresents).toHaveLength(1);
      expect(morningPresents[0].trackId).toBe('track_auth_01');
      expect(successfulTracks).toEqual(['track_db_02']);

      // Verify persistent disk state
      const finalManifest = await PhaseStateStore.load(tempBaseDir);
      const phase1Tracks = finalManifest.phases[0].tracks;

      const track1 = phase1Tracks.find((t) => t.trackId === 'track_auth_01')!;
      const track2 = phase1Tracks.find((t) => t.trackId === 'track_db_02')!;

      // Failed track is safely reverted to [ ] for morning review
      expect(track1.status).toBe('planned');
      // Succeeded track is completed [x]
      expect(track2.status).toBe('completed');

      // Sliding window CANNOT advance because Phase 1 is not 100% complete
      expect(PhaseTransitionService.canAdvanceWindow(finalManifest)).toBe(false);

      // Verify morning present is accurately serialized in markdown on disk
      const diskContent = fs.readFileSync(tracksPath, 'utf-8');
      expect(diskContent).toMatch(/\|\s*`\[ \]`\s*\|\s*`track_auth_01`/);
      expect(diskContent).toMatch(/\|\s*`\[x\]`\s*\|\s*`track_db_02`/);

      // Now simulate developer waking up, inspecting morning present, and applying fix
      await PhaseStateStore.mutate(tempBaseDir, (m) => {
        const t = m.phases[0].tracks.find((item) => item.trackId === 'track_auth_01');
        if (t) t.status = 'completed';
        return m;
      });

      // Now all Phase 1 tracks are completed
      const postFixManifest = await PhaseStateStore.load(tempBaseDir);
      expect(PhaseTransitionService.canAdvanceWindow(postFixManifest)).toBe(true);

      // Sliding window advances successfully
      const advanceResult = PhaseTransitionService.advanceWindow(postFixManifest);
      expect(advanceResult.advanced).toBe(true);
      expect(advanceResult.completedPhase?.phaseId).toBe('core-foundation');
      expect(advanceResult.nextActivePhase?.phaseId).toBe('user-experience');
      expect(advanceResult.nextActivePhase?.ordinal).toBe(1);
    });
  });
});
