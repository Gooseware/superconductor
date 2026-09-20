import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { IntelligencePreflightCheck } from './preflight-check.js';
import { IntelligencePreflightCheck as ExportedFromIndex } from './index.js';
import { IntelligenceAuditReporter, AuditReport } from './audit-reporter.js';
import * as projectRootModule from './utils/resolve-project-root.js';

describe('IntelligencePreflightCheck', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-preflight-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('UX-2 formatted banner generation', () => {
    it('generates LIVE banner according to UX-2 standard', () => {
      const mockReport: AuditReport = {
        status: 'LIVE',
        project_root: '/workspace/my-awesome-project',
        manifest_project_root: '/workspace/my-awesome-project',
        snapshot_path: '/workspace/my-awesome-project/superconductor/intelligence/00_manifest.json',
        head_commit: 'abcdef1234567890',
        age_days: 0.125, // 3 hours
        commits_behind: 0,
        phases_ok: true,
      };

      vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue(mockReport);
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/workspace/my-awesome-project');

      const result = IntelligencePreflightCheck.run('/workspace/my-awesome-project');

      expect(result.isMismatch).toBe(false);
      expect(result.report).toBe(mockReport);
      expect(result.formattedBanner).toBe(
        '[superconductor] Intelligence: LIVE | Project: my-awesome-project | SHA: abcdef1 | Age: 3h'
      );
      expect(IntelligencePreflightCheck.formatStatusLine(mockReport)).toBe(
        '[superconductor] Intelligence: LIVE | Project: my-awesome-project | SHA: abcdef1 | Age: 3h'
      );
    });

    it('generates MISMATCH banner according to UX-2 standard with warning and re-scan notification', () => {
      const mockReport: AuditReport = {
        status: 'MISMATCH',
        project_root: '/current/workspace/app',
        manifest_project_root: '/previous/workspace/app',
        snapshot_path: '/current/workspace/app/superconductor/intelligence/00_manifest.json',
        head_commit: '1234567890abcdef',
        age_days: 0.5,
        commits_behind: 0,
        phases_ok: true,
      };

      vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue(mockReport);
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/current/workspace/app');

      const result = IntelligencePreflightCheck.run('/current/workspace/app');

      expect(result.isMismatch).toBe(true);
      expect(result.report).toBe(mockReport);

      const expectedMultiLineBanner = [
        '[superconductor] Intelligence: MISMATCH | Indexed: /previous/workspace/app | Current: /current/workspace/app',
        '⚠️  Intelligence Directory Mismatch Detected!',
        '   Indexed directory:  /previous/workspace/app',
        '   Current workspace:  /current/workspace/app',
        'Triggering automatic re-scan against current workspace...',
      ].join('\n');

      expect(result.formattedBanner).toBe(expectedMultiLineBanner);

      // formatStatusLine returns only the single line summary
      expect(IntelligencePreflightCheck.formatStatusLine(mockReport)).toBe(
        '[superconductor] Intelligence: MISMATCH | Indexed: /previous/workspace/app | Current: /current/workspace/app'
      );
    });

    it('generates STALE banner according to UX-2 standard', () => {
      const mockReport: AuditReport = {
        status: 'STALE',
        project_root: '/repos/service-backend',
        manifest_project_root: '/repos/service-backend',
        snapshot_path: '/repos/service-backend/superconductor/intelligence/00_manifest.json',
        head_commit: '9876543210fedcba',
        age_days: 2.5,
        commits_behind: 14,
        phases_ok: true,
      };

      vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue(mockReport);
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/repos/service-backend');

      const result = IntelligencePreflightCheck.run('/repos/service-backend');

      expect(result.isMismatch).toBe(false);
      expect(result.report).toBe(mockReport);
      expect(result.formattedBanner).toBe(
        '[superconductor] Intelligence: STALE | Project: service-backend | SHA: 9876543 | Behind: 14 commits'
      );
      expect(IntelligencePreflightCheck.formatStatusLine(mockReport)).toBe(
        '[superconductor] Intelligence: STALE | Project: service-backend | SHA: 9876543 | Behind: 14 commits'
      );
    });

    it('generates NONE banner according to UX-2 standard', () => {
      const mockReport: AuditReport = {
        status: 'NONE',
        project_root: '/repos/new-empty-repo',
        manifest_project_root: null,
        snapshot_path: '/repos/new-empty-repo/superconductor/intelligence/00_manifest.json',
        head_commit: 'unknown',
        age_days: 0,
        commits_behind: 0,
        phases_ok: false,
      };

      vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue(mockReport);
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/repos/new-empty-repo');

      const result = IntelligencePreflightCheck.run('/repos/new-empty-repo');

      expect(result.isMismatch).toBe(false);
      expect(result.report).toBe(mockReport);
      expect(result.formattedBanner).toBe(
        '[superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project'
      );
      expect(IntelligencePreflightCheck.formatStatusLine(mockReport)).toBe(
        '[superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project'
      );
    });
  });

  describe('resolution and defaults', () => {
    it('resolves projectRoot via resolveProjectRoot when omitted', () => {
      const resolveSpy = vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/resolved/root');
      const reportSpy = vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue({
        status: 'NONE',
        project_root: '/resolved/root',
        manifest_project_root: null,
        snapshot_path: '/resolved/root/superconductor/intelligence/00_manifest.json',
        head_commit: 'unknown',
        age_days: 0,
        commits_behind: 0,
        phases_ok: false,
      });

      const result = IntelligencePreflightCheck.run();

      expect(resolveSpy).toHaveBeenCalledWith(undefined);
      expect(reportSpy).toHaveBeenCalledWith(
        path.join('/resolved/root', 'superconductor', 'intelligence'),
        '/resolved/root'
      );
      expect(result.isMismatch).toBe(false);
    });

    it('resolves outputDir as path.join(resolvedProjectRoot, superconductor, intelligence) when outputDir is omitted', () => {
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/custom/proj');
      const reportSpy = vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue({
        status: 'NONE',
        project_root: '/custom/proj',
        manifest_project_root: null,
        snapshot_path: '/custom/proj/superconductor/intelligence/00_manifest.json',
        head_commit: 'unknown',
        age_days: 0,
        commits_behind: 0,
        phases_ok: false,
      });

      IntelligencePreflightCheck.run('/custom/proj');

      expect(reportSpy).toHaveBeenCalledWith(
        path.join('/custom/proj', 'superconductor', 'intelligence'),
        '/custom/proj'
      );
    });

    it('uses explicit outputDir when provided', () => {
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/custom/proj');
      const reportSpy = vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue({
        status: 'NONE',
        project_root: '/custom/proj',
        manifest_project_root: null,
        snapshot_path: '/custom/output/00_manifest.json',
        head_commit: 'unknown',
        age_days: 0,
        commits_behind: 0,
        phases_ok: false,
      });

      IntelligencePreflightCheck.run('/custom/proj', '/custom/output');

      expect(reportSpy).toHaveBeenCalledWith('/custom/output', '/custom/proj');
    });

    it('handles short or unknown SHA gracefully in LIVE and STALE', () => {
      const mockReport: AuditReport = {
        status: 'LIVE',
        project_root: '/workspace/repo',
        manifest_project_root: '/workspace/repo',
        snapshot_path: '/workspace/repo/superconductor/intelligence/00_manifest.json',
        head_commit: 'unknown',
        age_days: 0,
        commits_behind: 0,
        phases_ok: true,
      };

      vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue(mockReport);
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/workspace/repo');

      const result = IntelligencePreflightCheck.run('/workspace/repo');
      expect(result.formattedBanner).toBe(
        '[superconductor] Intelligence: LIVE | Project: repo | SHA: unknown | Age: 0h'
      );
    });

    it('handles Infinity commits behind gracefully in STALE banner', () => {
      const mockReport: AuditReport = {
        status: 'STALE',
        project_root: '/workspace/repo',
        manifest_project_root: '/workspace/repo',
        snapshot_path: '/workspace/repo/superconductor/intelligence/00_manifest.json',
        head_commit: 'a1b2c3d4e5f6',
        age_days: 1.0,
        commits_behind: Infinity,
        phases_ok: true,
      };

      vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue(mockReport);
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/workspace/repo');

      const result = IntelligencePreflightCheck.run('/workspace/repo');
      expect(result.formattedBanner).toBe(
        '[superconductor] Intelligence: STALE | Project: repo | SHA: a1b2c3d | Behind: ? commits'
      );
    });
  });

  describe('instance method support', () => {
    it('handles projectName and project_name property overrides', () => {
      const reportWithName = {
        status: 'LIVE',
        project_root: '/some/deep/path',
        projectName: 'custom-project-name',
        manifest_project_root: '/some/deep/path',
        snapshot_path: '/path/00_manifest.json',
        head_commit: 'abcdef123',
        age_days: 0.1,
        commits_behind: 0,
        phases_ok: true,
      } as any;

      expect(IntelligencePreflightCheck.formatStatusLine(reportWithName)).toContain('Project: custom-project-name');

      const reportWithSnakeName = {
        ...reportWithName,
        projectName: undefined,
        project_name: 'snake-project-name',
      };
      expect(IntelligencePreflightCheck.formatStatusLine(reportWithSnakeName)).toContain('Project: snake-project-name');

      const reportWithNoName = {
        ...reportWithName,
        projectName: undefined,
        project_name: undefined,
        project_root: '',
      };
      expect(IntelligencePreflightCheck.formatStatusLine(reportWithNoName)).toContain('Project: unknown');
    });

    it('handles age_hours explicit override and undefined age/commits', () => {
      const report = {
        status: 'LIVE',
        project_root: '/path/to/repo',
        manifest_project_root: '/path/to/repo',
        snapshot_path: '/path/00_manifest.json',
        head_commit: 'abcdef123',
        age_hours: 5,
        commits_behind: undefined,
        phases_ok: true,
      } as any;

      expect(IntelligencePreflightCheck.formatStatusLine(report)).toContain('Age: 5h');

      const staleReport = {
        status: 'STALE',
        project_root: '/path/to/repo',
        manifest_project_root: '/path/to/repo',
        snapshot_path: '/path/00_manifest.json',
        head_commit: 'abcdef123',
        commits_behind: undefined,
        phases_ok: true,
      } as any;

      expect(IntelligencePreflightCheck.formatStatusLine(staleReport)).toContain('Behind: 0 commits');
    });

    it('handles unexpected or unknown status gracefully falling back to NONE banner', () => {
      const report = {
        status: 'UNKNOWN_STATUS' as any,
        project_root: '/path/to/repo',
        manifest_project_root: null,
        snapshot_path: '/path/00_manifest.json',
        head_commit: 'unknown',
        age_days: 0,
        commits_behind: 0,
        phases_ok: false,
      };

      expect(IntelligencePreflightCheck.formatStatusLine(report)).toBe(
        '[superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project'
      );
    });

    it('supports new IntelligencePreflightCheck().run() instance call', () => {
      vi.spyOn(IntelligenceAuditReporter, 'report').mockReturnValue({
        status: 'NONE',
        project_root: '/temp/repo',
        manifest_project_root: null,
        snapshot_path: '/temp/repo/00_manifest.json',
        head_commit: 'unknown',
        age_days: 0,
        commits_behind: 0,
        phases_ok: false,
      });
      vi.spyOn(projectRootModule, 'resolveProjectRoot').mockReturnValue('/temp/repo');

      const checker = new IntelligencePreflightCheck();
      const result = checker.run('/temp/repo');
      expect(result.isMismatch).toBe(false);
      expect(checker.formatStatusLine(result.report)).toBe(
        '[superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project'
      );
    });

    it('is exported properly from intelligence/index.js', () => {
      expect(ExportedFromIndex).toBeDefined();
      expect(ExportedFromIndex).toBe(IntelligencePreflightCheck);
    });
  });

  describe('filesystem integration', () => {
    it('runs end-to-end with real IntelligenceAuditReporter against temp directory with manifest', () => {
      const intelDir = path.join(tempDir, 'superconductor', 'intelligence');
      fs.mkdirSync(intelDir, { recursive: true });

      const manifest = {
        superconductorVersion: '1.0.0',
        timestamp: Date.now() - 3600 * 1000 * 2, // 2 hours ago
        lastCommitSha: 'unknown',
        projectRoot: tempDir,
        phases: { p1_fingerprint: { output: 'ok' } },
        degraded: [],
      };
      fs.writeFileSync(path.join(intelDir, '00_manifest.json'), JSON.stringify(manifest, null, 2));

      const result = IntelligencePreflightCheck.run(tempDir);
      const projName = path.basename(fs.realpathSync(tempDir));

      expect(result.report.status).toBe('LIVE');
      expect(result.isMismatch).toBe(false);
      expect(result.formattedBanner).toBe(
        `[superconductor] Intelligence: LIVE | Project: ${projName} | SHA: unknown | Age: 2h`
      );
    });

    it('runs end-to-end detecting MISMATCH on real filesystem', () => {
      const intelDir = path.join(tempDir, 'superconductor', 'intelligence');
      fs.mkdirSync(intelDir, { recursive: true });

      const otherDir = path.join(tempDir, 'foreign-project');
      fs.mkdirSync(otherDir, { recursive: true });

      const manifest = {
        superconductorVersion: '1.0.0',
        timestamp: Date.now() - 3600 * 1000,
        lastCommitSha: 'abcdef0123456789',
        projectRoot: otherDir,
        phases: { p1_fingerprint: { output: 'ok' } },
        degraded: [],
      };
      fs.writeFileSync(path.join(intelDir, '00_manifest.json'), JSON.stringify(manifest, null, 2));

      const result = IntelligencePreflightCheck.run(tempDir);
      const realTemp = fs.realpathSync(tempDir);

      expect(result.report.status).toBe('MISMATCH');
      expect(result.isMismatch).toBe(true);
      expect(result.formattedBanner).toContain(`[superconductor] Intelligence: MISMATCH | Indexed: ${otherDir} | Current: ${realTemp}`);
      expect(result.formattedBanner).toContain('⚠️  Intelligence Directory Mismatch Detected!');
      expect(result.formattedBanner).toContain(`   Indexed directory:  ${otherDir}`);
      expect(result.formattedBanner).toContain(`   Current workspace:  ${realTemp}`);
      expect(result.formattedBanner).toContain('Triggering automatic re-scan against current workspace...');
    });
  });
});
