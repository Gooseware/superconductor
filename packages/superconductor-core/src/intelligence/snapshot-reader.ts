import * as fs from 'fs';
import * as path from 'path';

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
  static load(outputDir: string): RepoContext | null {
    const manifestPath = path.join(outputDir, '00_manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null; // NONE state
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const snapshotAgeMs = Date.now() - new Date(manifest.timestamp).getTime();
      const ageMinutes = Math.floor(snapshotAgeMs / 60000);
      
      const sha = manifest.last_commit || 'unknown';
      let commitsBehind = manifest.commitsBehind || 0;
      
      if (sha !== 'unknown') {
        const { spawnSync } = require('child_process');
        const result = spawnSync('git', ['rev-list', '--count', `${sha}..HEAD`], { encoding: 'utf8' });
        if (result.status === 0 && result.stdout) {
          commitsBehind = parseInt(result.stdout.trim(), 10) || 0;
        }
      }
      
      let driftState: 'LIVE' | 'STALE' | 'NONE' = 'LIVE';
      let driftBanner = '';

      if (ageMinutes > 24 * 60 || commitsBehind > 10) {
        driftState = 'STALE';
        const ageString = ageMinutes > 60 ? `${Math.floor(ageMinutes / 60)}h` : `${ageMinutes}m`;
        driftBanner = `\u26a0\ufe0f  Intelligence: STALE (snapshot age: ${ageString} \u00b7 ${commitsBehind} commits behind \u00b7 consider running /superconductor:setup)`;
      } else {
        const sha = manifest.last_commit || 'unknown';
        const runs = manifest.incremental_runs || 0;
        driftBanner = `\u2139\ufe0f  Intelligence: LIVE (snapshot age: ${ageMinutes}m \u00b7 last commit: ${sha.slice(0, 7)} \u00b7 ${runs} incremental runs)`;
      }

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
        snapshotAge: snapshotAgeMs,
        commitsBehind
      };
    } catch (e) {
      return null;
    }
  }
}
