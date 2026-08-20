import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

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
    const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
    const resolvedDir = path.resolve(outputDir);
    if (!resolvedDir.startsWith(PROJECT_ROOT + path.sep) && resolvedDir !== PROJECT_ROOT) {
      throw new Error('outputDir must be within the workspace root');
    }
    let effectiveDir = resolvedDir;
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
      const sinceIso = new Date(manifest.timestamp + 1000).toISOString();
      const output = execFileSync('git', ['log', '--oneline', `--since=${sinceIso}`], {
        cwd: effectiveDir,
        encoding: 'utf8',
      }).trim();
      commits_behind = output ? output.split('\n').length : 0;
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

  async refresh(outputDir?: string, force?: boolean): Promise<{ success: boolean; result: IntelligenceStatusResult; message?: string }> {
    const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
    const resolvedDir = outputDir ? path.resolve(outputDir) : PROJECT_ROOT;
    let effectiveDir = resolvedDir;
    if (fs.existsSync(path.join(effectiveDir, 'superconductor'))) {
      effectiveDir = path.join(effectiveDir, 'superconductor');
    }

    try {
      const cliPath = path.join(PROJECT_ROOT, 'packages', 'superconductor-core', 'dist', 'cli', 'index.js');
      const tsCliPath = path.join(PROJECT_ROOT, 'packages', 'superconductor-core', 'src', 'cli', 'index.ts');
      
      if (fs.existsSync(cliPath)) {
        const cliArgs = force ? ['intelligence', '--force'] : ['intelligence', '--refresh'];
        execFileSync('node', [cliPath, ...cliArgs], {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
        });
      } else if (fs.existsSync(tsCliPath)) {
        execFileSync('npx', ['tsx', tsCliPath, 'intelligence', force ? '--force' : '--refresh'], {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
        });
      }
    } catch (err: any) {
      console.error(`[IntelligenceStatusService] Refresh execution error:`, err);
    }

    const updated = await this.getStatus(resolvedDir);
    return { success: true, result: updated };
  }
}
