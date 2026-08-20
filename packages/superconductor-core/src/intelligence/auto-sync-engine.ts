import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { update, UpdateReport } from './incremental-updater.js';
import { runPipeline } from './pipeline.js';
import { IntelligenceDriftMonitor, Manifest, DriftReport } from './drift-monitor.js';

export interface AutoSyncOptions {
  projectRoot?: string;
  outputDir?: string;
  force?: boolean;
}

export interface AutoSyncResult {
  action: 'full-scan' | 'incremental' | 'none';
  status: 'LIVE' | 'STALE' | 'NONE';
  commitsBehind: number;
  report?: UpdateReport | null;
  timestamp: number;
  lastCommitSha?: string;
}

export class IntelligenceAutoSyncEngine {
  /**
   * Resolves changed files between a given commit SHA and HEAD.
   */
  static getChangedFiles(lastSha: string, projectRoot: string = process.cwd()): string[] {
    if (!lastSha || !/^[0-9a-f]{7,40}$/i.test(lastSha)) {
      return [];
    }
    const result = spawnSync('git', ['diff', '--name-only', `${lastSha}..HEAD`], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    if (result.status !== 0 || !result.stdout) {
      return [];
    }
    return result.stdout
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0);
  }

  /**
   * Ensures intelligence snapshot is fresh (<10 commits behind HEAD).
   * - If no manifest, corrupt, or commitsBehind > 50 (or force): runs full pipeline.
   * - If 1 <= commitsBehind <= 50: runs incremental update on changed files.
   * - If commitsBehind === 0: returns immediately (up to date).
   */
  static async ensureFresh(options: AutoSyncOptions = {}): Promise<AutoSyncResult> {
    const projectRoot = options.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
    const outputDir = options.outputDir
      ? path.resolve(options.outputDir)
      : path.join(projectRoot, 'superconductor', 'intelligence');
    const manifestPath = path.join(outputDir, '00_manifest.json');

    // Force full re-scan if requested
    if (options.force) {
      await runPipeline([], projectRoot, path.dirname(outputDir));
      const manifest = this._readManifest(manifestPath);
      return {
        action: 'full-scan',
        status: 'LIVE',
        commitsBehind: 0,
        timestamp: manifest?.timestamp ?? Date.now(),
        lastCommitSha: manifest?.lastCommitSha,
      };
    }

    const manifest = this._readManifest(manifestPath);
    if (!manifest) {
      await runPipeline([], projectRoot, path.dirname(outputDir));
      const newManifest = this._readManifest(manifestPath);
      return {
        action: 'full-scan',
        status: 'LIVE',
        commitsBehind: 0,
        timestamp: newManifest?.timestamp ?? Date.now(),
        lastCommitSha: newManifest?.lastCommitSha,
      };
    }

    const drift = IntelligenceDriftMonitor.checkDrift(manifest, projectRoot);

    if (drift.commitsBehind === 0 && !drift.isDrifted) {
      return {
        action: 'none',
        status: 'LIVE',
        commitsBehind: 0,
        timestamp: manifest.timestamp,
        lastCommitSha: manifest.lastCommitSha,
      };
    }

    if (drift.commitsBehind > 50 || drift.commitsBehind === Infinity || drift.recommendFullRescan) {
      await runPipeline([], projectRoot, path.dirname(outputDir));
      const updatedManifest = this._readManifest(manifestPath);
      return {
        action: 'full-scan',
        status: 'LIVE',
        commitsBehind: 0,
        timestamp: updatedManifest?.timestamp ?? Date.now(),
        lastCommitSha: updatedManifest?.lastCommitSha,
      };
    }

    // 1 <= commitsBehind <= 50 -> incremental update
    const changedFiles = this.getChangedFiles(manifest.lastCommitSha || 'HEAD~1', projectRoot);
    const updateReport = await update({
      projectRoot,
      changedFiles: changedFiles.length > 0 ? changedFiles : ['package.json'],
      outputDir,
    });

    const refreshedManifest = this._readManifest(manifestPath);
    return {
      action: 'incremental',
      status: 'LIVE',
      commitsBehind: 0,
      report: updateReport,
      timestamp: refreshedManifest?.timestamp ?? Date.now(),
      lastCommitSha: refreshedManifest?.lastCommitSha,
    };
  }

  /**
   * Syncs intelligence immediately after phase changes/commits.
   */
  static async syncPhaseFiles(
    changedFiles: string[],
    options: { projectRoot?: string; outputDir?: string } = {}
  ): Promise<UpdateReport | null> {
    const projectRoot = options.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
    const outputDir = options.outputDir
      ? path.resolve(options.outputDir)
      : path.join(projectRoot, 'superconductor', 'intelligence');

    if (!changedFiles || changedFiles.length === 0) {
      return null;
    }

    return await update({
      projectRoot,
      changedFiles,
      outputDir,
    });
  }

  private static _readManifest(manifestPath: string): Manifest | null {
    if (!fs.existsSync(manifestPath)) return null;
    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed?.timestamp !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
