import { execSync } from 'child_process';
import { RunnerResult } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

// Lizard text output line format:
//   NLOC  CCN  token  PARAM  length  funcName@startLine-endLine@filepath
const LIZARD_LINE_RE = /^\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s+.+?@\d+-\d+@(.+)$/;

export function runComplexity(projectRoot: string, outputDir: string, capability: any, scopedFiles?: string[]): RunnerResult<any> {
  const outFile = path.join(outputDir, '03_complexity.json');

  if (scopedFiles && scopedFiles.length > 0) {
    try {
      const existingChurn: Record<string, number> = {};
      /**
       * STATEFUL: Reads existing 03_complexity.json to backfill churn data for
       * files not in scopedFiles. Results differ if no prior full scan exists.
       * In CI environments without a prior scan, churn scores will be 0 for
       * non-scoped files. This is acceptable — the incremental updater always
       * runs after at least one full scan (guarded in update()).
       */
      if (fs.existsSync(outFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
          for (const item of data) {
             if (item.file && item.churnCount !== undefined) {
               existingChurn[item.file] = item.churnCount;
             }
          }
        } catch(e) {}
      }
      
      const { fileStats, lizardOk } = runLizardScan(projectRoot, capability, scopedFiles);
      const hotspots = mergeComplexityAndChurn(fileStats, existingChurn, lizardOk, scopedFiles);
      return { status: lizardOk || Object.keys(fileStats).length === 0 ? 'ok' : 'degraded', entries: hotspots };
    } catch (e) {
      return { status: 'degraded', entries: [] };
    }
  }

  try {
    const churn = calculateGitChurn(projectRoot);
    const { fileStats, lizardOk } = runLizardScan(projectRoot, capability);
    const hotspots = mergeComplexityAndChurn(fileStats, churn, lizardOk);

    fs.writeFileSync(outFile, JSON.stringify(hotspots, null, 2));

    return { status: lizardOk ? 'ok' : 'degraded', entries: null };
  } catch (e) {
    fs.writeFileSync(outFile, JSON.stringify([]));
    return { status: 'degraded', entries: null };
  }
}

function calculateGitChurn(projectRoot: string): Record<string, number> {
  const churn: Record<string, number> = {};
  try {
    const churnOut = execSync(
      `git log --all --name-only --format='format:' | grep -v '^$' | sort | uniq -c | sort -rn`,
      { cwd: projectRoot, encoding: 'utf8' }
    );
    for (const line of churnOut.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length === 2 && !isNaN(Number(parts[0]))) {
        churn[parts[1]] = parseInt(parts[0], 10);
      }
    }
  } catch (_e) {}
  return churn;
}

function runLizardScan(projectRoot: string, capability: any, scopedFiles?: string[]): { fileStats: Record<string, {maxCcn: number, nloc: number}>, lizardOk: boolean } {
  const fileStats: Record<string, { maxCcn: number; nloc: number }> = {};
  let lizardOk = false;

  if (capability && capability.status !== 'unavailable' && capability.tool === 'lizard') {
    // lizard exits 1 when warnings found — capture stdout from the thrown error
    let lizardOut = '';
    try {
      if (scopedFiles && scopedFiles.length > 0) {
        const outs: string[] = [];
        for (const file of scopedFiles) {
          const fullPath = path.join(projectRoot, file);
          if (!fs.existsSync(fullPath)) continue;
          try {
            outs.push(execSync(
              `lizard ${JSON.stringify(fullPath)} -x "*/node_modules/*" -x "*/dist/*" -x "*/.git/*" -x "*/coverage/*"`,
              { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
            ));
          } catch (e: any) {
            outs.push((e as any).stdout || '');
          }
        }
        lizardOut = outs.join('\n');
      } else {
        lizardOut = execSync(
          `lizard ${JSON.stringify(projectRoot)} -x "*/node_modules/*" -x "*/dist/*" -x "*/.git/*" -x "*/coverage/*"`,
          { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
        );
      }
    } catch (e: any) {
      // exit 1 on warnings is normal — stdout still has the data
      lizardOut = (e as any).stdout || '';
    }
    for (const line of lizardOut.split('\n')) {
      const m = line.match(LIZARD_LINE_RE);
      if (!m) continue;
      const ccn = parseInt(m[2], 10);
      const absPath = m[3];
      const filePath = absPath.replace(projectRoot + path.sep, '').replace(projectRoot + '/', '');
      if (!fileStats[filePath] || ccn > fileStats[filePath].maxCcn) {
        fileStats[filePath] = { maxCcn: ccn, nloc: parseInt(m[1], 10) };
      }
    }
    lizardOk = Object.keys(fileStats).length > 0;
  }
  return { fileStats, lizardOk };
}

function mergeComplexityAndChurn(fileStats: Record<string, {maxCcn: number, nloc: number}>, churn: Record<string, number>, lizardOk: boolean, scopedFiles?: string[]): any[] {
  const hotspots: any[] = [];
  
  const filesToProcess = scopedFiles && scopedFiles.length > 0 
    ? scopedFiles 
    : Object.keys(lizardOk ? fileStats : churn);

  if (lizardOk) {
    // Merge lizard CCN with git churn
    for (const file of filesToProcess) {
      const stats = fileStats[file];
      if (!stats && scopedFiles) {
        // If scoped but no CCN found (e.g. no functions), fallback to just churn
        const churnCount = churn[file] || 0;
        hotspots.push({
          file,
          cyclomatic_complexity: null,
          churnCount,
          hotspot_score: Math.log(1 + churnCount)
        });
        continue;
      }
      if (!stats) continue;
      const churnCount = churn[file] || 0;
      hotspots.push({
        file,
        cyclomatic_complexity: stats.maxCcn,
        nloc: stats.nloc,
        churnCount,
        hotspot_score: stats.maxCcn * Math.log(1 + churnCount)
      });
    }
  } else {
    // git-only fallback
    for (const file of filesToProcess) {
      const churnCount = churn[file] || 0;
      if (churnCount > 0 || scopedFiles) {
        hotspots.push({
          file,
          cyclomatic_complexity: null,
          churnCount,
          hotspot_score: Math.log(1 + churnCount)
        });
      }
    }
  }

  hotspots.sort((a, b) => b.hotspot_score - a.hotspot_score);
  return hotspots;
}
