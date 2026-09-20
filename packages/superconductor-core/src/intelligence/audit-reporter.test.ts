import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import { IntelligenceAuditReporter, AuditReport } from './audit-reporter.js';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof child_process>();
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

describe('IntelligenceAuditReporter', () => {
  let tempDir: string;
  let repoDir: string;
  let otherRepoDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-audit-reporter-test-'));
    repoDir = path.join(tempDir, 'repo');
    otherRepoDir = path.join(tempDir, 'other-repo');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(otherRepoDir, { recursive: true });
    // Default spawnSync: 0 commits behind
    vi.mocked(child_process.spawnSync).mockReturnValue({
      status: 0,
      stdout: '0\n',
      stderr: '',
      pid: 0,
      output: [],
      signal: null,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('NONE status', () => {
    it('returns status NONE when 00_manifest.json does not exist in outputDir', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.status).toBe('NONE');
      expect(report.project_root).toBe(fs.realpathSync(repoDir));
      expect(report.manifest_project_root).toBeNull();
      expect(report.snapshot_path).toBe(path.resolve(outputDir, '00_manifest.json'));
      expect(report.head_commit).toBe('unknown');
      expect(report.age_days).toBe(0);
      expect(report.commits_behind).toBe(0);
      expect(report.phases_ok).toBe(false);
    });

    it('returns status NONE when manifest contains invalid JSON', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), '{ invalid json ...');

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.status).toBe('NONE');
      expect(report.manifest_project_root).toBeNull();
      expect(report.phases_ok).toBe(false);
    });
  });

  describe('MISMATCH status', () => {
    it('returns status MISMATCH when manifest.projectRoot !== projectRoot', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      const manifestContent = {
        superconductorVersion: '1.0.0',
        timestamp: Date.now() - 60000,
        lastCommitSha: '1122334455667788',
        projectRoot: otherRepoDir,
        phases: { p1_fingerprint: { output: 'ok' } },
        degraded: [],
      };
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.status).toBe('MISMATCH');
      expect(report.project_root).toBe(fs.realpathSync(repoDir));
      expect(report.manifest_project_root).toBe(otherRepoDir);
      expect(report.snapshot_path).toBe(path.join(outputDir, '00_manifest.json'));
      expect(report.head_commit).toBe('1122334455667788');
      expect(report.phases_ok).toBe(true);
    });

    it('resolves symlinks and does NOT report MISMATCH when manifest.projectRoot points to the same canonical directory', () => {
      const symlinkRepoDir = path.join(tempDir, 'symlink-repo');
      fs.symlinkSync(repoDir, symlinkRepoDir, 'dir');

      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      const manifestContent = {
        superconductorVersion: '1.0.0',
        timestamp: Date.now() - 60000,
        lastCommitSha: 'unknown',
        projectRoot: symlinkRepoDir,
        phases: { p1_fingerprint: { output: 'ok' } },
        degraded: [],
      };
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.status).toBe('LIVE');
      expect(report.project_root).toBe(fs.realpathSync(repoDir));
    });
  });

  describe('LIVE status', () => {
    it('returns status LIVE for fresh snapshot with matching project root and 0 commits behind', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      vi.mocked(child_process.spawnSync).mockReturnValue({
        status: 0,
        stdout: '0\n',
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
      } as any);

      const now = Date.now();
      const manifestContent = {
        superconductorVersion: '1.0.0',
        timestamp: now - 10 * 60 * 1000, // 10 minutes ago
        lastCommitSha: 'a1b2c3d4e5f60718',
        projectRoot: repoDir,
        phases: {
          p1_fingerprint: { output: 'ok' },
          p2_dependency_graph: { output: 'ok' },
        },
        degraded: [],
      };
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.status).toBe('LIVE');
      expect(report.project_root).toBe(fs.realpathSync(repoDir));
      expect(report.manifest_project_root).toBe(repoDir);
      expect(report.head_commit).toBe('a1b2c3d4e5f60718');
      expect(report.commits_behind).toBe(0);
      expect(report.phases_ok).toBe(true);
      expect(report.age_days).toBeLessThan(1);
      expect(report.phases).toEqual({
        p1_fingerprint: 'ok',
        p2_dependency_graph: 'ok',
      });
    });

    it('returns status LIVE in greenfield 0-commit repository where lastCommitSha is "unknown"', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      const manifestContent = {
        superconductorVersion: '1.0.0',
        timestamp: Date.now() - 5000,
        lastCommitSha: 'unknown',
        projectRoot: repoDir,
        phases: {
          p1_fingerprint: { output: 'ok' },
        },
        degraded: [],
      };
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.status).toBe('LIVE');
      expect(report.commits_behind).toBe(0);
      expect(report.head_commit).toBe('unknown');
      expect(report.phases_ok).toBe(true);
      // rev-list should not be called when lastCommitSha is unknown
      expect(child_process.spawnSync).not.toHaveBeenCalled();
    });

    it('finds manifest located at nested superconductor/intelligence/00_manifest.json when project root is passed as outputDir', () => {
      const nestedDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(nestedDir, { recursive: true });

      const manifestContent = {
        superconductorVersion: '1.0.0',
        timestamp: Date.now() - 5000,
        lastCommitSha: 'unknown',
        projectRoot: repoDir,
        phases: {},
        degraded: [],
      };
      fs.writeFileSync(path.join(nestedDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(repoDir);

      expect(report.status).toBe('LIVE');
      expect(report.snapshot_path).toBe(path.join(nestedDir, '00_manifest.json'));
      expect(report.project_root).toBe(fs.realpathSync(repoDir));
    });
  });

  describe('STALE status', () => {
    it('returns status STALE when snapshot age is > 24 hours', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      vi.mocked(child_process.spawnSync).mockReturnValue({
        status: 0,
        stdout: '0\n',
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
      } as any);

      const twoDaysAgo = Date.now() - 48 * 3600 * 1000;
      const manifestContent = {
        superconductorVersion: '1.0.0',
        timestamp: twoDaysAgo,
        lastCommitSha: 'a1b2c3d4e5f60718',
        projectRoot: repoDir,
        phases: {},
        degraded: [],
      };
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.status).toBe('STALE');
      expect(report.age_days).toBeGreaterThanOrEqual(1.9);
      expect(report.commits_behind).toBe(0);
    });

    it('returns status STALE when repository is > 10 commits behind HEAD', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      vi.mocked(child_process.spawnSync).mockReturnValue({
        status: 0,
        stdout: '15\n',
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
      } as any);

      const manifestContent = {
        superconductorVersion: '1.0.0',
        timestamp: Date.now() - 30 * 60 * 1000,
        lastCommitSha: 'a1b2c3d4e5f60718',
        projectRoot: repoDir,
        phases: {},
        degraded: [],
      };
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.status).toBe('STALE');
      expect(report.commits_behind).toBe(15);
    });
  });

  describe('phases verification', () => {
    it('sets phases_ok to false when degraded list is non-empty', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      const manifestContent = {
        superconductorVersion: '1.0.0',
        timestamp: Date.now() - 1000,
        lastCommitSha: 'unknown',
        projectRoot: repoDir,
        phases: {
          p1_fingerprint: { output: 'ok' },
          p3_complexity: { output: 'degraded' },
        },
        degraded: ['p3_complexity'],
      };
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.phases_ok).toBe(false);
      expect(report.phases).toEqual({
        p1_fingerprint: 'ok',
        p3_complexity: 'degraded',
      });
    });

    it('sets phases_ok to false when any phase has status degraded or error even if degraded array is missing', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      const manifestContent = {
        superconductorVersion: '1.0.0',
        timestamp: Date.now() - 1000,
        lastCommitSha: 'unknown',
        projectRoot: repoDir,
        phases: {
          p1_fingerprint: 'ok',
          p2_dependency_graph: 'degraded',
        },
      };
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.phases_ok).toBe(false);
      expect(report.phases).toEqual({
        p1_fingerprint: 'ok',
        p2_dependency_graph: 'degraded',
      });
    });
  });

  describe('legacy fields support', () => {
    it('supports legacy field names: last_commit, project_root', () => {
      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      const manifestContent = {
        timestamp: Date.now() - 1000,
        last_commit: 'unknown',
        project_root: repoDir,
      };
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifestContent, null, 2));

      const report = IntelligenceAuditReporter.report(outputDir, repoDir);

      expect(report.status).toBe('LIVE');
      expect(report.manifest_project_root).toBe(repoDir);
      expect(report.head_commit).toBe('unknown');
    });
  });

  describe('index exports', () => {
    it('exports IntelligenceAuditReporter from intelligence index', async () => {
      const indexModule = await import('./index.js');
      expect(indexModule.IntelligenceAuditReporter).toBeDefined();
      expect(typeof indexModule.IntelligenceAuditReporter.report).toBe('function');
    }, { timeout: 20000 });
  });
});

