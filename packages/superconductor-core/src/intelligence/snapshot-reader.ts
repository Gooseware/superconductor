import * as fs from 'fs';
import * as path from 'path';
import { IntelligenceDriftMonitor } from './drift-monitor.js';

export interface RepoContext {
  hotspotMap: Map<string, { hotspot_score: number; cyclomatic_complexity: number; }>;
  testGapMap: Map<string, { risk: 'HIGH' | 'MEDIUM' | 'LOW'; gitChurnScore: number; }>;
  sastFindings: Map<string, Array<{ rule_id: string; severity: string; message: string; }>>;
  driftState: 'LIVE' | 'STALE' | 'NONE';
  driftBanner: string; // the formatted banner string
  snapshotAge?: number; // ms
  commitsBehind?: number;
}

export class IntelligenceSnapshotReader {
  static load(outputDir: string, projectRoot?: string): RepoContext | null {
    const manifestPath = path.join(outputDir, '00_manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null; // NONE state
    }

    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Normalize manifest fields: support both legacy (last_commit / incremental_runs)
      // and canonical (lastCommitSha / incrementalRuns) field names.
      const manifest = {
        lastCommitSha: raw.lastCommitSha ?? raw.last_commit,
        timestamp: typeof raw.timestamp === 'number'
          ? raw.timestamp
          : new Date(raw.timestamp).getTime(),
        incrementalRuns: raw.incrementalRuns ?? raw.incremental_runs ?? 0,
      };

      // Derive projectRoot: fall back to the directory two levels above outputDir when
      // not supplied (best-effort; caller should always pass it explicitly).
      const root = projectRoot ?? path.resolve(outputDir, '..', '..');

      const report = IntelligenceDriftMonitor.checkDrift(manifest, root);

      const driftState: 'LIVE' | 'STALE' | 'NONE' = report.isDrifted ? 'STALE' : 'LIVE';
      const driftBanner = report.banner;
      const commitsBehind = report.commitsBehind === Infinity
        ? Number.POSITIVE_INFINITY
        : report.commitsBehind;

      const hotspotMap = new Map<string, { hotspot_score: number; cyclomatic_complexity: number; }>();
      const complexityPath = path.join(outputDir, '03_complexity.json');
      if (fs.existsSync(complexityPath)) {
        const complexityData = JSON.parse(fs.readFileSync(complexityPath, 'utf8'));
        if (Array.isArray(complexityData)) {
          for (const item of complexityData) {
            if (item.file) {
              hotspotMap.set(item.file, {
                hotspot_score: item.hotspot_score || 0,
                cyclomatic_complexity: item.cyclomatic_complexity || 0
              });
            }
          }
        }
      }

      const sastFindings = new Map<string, Array<{ rule_id: string; severity: string; message: string; }>>();
      const sastPath = path.join(outputDir, '05_sast.json');
      if (fs.existsSync(sastPath)) {
        const sastData = JSON.parse(fs.readFileSync(sastPath, 'utf8'));
        if (Array.isArray(sastData)) {
          for (const item of sastData) {
            if (item.file && item.findings && Array.isArray(item.findings)) {
              sastFindings.set(item.file, item.findings);
            }
          }
        }
      }

      const testGapMap = new Map<string, { risk: 'HIGH' | 'MEDIUM' | 'LOW'; gitChurnScore: number; }>();
      const testGapsPath = path.join(outputDir, '07_test_gaps.json');
      if (fs.existsSync(testGapsPath)) {
        const testGapsData = JSON.parse(fs.readFileSync(testGapsPath, 'utf8'));
        if (Array.isArray(testGapsData)) {
          for (const item of testGapsData) {
            if (item.file) {
              testGapMap.set(item.file, {
                risk: item.risk || 'LOW',
                gitChurnScore: item.gitChurnScore || 0
              });
            }
          }
        }
      }

      return {
        hotspotMap,
        testGapMap,
        sastFindings,
        driftState,
        driftBanner,
        snapshotAge: report.snapshotAgeMs,
        commitsBehind
      };
    } catch (e) {
      return null;
    }
  }
}
