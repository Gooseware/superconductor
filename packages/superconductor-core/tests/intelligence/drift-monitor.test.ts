import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'child_process';
import { IntelligenceDriftMonitor, Manifest, DriftReport } from '../../src/intelligence/drift-monitor';

vi.mock('child_process');

function makeSpawnResult(stdout: string, status = 0) {
  return {
    pid: 0,
    output: [],
    stdout,
    stderr: '',
    status,
    signal: null,
    error: undefined,
  } as any;
}

function freshManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    lastCommitSha: 'abc1234def567890',
    timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    incrementalRuns: 3,
    ...overrides,
  };
}

describe('IntelligenceDriftMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: 0 commits behind, git succeeds
    vi.mocked(childProcess.spawnSync).mockReturnValue(makeSpawnResult('0\n'));
  });

  // ─── checkDrift ──────────────────────────────────────────────────────────────

  describe('checkDrift()', () => {
    it('fresh manifest (0 commits behind, age < 1h) → LIVE, isDrifted=false, recommendFullRescan=false', () => {
      const manifest = freshManifest();
      const report = IntelligenceDriftMonitor.checkDrift(manifest, '/fake/root');

      expect(report.isDrifted).toBe(false);
      expect(report.recommendFullRescan).toBe(false);
      expect(report.commitsBehind).toBe(0);
      expect(report.banner).toContain('LIVE');
    });

    it('15 commits behind → STALE, isDrifted=true', () => {
      vi.mocked(childProcess.spawnSync).mockReturnValue(makeSpawnResult('15\n'));
      const manifest = freshManifest();
      const report = IntelligenceDriftMonitor.checkDrift(manifest, '/fake/root');

      expect(report.isDrifted).toBe(true);
      expect(report.commitsBehind).toBe(15);
      expect(report.banner).toContain('STALE');
    });

    it('incrementalRuns=50 → recommendFullRescan=true', () => {
      const manifest = freshManifest({ incrementalRuns: 50 });
      const report = IntelligenceDriftMonitor.checkDrift(manifest, '/fake/root');

      expect(report.recommendFullRescan).toBe(true);
      expect(report.incrementalRuns).toBe(50);
    });

    it('snapshotAgeMs > 7 days → recommendFullRescan=true', () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 3600 * 1000;
      const manifest = freshManifest({ timestamp: eightDaysAgo });
      const report = IntelligenceDriftMonitor.checkDrift(manifest, '/fake/root');

      expect(report.recommendFullRescan).toBe(true);
      expect(report.snapshotAgeMs).toBeGreaterThan(7 * 24 * 3600 * 1000);
    });

    it('commitsBehind=11 → isDrifted=true but recommendFullRescan=false (if age < 7d, runs < 50)', () => {
      vi.mocked(childProcess.spawnSync).mockReturnValue(makeSpawnResult('11\n'));
      const manifest = freshManifest({ incrementalRuns: 5 });
      const report = IntelligenceDriftMonitor.checkDrift(manifest, '/fake/root');

      expect(report.isDrifted).toBe(true);
      expect(report.commitsBehind).toBe(11);
      expect(report.recommendFullRescan).toBe(false);
    });

    it('snapshotAgeMs > 24h → isDrifted=true', () => {
      const twoDaysAgo = Date.now() - 25 * 3600 * 1000;
      const manifest = freshManifest({ timestamp: twoDaysAgo });
      const report = IntelligenceDriftMonitor.checkDrift(manifest, '/fake/root');

      expect(report.isDrifted).toBe(true);
    });
  });

  // ─── Invalid/missing lastCommitSha ───────────────────────────────────────────

  describe('invalid / missing lastCommitSha', () => {
    it('missing lastCommitSha → commitsBehind=Infinity, STALE banner', () => {
      const manifest = freshManifest({ lastCommitSha: undefined });
      const report = IntelligenceDriftMonitor.checkDrift(manifest, '/fake/root');

      expect(report.commitsBehind).toBe(Infinity);
      expect(report.isDrifted).toBe(true);
      expect(report.banner).toContain('STALE');
      // spawnSync should NOT be called when SHA is missing
      expect(childProcess.spawnSync).not.toHaveBeenCalled();
    });

    it('invalid SHA (too short) → commitsBehind=Infinity, STALE banner', () => {
      const manifest = freshManifest({ lastCommitSha: 'abc' });
      const report = IntelligenceDriftMonitor.checkDrift(manifest, '/fake/root');

      expect(report.commitsBehind).toBe(Infinity);
      expect(report.isDrifted).toBe(true);
      expect(report.banner).toContain('STALE');
      expect(childProcess.spawnSync).not.toHaveBeenCalled();
    });

    it('git exits non-zero → commitsBehind=Infinity, STALE banner', () => {
      vi.mocked(childProcess.spawnSync).mockReturnValue(makeSpawnResult('', 128));
      const manifest = freshManifest();
      const report = IntelligenceDriftMonitor.checkDrift(manifest, '/fake/root');

      expect(report.commitsBehind).toBe(Infinity);
      expect(report.isDrifted).toBe(true);
      expect(report.banner).toContain('STALE');
    });

    it('passes correct git args using spawnSync — never execSync', () => {
      const manifest = freshManifest({ lastCommitSha: 'aabbccdd11223344' });
      IntelligenceDriftMonitor.checkDrift(manifest, '/my/project');

      expect(childProcess.spawnSync).toHaveBeenCalledWith(
        'git',
        ['rev-list', '--count', 'aabbccdd11223344..HEAD'],
        { cwd: '/my/project', encoding: 'utf8' }
      );
    });
  });

  // ─── formatBanner ────────────────────────────────────────────────────────────

  describe('formatBanner()', () => {
    it('LIVE banner contains correct emoji and text', () => {
      const report: DriftReport = {
        isDrifted: false,
        commitsBehind: 0,
        snapshotAgeMs: 30 * 60 * 1000, // 30 min
        incrementalRuns: 7,
        recommendFullRescan: false,
        banner: '',
      };
      const banner = IntelligenceDriftMonitor.formatBanner(report);
      expect(banner).toContain('\u2139\ufe0f');
      expect(banner).toContain('LIVE');
      expect(banner).toContain('30m');
      expect(banner).toContain('7 incremental runs');
    });

    it('STALE banner (isDrifted=true, recommendFullRescan=true) contains ⚠️ and setup hint', () => {
      const report: DriftReport = {
        isDrifted: true,
        commitsBehind: 60,
        snapshotAgeMs: 8 * 24 * 3600 * 1000, // 8 days
        incrementalRuns: 10,
        recommendFullRescan: true,
        banner: '',
      };
      const banner = IntelligenceDriftMonitor.formatBanner(report);
      expect(banner).toContain('\u26a0\ufe0f');
      expect(banner).toContain('STALE');
      expect(banner).toContain('/superconductor:setup');
    });

    it('STALE banner (isDrifted=true, recommendFullRescan=false) also shows ⚠️', () => {
      const report: DriftReport = {
        isDrifted: true,
        commitsBehind: 11,
        snapshotAgeMs: 2 * 3600 * 1000, // 2 hours
        incrementalRuns: 5,
        recommendFullRescan: false,
        banner: '',
      };
      const banner = IntelligenceDriftMonitor.formatBanner(report);
      expect(banner).toContain('\u26a0\ufe0f');
      expect(banner).toContain('STALE');
    });

    it('NONE banner from noBanner() contains ❌ and keyword heuristics', () => {
      const banner = IntelligenceDriftMonitor.noBanner();
      expect(banner).toContain('\u274c');
      expect(banner).toContain('NONE');
      expect(banner).toContain('keyword heuristics active');
      expect(banner).toContain('/superconductor:setup');
    });

    it('LIVE banner uses hours for ages >= 60 minutes', () => {
      const report: DriftReport = {
        isDrifted: false,
        commitsBehind: 2,
        snapshotAgeMs: 3 * 3600 * 1000, // 3 hours
        incrementalRuns: 1,
        recommendFullRescan: false,
        banner: '',
      };
      const banner = IntelligenceDriftMonitor.formatBanner(report);
      expect(banner).toContain('3h');
    });

    it('STALE banner uses days for ages >= 24 hours', () => {
      const report: DriftReport = {
        isDrifted: true,
        commitsBehind: 15,
        snapshotAgeMs: 3 * 24 * 3600 * 1000, // 3 days
        incrementalRuns: 0,
        recommendFullRescan: false,
        banner: '',
      };
      const banner = IntelligenceDriftMonitor.formatBanner(report);
      expect(banner).toContain('3d');
    });

    it('STALE banner shows ? for Infinity commitsBehind', () => {
      const report: DriftReport = {
        isDrifted: true,
        commitsBehind: Infinity,
        snapshotAgeMs: 5 * 60 * 1000,
        incrementalRuns: 0,
        recommendFullRescan: true,
        banner: '',
      };
      const banner = IntelligenceDriftMonitor.formatBanner(report);
      expect(banner).toContain('?');
    });
  });
});
