import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface Manifest {
  lastCommitSha?: string;
  timestamp: number;
  incrementalRuns?: number;
}

export interface DriftReport {
  isDrifted: boolean;
  commitsBehind: number;
  snapshotAgeMs: number;
  incrementalRuns: number;
  recommendFullRescan: boolean;
  banner: string; // the 3-state banner string
  status?: 'LIVE' | 'STALE';
}

const SHA_RE = /^[0-9a-f]{7,40}$/i;

export class IntelligenceDriftMonitor {
  /**
   * Check drift state from either a Manifest object or an output directory / manifest file path.
   * If outputDir is provided as a string, loads 00_manifest.json (or uses fallback if missing).
   *
   * @param outputDirOrManifest - Manifest object or path to intelligence output directory / manifest file.
   * @param projectRoot - Path to the git repository root.
   */
  static check(outputDirOrManifest: Manifest | string, projectRoot?: string): DriftReport {
    if (typeof outputDirOrManifest === 'string') {
      const resolvedOutput = path.resolve(outputDirOrManifest);
      let manifestPath = resolvedOutput;
      if (!manifestPath.endsWith('.json')) {
        manifestPath = path.join(resolvedOutput, '00_manifest.json');
        if (!fs.existsSync(manifestPath)) {
          const nested = path.join(resolvedOutput, 'superconductor', 'intelligence', '00_manifest.json');
          if (fs.existsSync(nested)) {
            manifestPath = nested;
          }
        }
      }

      let manifest: Manifest = { timestamp: Date.now(), lastCommitSha: 'unknown' };
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          manifest = {
            lastCommitSha: raw.lastCommitSha ?? raw.last_commit ?? raw.headSha ?? 'unknown',
            timestamp: typeof raw.timestamp === 'number'
              ? raw.timestamp
              : (raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now()),
            incrementalRuns: raw.incrementalRuns ?? raw.incremental_runs ?? 0,
          };
        } catch {
          // fallback unknown
        }
      }

