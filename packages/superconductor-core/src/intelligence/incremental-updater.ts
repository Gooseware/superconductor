import * as fs from 'fs';
import * as path from 'path';
import { runPipeline } from './pipeline.js';
import { runFingerprint } from './runners/fingerprint.js';
import { runDependencyGraph } from './runners/dependency-graph.js';
import { runComplexity } from './runners/complexity.js';
import { runSast } from './runners/sast.js';
import { runSymbolExtraction } from './runners/symbol-extraction.js';
import { runTestGaps } from './runners/test-gaps.js';
import { runPackageSurface } from './runners/package-surface.js';
import { getSuperconductorHome, resolveRegistry } from './tool-registry.js';
import { spawnSync } from 'child_process';

export const PHASE_INVALIDATION: Record<string, (file: string) => boolean> = {
  complexity:          (f) => /\.(ts|js|tsx|jsx)$/.test(f) && !f.includes('.test.') && !f.includes('.spec.'),
  'dependency-graph':  (f) => /\.(ts|js|tsx|jsx|json)$/.test(f),
  sast:                (f) => /\.(ts|js|tsx|jsx)$/.test(f),
  'symbol-extraction': (f) => /\.(ts|js|tsx|jsx)$/.test(f),
  'test-gaps':         (f) => /\.(ts|js|tsx|jsx)$/.test(f),
  'package-surface':   (f) => /\.(ts|js|tsx|jsx)$/.test(f),
  fingerprint:         (f) => f.endsWith('package.json'),
  coupling:            (_) => true,  // always update coupling incrementally
};

