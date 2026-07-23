import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Lizard text output line format:
//   NLOC  CCN  token  PARAM  length  funcName@startLine-endLine@filepath
const LIZARD_LINE_RE = /^\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s+.+?@\d+-\d+@(.+)$/;

export function runComplexity(projectRoot: string, outputDir: string, capability: any) {
  const outFile = path.join(outputDir, '03_complexity.json');

  try {
    const churn = calculateGitChurn(projectRoot);
    const { fileStats, lizardOk } = runLizardScan(projectRoot, capability);
    const hotspots = mergeComplexityAndChurn(fileStats, churn, lizardOk);

    fs.writeFileSync(outFile, JSON.stringify(hotspots, null, 2));

    return { status: lizardOk ? 'ok' : 'degraded' };
  } catch (e) {
    fs.writeFileSync(outFile, JSON.stringify([]));
    return { status: 'degraded' };
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

function runLizardScan(projectRoot: string, capability: any): { fileStats: Record<string, {maxCcn: number, nloc: number}>, lizardOk: boolean } {
  const fileStats: Record<string, { maxCcn: number; nloc: number }> = {};
  let lizardOk = false;

  if (capability && capability.status !== 'unavailable' && capability.tool === 'lizard') {
    // lizard exits 1 when warnings found — capture stdout from the thrown error
    let lizardOut = '';
    try {
      lizardOut = execSync(
        `lizard ${JSON.stringify(projectRoot)} -x "*/node_modules/*" -x "*/dist/*" -x "*/.git/*" -x "*/coverage/*"`,
        { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
      );
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

function mergeComplexityAndChurn(fileStats: Record<string, {maxCcn: number, nloc: number}>, churn: Record<string, number>, lizardOk: boolean): any[] {
  const hotspots: any[] = [];

  if (lizardOk) {
    // Merge lizard CCN with git churn
    for (const [file, stats] of Object.entries(fileStats)) {
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
    for (const [file, churnCount] of Object.entries(churn)) {
      hotspots.push({
        file,
        cyclomatic_complexity: null,
        churnCount,
        hotspot_score: Math.log(1 + churnCount)
      });
    }
  }

  hotspots.sort((a, b) => b.hotspot_score - a.hotspot_score);
  return hotspots;
}
