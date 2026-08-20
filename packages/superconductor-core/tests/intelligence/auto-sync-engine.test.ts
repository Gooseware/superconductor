import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import {
  IntelligenceAutoSyncEngine,
  AutoSyncOptions,
  AutoSyncResult,
} from '../../src/intelligence/auto-sync-engine.js';
import * as incrementalUpdater from '../../src/intelligence/incremental-updater.js';
import * as pipeline from '../../src/intelligence/pipeline.js';
import { IntelligenceDriftMonitor } from '../../src/intelligence/drift-monitor.js';

describe('IntelligenceAutoSyncEngine', () => {
  let tmpDir: string;
  let intelligenceDir: string;
  let manifestPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-sync-test-'));
    intelligenceDir = path.join(tmpDir, 'superconductor', 'intelligence');
    fs.mkdirSync(intelligenceDir, { recursive: true });
    manifestPath = path.join(intelligenceDir, '00_manifest.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    vi.restoreAllMocks();
  });

  describe('Delta Calculation (getChangedFiles)', () => {
    it('returns empty array when given an invalid or empty commit SHA', () => {
      expect(IntelligenceAutoSyncEngine.getChangedFiles('')).toEqual([]);
      expect(IntelligenceAutoSyncEngine.getChangedFiles('not-a-sha!@#')).toEqual([]);
    });

    it('parses git diff output into a list of file paths', () => {
      const gitResult = IntelligenceAutoSyncEngine.getChangedFiles('HEAD~1', process.cwd());
      expect(Array.isArray(gitResult)).toBe(true);
    });
  });

  describe('syncPhaseFiles', () => {
    it('returns null if changedFiles is empty', async () => {
      const res = await IntelligenceAutoSyncEngine.syncPhaseFiles([], {
        projectRoot: tmpDir,
        outputDir: intelligenceDir,
      });
      expect(res).toBeNull();
    });

    it('invokes update() and refreshes manifest when changedFiles are provided', async () => {
      const mockReport: incrementalUpdater.UpdateReport = {
        phasesRun: ['complexity', 'sast'],
        filesUpdated: 2,
        durationMs: 45,
        snapshotSha: 'abc1234567',
      };
      const updateSpy = vi.spyOn(incrementalUpdater, 'update').mockResolvedValue(mockReport);

      const res = await IntelligenceAutoSyncEngine.syncPhaseFiles(['src/foo.ts', 'src/bar.ts'], {
        projectRoot: tmpDir,
        outputDir: intelligenceDir,
      });

      expect(updateSpy).toHaveBeenCalledWith({
        projectRoot: tmpDir,
        changedFiles: ['src/foo.ts', 'src/bar.ts'],
        outputDir: intelligenceDir,
      });
      expect(res).toEqual(mockReport);
    });
  });

  describe('ensureFresh', () => {
    it('triggers full runPipeline when manifest is missing', async () => {
      const pipelineSpy = vi.spyOn(pipeline, 'runPipeline').mockImplementation(async () => {
        fs.writeFileSync(
          manifestPath,
          JSON.stringify({
            superconductorVersion: '1.0.0',
            timestamp: Date.now(),
            lastCommitSha: 'full123456',
            incrementalRuns: 0,
          })
        );
      });

      const res = await IntelligenceAutoSyncEngine.ensureFresh({
        projectRoot: tmpDir,
        outputDir: intelligenceDir,
      });

      expect(pipelineSpy).toHaveBeenCalled();
      expect(res.action).toBe('full-scan');
      expect(res.status).toBe('LIVE');
      expect(res.lastCommitSha).toBe('full123456');
    });

    it('triggers full runPipeline when force=true even if manifest exists and is fresh', async () => {
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          superconductorVersion: '1.0.0',
          timestamp: Date.now(),
          lastCommitSha: 'fresh123',
          incrementalRuns: 0,
        })
      );

      const pipelineSpy = vi.spyOn(pipeline, 'runPipeline').mockImplementation(async () => {
        fs.writeFileSync(
          manifestPath,
          JSON.stringify({
            superconductorVersion: '1.0.0',
            timestamp: Date.now(),
            lastCommitSha: 'forced123',
            incrementalRuns: 0,
          })
        );
      });

      const res = await IntelligenceAutoSyncEngine.ensureFresh({
        projectRoot: tmpDir,
        outputDir: intelligenceDir,
        force: true,
      });

      expect(pipelineSpy).toHaveBeenCalled();
      expect(res.action).toBe('full-scan');
      expect(res.lastCommitSha).toBe('forced123');
    });

    it('returns none action and LIVE when 0 commits behind and snapshot is recent', async () => {
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          superconductorVersion: '1.0.0',
          timestamp: Date.now() - 1000,
          lastCommitSha: 'fresh123',
          incrementalRuns: 0,
        })
      );

      vi.spyOn(IntelligenceDriftMonitor, 'checkDrift').mockReturnValue({
        isDrifted: false,
        commitsBehind: 0,
        snapshotAgeMs: 1000,
        incrementalRuns: 0,
        recommendFullRescan: false,
        banner: 'LIVE',
      });

      const res = await IntelligenceAutoSyncEngine.ensureFresh({
        projectRoot: tmpDir,
        outputDir: intelligenceDir,
      });

      expect(res.action).toBe('none');
      expect(res.status).toBe('LIVE');
      expect(res.commitsBehind).toBe(0);
    });

    it('triggers full runPipeline when commitsBehind > 50', async () => {
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          superconductorVersion: '1.0.0',
          timestamp: Date.now() - 500000,
          lastCommitSha: 'old123',
          incrementalRuns: 5,
        })
      );

      vi.spyOn(IntelligenceDriftMonitor, 'checkDrift').mockReturnValue({
        isDrifted: true,
        commitsBehind: 150,
        snapshotAgeMs: 500000,
        incrementalRuns: 5,
        recommendFullRescan: true,
        banner: 'STALE',
      });

      const pipelineSpy = vi.spyOn(pipeline, 'runPipeline').mockImplementation(async () => {
        fs.writeFileSync(
          manifestPath,
          JSON.stringify({
            superconductorVersion: '1.0.0',
            timestamp: Date.now(),
            lastCommitSha: 'newhead123',
            incrementalRuns: 0,
          })
        );
      });

      const res = await IntelligenceAutoSyncEngine.ensureFresh({
        projectRoot: tmpDir,
        outputDir: intelligenceDir,
      });

      expect(pipelineSpy).toHaveBeenCalled();
      expect(res.action).toBe('full-scan');
      expect(res.status).toBe('LIVE');
      expect(res.lastCommitSha).toBe('newhead123');
    });

    it('triggers incremental update when 1 <= commitsBehind <= 50', async () => {
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          superconductorVersion: '1.0.0',
          timestamp: Date.now() - 10000,
          lastCommitSha: 'recent123',
          incrementalRuns: 2,
        })
      );

      vi.spyOn(IntelligenceDriftMonitor, 'checkDrift').mockReturnValue({
        isDrifted: false,
        commitsBehind: 3,
        snapshotAgeMs: 10000,
        incrementalRuns: 2,
        recommendFullRescan: false,
        banner: 'LIVE',
      });

      vi.spyOn(IntelligenceAutoSyncEngine, 'getChangedFiles').mockReturnValue(['src/feature.ts']);

      const mockReport: incrementalUpdater.UpdateReport = {
        phasesRun: ['complexity'],
        filesUpdated: 1,
        durationMs: 25,
        snapshotSha: 'newhead456',
      };
      const updateSpy = vi.spyOn(incrementalUpdater, 'update').mockImplementation(async () => {
        fs.writeFileSync(
          manifestPath,
          JSON.stringify({
            superconductorVersion: '1.0.0',
            timestamp: Date.now(),
            lastCommitSha: 'newhead456',
            incrementalRuns: 3,
          })
        );
        return mockReport;
      });

      const res = await IntelligenceAutoSyncEngine.ensureFresh({
        projectRoot: tmpDir,
        outputDir: intelligenceDir,
      });

      expect(updateSpy).toHaveBeenCalledWith({
        projectRoot: tmpDir,
        changedFiles: ['src/feature.ts'],
        outputDir: intelligenceDir,
      });
      expect(res.action).toBe('incremental');
      expect(res.status).toBe('LIVE');
      expect(res.lastCommitSha).toBe('newhead456');
    });
  });
});