      const root = projectRoot ?? (outputDirOrManifest.endsWith('.json') ? path.dirname(path.dirname(path.dirname(resolvedOutput))) : resolvedOutput);
      return IntelligenceDriftMonitor.checkDrift(manifest, root);
    }

    return IntelligenceDriftMonitor.checkDrift(outputDirOrManifest, projectRoot ?? '');
  }
  /**
   * Check drift state against current HEAD.
   * Uses spawnSync for all git calls — never execSync + string interpolation.
   *
   * @param manifest  - The parsed 00_manifest.json object (canonical field names expected;
   *                    callers should normalise legacy `last_commit`/`incremental_runs` fields
   *                    before passing here — see IntelligenceSnapshotReader for reference).
   * @param projectRoot - Absolute path to the git repository root.  Callers MUST pass this
   *                      explicitly; the two-level `path.resolve(outputDir, '../..')` fallback
   *                      in IntelligenceSnapshotReader is only for legacy call sites that have
   *                      not yet threaded projectRoot through.
   */
  static checkDrift(manifest: Manifest, projectRoot: string): DriftReport {
    const snapshotAgeMs = Date.now() - manifest.timestamp;
    const incrementalRuns = manifest.incrementalRuns ?? 0;

    let commitsBehind = 0;
    const headSha = manifest.lastCommitSha;

    if (headSha === 'unknown') {
      commitsBehind = 0;
    } else if (!headSha || !SHA_RE.test(headSha)) {
      commitsBehind = Infinity;
    } else {
      const result = spawnSync('git', ['rev-list', '--count', `${headSha}..HEAD`], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      if (result.error) {
        process.stderr.write(`[superconductor:intelligence] git call failed: ${result.error.message}\n`);
      }
      if (result.status === 0 && result.stdout) {
        const parsed = parseInt(result.stdout.trim(), 10);
        commitsBehind = isNaN(parsed) ? Infinity : parsed;
      } else {
        // git failed (e.g. unknown SHA) — treat as fully drifted
        commitsBehind = Infinity;
      }
    }

    const isDrifted =
      headSha === 'unknown'
        ? false
        : (commitsBehind === Infinity ||
           commitsBehind > 10 ||
           snapshotAgeMs > 24 * 3600 * 1000);

    const recommendFullRescan =
      headSha === 'unknown'
        ? false
        : (commitsBehind === Infinity ||
           commitsBehind > 50 ||
           snapshotAgeMs > 7 * 24 * 3600 * 1000 ||
           incrementalRuns >= 50);

    const status: 'LIVE' | 'STALE' = isDrifted ? 'STALE' : 'LIVE';

    const report: DriftReport = {
      isDrifted,
      commitsBehind,
      snapshotAgeMs,
      incrementalRuns,
      recommendFullRescan,
      banner: '',
      status,
    };

    report.banner = IntelligenceDriftMonitor.formatBanner(report);
    return report;
  }

  /**
   * Format the 3-state banner for display to the user.
   *
   * LIVE:  'ℹ️  Intelligence: LIVE (snapshot age: Xm · last commit: abc1234 · N incremental runs)'
   * STALE: '⚠️  Intelligence: STALE (snapshot age: Xd · N commits behind · consider running /superconductor:setup)'
   * NONE:  '❌  Intelligence: NONE (keyword heuristics active · run /superconductor:setup for surgical precision)'
   *
   * ## Required surfacing contract (oracle advisory §1)
   * Every call site that invokes `IntelligenceSnapshotReader.load()` or
   * `IntelligenceDriftMonitor.checkDrift()` MUST emit the returned `banner` string
   * to the user (e.g. via `process.stderr.write`) **before** executing any primary
   * analysis logic.  Skills such as `new-track §2.0.5` and `setup §2.7` are
   * responsible for honouring this contract so the user always sees the current
   * intelligence health state before results are presented.
   */
  static formatBanner(report: DriftReport): string {
    if (!report.isDrifted) {
      // LIVE banner
      const ageStr = IntelligenceDriftMonitor._formatAge(report.snapshotAgeMs);
      return `\u2139\ufe0f  Intelligence: LIVE (snapshot age: ${ageStr} \u00b7 last commit: unknown \u00b7 ${report.incrementalRuns} incremental runs)`;
    }

    if (report.isDrifted && report.recommendFullRescan) {
      // STALE — full rescan recommended
      const ageStr = IntelligenceDriftMonitor._formatAge(report.snapshotAgeMs);
      const behindStr =
        report.commitsBehind === Infinity ? '?' : String(report.commitsBehind);
      return `\u26a0\ufe0f  Intelligence: STALE (snapshot age: ${ageStr} \u00b7 ${behindStr} commits behind \u00b7 consider running /superconductor:setup)`;
    }

    // STALE — gentler (isDrifted but rescan not yet critical)
    const ageStr = IntelligenceDriftMonitor._formatAge(report.snapshotAgeMs);
    const behindStr =
      report.commitsBehind === Infinity ? '?' : String(report.commitsBehind);
    return `\u26a0\ufe0f  Intelligence: STALE (snapshot age: ${ageStr} \u00b7 ${behindStr} commits behind \u00b7 consider running /superconductor:setup)`;
  }

  /**
   * Format a NONE-state banner (no manifest present).
   * Call sites that receive `null` from `IntelligenceSnapshotReader.load()` MUST
   * emit this banner before falling back to keyword heuristics.
   */
  static noBanner(): string {
    return `\u274c  Intelligence: NONE (keyword heuristics active \u00b7 run /superconductor:setup for surgical precision)`;
  }

  private static _formatAge(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    if (minutes >= 60 * 24) {
      return `${Math.floor(minutes / (60 * 24))}d`;
    }
    if (minutes >= 60) {
      return `${Math.floor(minutes / 60)}h`;
    }
    return `${minutes}m`;
  }
}
