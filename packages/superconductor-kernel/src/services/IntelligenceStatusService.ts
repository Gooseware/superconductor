import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export type IntelligenceStatus = 'LIVE' | 'STALE' | 'NONE';

export interface IntelligenceStatusResult {
  status: IntelligenceStatus;
  age_days: number;
  commits_behind: number;
  snapshot_path: string;
  phases: Record<string, 'ok' | 'degraded'>;
}

export class IntelligenceStatusService {
  async getStatus(outputDir: string): Promise<IntelligenceStatusResult> {
    let effectiveDir = outputDir;
    let manifestPath = path.join(effectiveDir, 'intelligence', '00_manifest.json');
    if (!fs.existsSync(manifestPath) && fs.existsSync(path.join(effectiveDir, 'superconductor', 'intelligence', '00_manifest.json'))) {
      effectiveDir = path.join(effectiveDir, 'superconductor');
      manifestPath = path.join(effectiveDir, 'intelligence', '00_manifest.json');
    }

    if (!fs.existsSync(manifestPath)) {
      return { status: 'NONE', age_days: 0, commits_behind: 0, snapshot_path: outputDir, phases: {} };
    }

    let manifest: { timestamp: number };
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (typeof manifest?.timestamp !== 'number' || isNaN(manifest.timestamp)) {
        throw new Error('Invalid manifest timestamp');
      }
    } catch {
      return { status: 'NONE', age_days: 0, commits_behind: 0, snapshot_path: outputDir, phases: {} };
    }

    const age_ms = Date.now() - manifest.timestamp;
    const age_days = age_ms / 86400000;

    let commits_behind = 0;
    try {
      const sinceIso = new Date(manifest.timestamp).toISOString();
      const output = execSync(`git log --oneline --since="${sinceIso}" 2>/dev/null | wc -l`, {
        cwd: effectiveDir,
      }).toString().trim();
      commits_behind = parseInt(output, 10) || 0;
    } catch (err) {
      console.error(`[IntelligenceStatusService] Failed to check commits behind:`, err);
      throw err;
    }

    // LIVE: age < 1 day AND commits_behind < 10
    // STALE: age >= 1 day OR commits_behind >= 10
    // NONE: no manifest
    const status: IntelligenceStatus = (age_days < 1 && commits_behind < 10) ? 'LIVE' : 'STALE';

    const phases: Record<string, 'ok' | 'degraded'> = {};
    const phaseFiles = [
      ['01_fingerprint', '01_fingerprint.json'],
      ['02_dependency_graph', '02_dependency_graph.json'],
      ['03_complexity', '03_complexity.json'],
      ['04_coupling', '04_coupling.json'],
    ];
    for (const [phase, file] of phaseFiles) {
      phases[phase] = fs.existsSync(path.join(effectiveDir, 'intelligence', file)) ? 'ok' : 'degraded';
    }

    return { status, age_days, commits_behind, snapshot_path: outputDir, phases };
  }
}
