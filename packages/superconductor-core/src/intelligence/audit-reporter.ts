import * as fs from 'fs';
import * as path from 'path';
import { IntelligenceDriftMonitor } from './drift-monitor.js';
import { resolveProjectRoot } from './utils/resolve-project-root.js';

export interface AuditReport {
  status: 'LIVE' | 'STALE' | 'NONE' | 'MISMATCH';
  project_root: string;
  manifest_project_root: string | null;
  snapshot_path: string;
  head_commit: string;
  age_days: number;
  commits_behind: number;
  phases_ok: boolean;
  phases?: Record<string, string>;
}

export class IntelligenceAuditReporter {
  /**
   * Generates a comprehensive audit report on intelligence health.
   *
   * @param outputDir - Path to output directory containing 00_manifest.json (or the project root containing superconductor/intelligence).
   * @param projectRoot - Optional explicit project root. When omitted, resolves via git from outputDir.
   * @returns AuditReport detailing status ('LIVE' | 'STALE' | 'NONE' | 'MISMATCH'), age, drift, and phase health.
   */
  public static report(outputDir: string, projectRoot?: string): AuditReport {
    const resolvedOutputDir = path.resolve(outputDir);
    let snapshotPath = path.join(resolvedOutputDir, '00_manifest.json');
    if (!fs.existsSync(snapshotPath)) {
      const nestedPath = path.join(resolvedOutputDir, 'superconductor', 'intelligence', '00_manifest.json');
      if (fs.existsSync(nestedPath)) {
        snapshotPath = nestedPath;
      }
    }

    const resolvedProjectRoot = resolveProjectRoot(projectRoot ?? resolvedOutputDir);

    if (!fs.existsSync(snapshotPath)) {
      return {
        status: 'NONE',
        project_root: resolvedProjectRoot,
        manifest_project_root: null,
        snapshot_path: snapshotPath,
        head_commit: 'unknown',
        age_days: 0,
        commits_behind: 0,
        phases_ok: false,
      };
    }

    let raw: any;
    try {
      raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    } catch {
      return {
        status: 'NONE',
        project_root: resolvedProjectRoot,
        manifest_project_root: null,
        snapshot_path: snapshotPath,
        head_commit: 'unknown',
        age_days: 0,
        commits_behind: 0,
        phases_ok: false,
      };
    }

    const manifestProjectRoot = raw.projectRoot ?? raw.project_root ?? null;
    const lastCommitSha = raw.lastCommitSha ?? raw.last_commit ?? raw.headSha ?? 'unknown';
    const timestamp = typeof raw.timestamp === 'number'
      ? raw.timestamp
      : (raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now());
    const incrementalRuns = raw.incrementalRuns ?? raw.incremental_runs ?? 0;

    const age_ms = Math.max(0, Date.now() - timestamp);
    const age_days = age_ms / 86400000;

    const phases: Record<string, string> = {};
    let phasesOk = true;

    if (raw.phases && typeof raw.phases === 'object') {
      for (const [key, val] of Object.entries(raw.phases)) {
        if (typeof val === 'string') {
          phases[key] = val;
          if (val === 'degraded' || val === 'failed' || val === 'unavailable') {
            phasesOk = false;
          }
        } else if (val && typeof val === 'object') {
          const output = (val as any).output ?? ((val as any).error ? 'degraded' : 'ok');
          phases[key] = String(output);
          if (output === 'degraded' || output === 'failed' || output === 'unavailable' || (val as any).error) {
            phasesOk = false;
          }
        }
      }
    }

    if (Array.isArray(raw.degraded) && raw.degraded.length > 0) {
      phasesOk = false;
    }

    let isMismatch = false;
    if (manifestProjectRoot) {
      let realManifestRoot: string;
      try {
        realManifestRoot = fs.realpathSync(manifestProjectRoot);
      } catch {
        realManifestRoot = path.resolve(manifestProjectRoot);
      }

      if (realManifestRoot !== resolvedProjectRoot) {
        isMismatch = true;
      }
    }

    if (isMismatch) {
      return {
        status: 'MISMATCH',
        project_root: resolvedProjectRoot,
        manifest_project_root: manifestProjectRoot,
        snapshot_path: snapshotPath,
        head_commit: lastCommitSha,
        age_days,
        commits_behind: 0,
        phases_ok: phasesOk,
        phases: Object.keys(phases).length > 0 ? phases : undefined,
      };
    }

    const driftReport = IntelligenceDriftMonitor.checkDrift(
      {
        lastCommitSha,
        timestamp,
        incrementalRuns,
      },
      resolvedProjectRoot
    );

    const status: 'LIVE' | 'STALE' = driftReport.isDrifted ? 'STALE' : 'LIVE';

    return {
      status,
      project_root: resolvedProjectRoot,
      manifest_project_root: manifestProjectRoot,
      snapshot_path: snapshotPath,
      head_commit: lastCommitSha,
      age_days,
      commits_behind: driftReport.commitsBehind,
      phases_ok: phasesOk,
      phases: Object.keys(phases).length > 0 ? phases : undefined,
    };
  }

  public report(outputDir: string, projectRoot?: string): AuditReport {
    return IntelligenceAuditReporter.report(outputDir, projectRoot);
  }
}