export function mergeIntoJson<T extends { file: string; hotspot_score?: number }>(outputFile: string, newEntries: T[]): void {
  let existing: T[] = [];
  if (fs.existsSync(outputFile)) {
    try {
      const raw = fs.readFileSync(outputFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        existing = parsed;
      } else {
        // Non-array JSON (e.g. dep-graph shape) — log and preserve original
        process.stderr.write(`[superconductor:intelligence] mergeIntoJson: ${outputFile} is not an array, skipping merge\n`);
        return; // Do NOT overwrite non-array files
      }
    } catch (e) {
      // Corrupt JSON — back up, log, return without overwriting
      const backupPath = `${outputFile}.corrupt.${Date.now()}`;
      try { fs.copyFileSync(outputFile, backupPath); } catch {}
      process.stderr.write(`[superconductor:intelligence] mergeIntoJson: corrupt JSON in ${outputFile}, backed up to ${backupPath}, skipping merge\n`);
      return; // NEVER silently wipe existing data
    }
  }

  // Filter out entries where file matches any file in newEntries (normalize paths)
  const newFiles = new Set(newEntries.map(e => path.normalize(e.file)));
  let merged = existing.filter(e => {
    if (!e || typeof e.file !== 'string') return true;
    return !newFiles.has(path.normalize(e.file));
  });

  merged.push(...newEntries);

  if (merged.length > 0 && 'hotspot_score' in merged[0]) {
    merged.sort((a, b) => {
      const aScore = a.hotspot_score ?? 0;
      const bScore = b.hotspot_score ?? 0;
      return bScore - aScore;
    });
  }

  const tmpPath = `${outputFile}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2));
    fs.renameSync(tmpPath, outputFile);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw e;
  }
}

export interface UpdateReport {
  phasesRun: string[];
  filesUpdated: number;
  durationMs: number;
  snapshotSha: string;
}

export async function update(options: { projectRoot: string; changedFiles: string[]; outputDir: string }): Promise<UpdateReport> {
  const start = Date.now();
  const { projectRoot, changedFiles, outputDir } = options;
  const manifestPath = path.join(outputDir, '00_manifest.json');

  let headSha = 'unknown';
  // ADV-3: Use spawnSync instead of execSync — avoids shell interpretation and handles errors explicitly.
  const headResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf-8' });
  headSha = (headResult.stdout || '').trim();
  if (!headSha) {
    process.stderr.write('[superconductor:intelligence] Could not resolve HEAD SHA\n');
    headSha = 'unknown';
  }

  if (!fs.existsSync(manifestPath)) {
    runPipeline([], projectRoot, options.outputDir);
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      m.incrementalRuns = 0;
      m.lastCommitSha = headSha;
      const tmpManifest = `${manifestPath}.tmp.${Date.now()}`;
      try {
        fs.writeFileSync(tmpManifest, JSON.stringify(m, null, 2));
        fs.renameSync(tmpManifest, manifestPath);
      } catch (e) {
        try { fs.unlinkSync(tmpManifest); } catch {}
        throw e;
      }
    } catch (e) {}
    return {
      phasesRun: ['full-scan'],
      filesUpdated: changedFiles.length,
      durationMs: Date.now() - start,
      snapshotSha: headSha
    };
  }

  let manifest: any;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    runPipeline([], projectRoot, options.outputDir);
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      m.incrementalRuns = 0;
      m.lastCommitSha = headSha;
      const tmpManifest = `${manifestPath}.tmp.${Date.now()}`;
      try {
        fs.writeFileSync(tmpManifest, JSON.stringify(m, null, 2));
        fs.renameSync(tmpManifest, manifestPath);
      } catch (e) {
        try { fs.unlinkSync(tmpManifest); } catch {}
        throw e;
      }
    } catch (e) {}
    return {
      phasesRun: ['full-scan'],
      filesUpdated: changedFiles.length,
      durationMs: Date.now() - start,
      snapshotSha: headSha
    };
  }

  if (manifest.incrementalRuns >= 50) {
    manifest.incrementalRuns = 0;
    manifest.lastCommitSha = headSha; // use the already-resolved headSha
    manifest.timestamp = Date.now();
    const tmpManifest = `${manifestPath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tmpManifest, JSON.stringify(manifest, null, 2));
      fs.renameSync(tmpManifest, manifestPath);
    } catch (e) {
      try { fs.unlinkSync(tmpManifest); } catch {}
      throw e;
    }
    runPipeline([], projectRoot, options.outputDir); // full rescan overwrites all data
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      m.incrementalRuns = 0;
      m.lastCommitSha = headSha;
      const tmpManifest = `${manifestPath}.tmp.${Date.now()}`;
      try {
        fs.writeFileSync(tmpManifest, JSON.stringify(m, null, 2));
        fs.renameSync(tmpManifest, manifestPath);
      } catch (e) {
        try { fs.unlinkSync(tmpManifest); } catch {}
        throw e;
      }
    } catch (e) {}
    return { phasesRun: ['full-scan'], filesUpdated: 0, durationMs: Date.now() - start, snapshotSha: headSha };
  }

  const registry = resolveRegistry(getSuperconductorHome());
  const phasesRun: string[] = [];

  // fingerprint
  if (changedFiles.some(PHASE_INVALIDATION['fingerprint'])) {
    phasesRun.push('fingerprint');
    // NOTE: `fingerprint` runner summarises the whole repo (token counts, file stats).
    // It does not support per-file scoping — always runs as a full re-scan.
    // Per-file incremental merge is not applicable here.
    runFingerprint(projectRoot, outputDir, registry.capabilities.fingerprint);
  }

  // dependency-graph
  if (changedFiles.some(PHASE_INVALIDATION['dependency-graph'])) {
    phasesRun.push('dependency-graph');
    const res = runDependencyGraph(projectRoot, outputDir, registry.capabilities.dependency_graph, changedFiles);
    if (res.entries) mergeIntoJson(path.join(outputDir, '02_dependency_graph.json'), res.entries);
  }

  // complexity
  if (changedFiles.some(PHASE_INVALIDATION['complexity'])) {
    phasesRun.push('complexity');
    const res = runComplexity(projectRoot, outputDir, registry.capabilities.complexity, changedFiles);
    if (res.entries) mergeIntoJson(path.join(outputDir, '03_complexity.json'), res.entries);
  }

  // sast
  if (changedFiles.some(PHASE_INVALIDATION['sast'])) {
    phasesRun.push('sast');
    const res = runSast(projectRoot, outputDir, registry.capabilities.sast, registry.capabilities.sca, changedFiles);
    if (res.entries) mergeIntoJson(path.join(outputDir, '05_sast.json'), res.entries);
  }

  // symbol-extraction
  if (changedFiles.some(PHASE_INVALIDATION['symbol-extraction'])) {
    phasesRun.push('symbol-extraction');
    const res = runSymbolExtraction(projectRoot, outputDir, registry.capabilities.symbol_extraction, changedFiles);
    if (res.entries) mergeIntoJson(path.join(outputDir, '06_symbol_extraction.json'), res.entries);
  }

  // test-gaps
  if (changedFiles.some(PHASE_INVALIDATION['test-gaps'])) {
    phasesRun.push('test-gaps');
    const res = runTestGaps(projectRoot, outputDir, changedFiles);
    if (res.entries) mergeIntoJson(path.join(outputDir, '07_test_gaps.json'), res.entries);
  }

  // package-surface
  if (changedFiles.some(PHASE_INVALIDATION['package-surface'])) {
    phasesRun.push('package-surface');
    // NOTE: `package-surface` maps package.json exports across the repo.
    // It does not produce { file: string }[] output, so mergeIntoJson is not applicable.
    // Always runs as a full re-scan when package.json changes trigger this phase.
    runPackageSurface(projectRoot, outputDir);
  }

  // coupling (always update incrementally)
  phasesRun.push('coupling');
  try {
    const SHA_RE = /^[0-9a-f]{7,40}$/i;
    const lastSha = manifest.lastCommitSha && SHA_RE.test(manifest.lastCommitSha)
      ? manifest.lastCommitSha
      : null;
    let newCommits = '';
    try {
      const gitArgs = lastSha
        ? ['log', `${lastSha}..HEAD`, '--name-only', '--format=format:']
        : ['log', '-1', '--name-only', '--format=format:'];

      const gitResult = spawnSync('git', gitArgs, { cwd: projectRoot, encoding: 'utf8' });
      newCommits = gitResult.stdout || '';

      if (gitResult.error || gitResult.status !== 0) {
        process.stderr.write(`[superconductor:intelligence] coupling git log failed: ${gitResult.stderr}\n`);
      }
    } catch(e) {}
    
    const commitFiles = newCommits.split('\n').filter(Boolean);
    const churnCounts: Record<string, number> = {};
    for (const f of commitFiles) {
      churnCounts[f] = (churnCounts[f] || 0) + 1;
    }
    const churnEntries = Object.entries(churnCounts).map(([file, churn]) => ({ file, churn }));
    if (churnEntries.length > 0) {
      mergeIntoJson(path.join(outputDir, '04_coupling.json'), churnEntries);
    }
  } catch (err) {}

  manifest.lastCommitSha = headSha;
  manifest.incrementalRuns = (manifest.incrementalRuns || 0) + 1;
  manifest.timestamp = Date.now();
  const tmpManifest = `${manifestPath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tmpManifest, JSON.stringify(manifest, null, 2));
    fs.renameSync(tmpManifest, manifestPath);
  } catch (e) {
    try { fs.unlinkSync(tmpManifest); } catch {}
    throw e;
  }

  return {
    phasesRun,
    filesUpdated: changedFiles.length,
    durationMs: Date.now() - start,
    snapshotSha: headSha
  };
}
