import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PhaseManager } from './phase-manager.js';
import { PhaseStateStore } from './phase-state-store.js';
import type { RegistryManifest } from './phase-manifest.js';

describe('PhaseManager', () => {
  let tmpDir: string;
  let scDir: string;
  let tracksFile: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sc-phase-manager-test-'));
    scDir = path.join(tmpDir, 'superconductor');
    tracksFile = path.join(scDir, 'tracks.md');
    await fs.promises.mkdir(scDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  function createSampleManifestMarkdown(): string {
    return `# Tracks Registry

## Phase 1: Foundation (Active)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`track_01\` | Setup Scaffolding | \`feat/setup\` |
| \`[ ]\` | \`track_02\` | Core Types | \`feat/types\` |

## Phase 2: Features (Planned)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[ ]\` | \`track_03\` | Feature Engine | \`feat/engine\` |

## Phase 3: Polish (Planned)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[ ]\` | \`track_04\` | Final Polish | \`feat/polish\` |
`;
  }

  describe('parsePhases', () => {
    it('returns empty manifest when tracks.md does not exist in empty dir', async () => {
      const emptyDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sc-empty-test-'));
      try {
        const manifest = await PhaseManager.parsePhases(emptyDir);
        expect(manifest.phases).toEqual([]);
      } finally {
        await fs.promises.rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('parses phases and tracks from tracks.md', async () => {
      await fs.promises.writeFile(tracksFile, createSampleManifestMarkdown(), 'utf-8');

      const manifest = await PhaseManager.parsePhases(tmpDir);
      expect(manifest.phases).toHaveLength(3);
      expect(manifest.phases[0].phaseId).toBe('foundation');
      expect(manifest.phases[0].status).toBe('active');
      expect(manifest.phases[0].tracks).toHaveLength(2);
      expect(manifest.phases[1].phaseId).toBe('features');
      expect(manifest.phases[1].status).toBe('planned');
    });
  });

  describe('getActivePhase', () => {
    it('returns undefined phase when no active phase is present', async () => {
      const noActiveMd = `# Tracks Registry

## Phase 1: Completed Foundation (Completed)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`t1\` | Done | \`feat/done\` |
`;
      await fs.promises.writeFile(tracksFile, noActiveMd, 'utf-8');

      const result = await PhaseManager.getActivePhase(tmpDir);
      expect(result.phase).toBeUndefined();
      expect(result.completionPercentage).toBe(0);
      expect(result.ordinal).toBeUndefined();
    });

    it('returns active phase details with completion percentage and ordinal', async () => {
      await fs.promises.writeFile(tracksFile, createSampleManifestMarkdown(), 'utf-8');

      const result = await PhaseManager.getActivePhase(tmpDir);
      expect(result.phase).toBeDefined();
      expect(result.phase?.phaseId).toBe('foundation');
      expect(result.phase?.status).toBe('active');
      expect(result.completionPercentage).toBe(50); // 1 of 2 tracks complete
      expect(result.ordinal).toBe(1);
    });
  });

  describe('switchPhase', () => {
    it('switches active phase using symbolic phaseId and persists to disk', async () => {
      await fs.promises.writeFile(tracksFile, createSampleManifestMarkdown(), 'utf-8');

      const result = await PhaseManager.switchPhase(tmpDir, 'features');
      expect(result.previousPhaseId).toBe('foundation');
      expect(result.newPhaseId).toBe('features');

      // Check re-loaded state from disk
      const reloaded = await PhaseManager.parsePhases(tmpDir);
      const foundation = reloaded.phases.find((p) => p.phaseId === 'foundation');
      const features = reloaded.phases.find((p) => p.phaseId === 'features');

      expect(foundation?.status).toBe('planned');
      expect(features?.status).toBe('active');
      expect(features?.ordinal).toBe(1);
    });

    it('switches active phase using numeric ordinal string "2"', async () => {
      await fs.promises.writeFile(tracksFile, createSampleManifestMarkdown(), 'utf-8');

      const result = await PhaseManager.switchPhase(tmpDir, '2');
      expect(result.newPhaseId).toBe('features');

      const active = await PhaseManager.getActivePhase(tmpDir);
      expect(active.phase?.phaseId).toBe('features');
    });

    it('switches active phase using "Phase 2" prefix', async () => {
      await fs.promises.writeFile(tracksFile, createSampleManifestMarkdown(), 'utf-8');

      const result = await PhaseManager.switchPhase(tmpDir, 'Phase 2');
      expect(result.newPhaseId).toBe('features');

      const active = await PhaseManager.getActivePhase(tmpDir);
      expect(active.phase?.phaseId).toBe('features');
    });

    it('switches active phase using phase name match', async () => {
      await fs.promises.writeFile(tracksFile, createSampleManifestMarkdown(), 'utf-8');

      const result = await PhaseManager.switchPhase(tmpDir, 'Polish');
      expect(result.newPhaseId).toBe('polish');

      const active = await PhaseManager.getActivePhase(tmpDir);
      expect(active.phase?.phaseId).toBe('polish');
    });

    it('throws when target phase does not exist', async () => {
      await fs.promises.writeFile(tracksFile, createSampleManifestMarkdown(), 'utf-8');

      await expect(PhaseManager.switchPhase(tmpDir, 'non-existent')).rejects.toThrow(
        /Phase 'non-existent' not found in manifest/
      );
    });

    it('throws when target phase is already completed', async () => {
      const completedMd = `# Tracks Registry

## Phase 1: Foundation (Completed)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`track_01\` | Setup Scaffolding | \`feat/setup\` |

## Phase 2: Features (Active)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[ ]\` | \`track_03\` | Feature Engine | \`feat/engine\` |
`;
      await fs.promises.writeFile(tracksFile, completedMd, 'utf-8');

      await expect(PhaseManager.switchPhase(tmpDir, 'foundation')).rejects.toThrow(
        /already completed/
      );
    });
  });

  describe('advance', () => {
    it('advances window when active phase is 100% complete and saves to disk', async () => {
      const readyToAdvanceMd = `# Tracks Registry

## Phase 1: Foundation (Active)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`track_01\` | Done 1 | \`feat/1\` |
| \`[x]\` | \`track_02\` | Done 2 | \`feat/2\` |

## Phase 2: Features (Planned)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[ ]\` | \`track_03\` | Feature Engine | \`feat/engine\` |
`;
      await fs.promises.writeFile(tracksFile, readyToAdvanceMd, 'utf-8');

      const result = await PhaseManager.advance(tmpDir);
      expect(result.advanced).toBe(true);
      expect(result.completedPhase?.phaseId).toBe('foundation');
      expect(result.completedPhase?.status).toBe('completed');
      expect(result.nextActivePhase?.phaseId).toBe('features');
      expect(result.nextActivePhase?.status).toBe('active');
      expect(result.nextActivePhase?.ordinal).toBe(1);

      // Verify persisted state on disk
      const reloaded = await PhaseManager.parsePhases(tmpDir);
      expect(reloaded.phases[0].status).toBe('completed');
      expect(reloaded.phases[0].ordinal).toBeUndefined();
      expect(reloaded.phases[1].status).toBe('active');
      expect(reloaded.phases[1].ordinal).toBe(1);
    });

    it('does not advance when active phase tracks are incomplete', async () => {
      await fs.promises.writeFile(tracksFile, createSampleManifestMarkdown(), 'utf-8');

      const result = await PhaseManager.advance(tmpDir);
      expect(result.advanced).toBe(false);
      expect(result.completedPhase).toBeUndefined();
      expect(result.nextActivePhase).toBeUndefined();

      // Verify active phase remains unchanged
      const active = await PhaseManager.getActivePhase(tmpDir);
      expect(active.phase?.phaseId).toBe('foundation');
      expect(active.phase?.status).toBe('active');
    });
  });

  describe('instance methods', () => {
    it('supports instantiation and instance method delegates', async () => {
      await fs.promises.writeFile(tracksFile, createSampleManifestMarkdown(), 'utf-8');

      const manager = new PhaseManager(tmpDir);
      const manifest = await manager.parsePhases();
      expect(manifest.phases).toHaveLength(3);

      const active = await manager.getActivePhase();
      expect(active.phase?.phaseId).toBe('foundation');

      const switched = await manager.switchPhase('features');
      expect(switched.newPhaseId).toBe('features');

      const advanceResult = await manager.advance();
      expect(advanceResult.advanced).toBe(false);
    });
  });
});
