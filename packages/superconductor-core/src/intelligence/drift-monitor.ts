import { spawnSync } from 'child_process';

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
}

const SHA_RE = /^[0-9a-f]{7,40}$/i;

export class IntelligenceDriftMonitor {
  /**
   * Check drift state against current HEAD.
   * Uses spawnSync for all git calls — never execSync + string interpolation.
   */
  static checkDrift(manifest: Manifest, projectRoot: string): DriftReport {
    const snapshotAgeMs = Date.now() - manifest.timestamp;
    const incrementalRuns = manifest.incrementalRuns ?? 0;

    let commitsBehind = 0;
    const sha = manifest.lastCommitSha;

    if (!sha || !SHA_RE.test(sha)) {
      commitsBehind = Infinity;
    } else {
      const result = spawnSync('git', ['rev-list', '--count', `${sha}..HEAD`], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      if (result.status === 0 && result.stdout) {
        const parsed = parseInt(result.stdout.trim(), 10);
        commitsBehind = isNaN(parsed) ? Infinity : parsed;
      } else {
        // git failed (e.g. unknown SHA) — treat as fully drifted
        commitsBehind = Infinity;
      }
    }

    const isDrifted =
      commitsBehind === Infinity ||
      commitsBehind > 10 ||
      snapshotAgeMs > 24 * 3600 * 1000;

    const recommendFullRescan =
      commitsBehind === Infinity ||
      commitsBehind > 50 ||
      snapshotAgeMs > 7 * 24 * 3600 * 1000 ||
      incrementalRuns >= 50;

    const report: DriftReport = {
      isDrifted,
      commitsBehind,
      snapshotAgeMs,
      incrementalRuns,
      recommendFullRescan,
      banner: '',
    };

    report.banner = IntelligenceDriftMonitor.formatBanner(report);
    return report;
  }

  /**
   * Format the 3-state banner:
   * LIVE:  'ℹ️  Intelligence: LIVE (snapshot age: Xm · last commit: abc1234 · N incremental runs)'
   * STALE: '⚠️  Intelligence: STALE (snapshot age: Xd · N commits behind · consider running /superconductor:setup)'
   * NONE:  '❌  Intelligence: NONE (keyword heuristics active · run /superconductor:setup for surgical precision)'
   */
  static formatBanner(report: DriftReport): string {
    if (!report.isDrifted) {
      // LIVE banner
      const ageMin = Math.floor(report.snapshotAgeMs / 60000);
      const ageStr = ageMin >= 60 ? `${Math.floor(ageMin / 60)}h` : `${ageMin}m`;
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

  /** Format a NONE-state banner (no manifest present). */
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
