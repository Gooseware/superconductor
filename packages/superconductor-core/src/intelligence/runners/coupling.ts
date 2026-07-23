import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getSuperconductorHome } from '../tool-registry.js';

export function runCoupling(projectRoot: string, outputDir: string, capability: any) {
  const jsonFile = path.join(outputDir, '04_coupling.json');

  try {
    // Phase A: git file churn (always runs, used as fallback coupling signal)
    let churn: Array<{ file: string; churnCount: number }> = [];
    try {
      const churnOut = execSync(
        `git log --all --name-only --format='format:' | grep -v '^$' | sort | uniq -c | sort -rn`,
        { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      for (const line of churnOut.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length === 2 && !isNaN(Number(parts[0]))) {
          churn.push({ file: parts[1], churnCount: parseInt(parts[0], 10) });
        }
      }
    } catch (_e) {}

    churn.sort((a, b) => b.churnCount - a.churnCount);
    fs.writeFileSync(jsonFile, JSON.stringify(churn, null, 2));

    // Phase B: code-maat coupling analysis (if available)
    if (capability && capability.status !== 'unavailable' && capability.tool === 'code-maat') {
      const csvFile = path.join(outputDir, '04_coupling.csv');
      // Use PID + timestamp for less predictable temp filename
      const tmpLog = path.join(os.tmpdir(), `sc_gitlog_${process.pid}_${Date.now()}.log`);
      const jarPath = path.join(getSuperconductorHome(), 'bin', 'code-maat.jar');

      try {
        // code-maat git2 format: %H,%ad,%s with --date=short plus numstat
        const logContent = execSync(
          `git log --all --numstat --date=short --format='%H,%ad,%s' --after=2000-01-01`,
          { cwd: projectRoot, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
        );
        // Write via Node.js (not shell redirect) to prevent tmpLog injection
        fs.writeFileSync(tmpLog, logContent, 'utf8');

        // Shell-quote both paths to prevent injection from spaces/metacharacters
        const quotedJar = JSON.stringify(jarPath);
        const quotedLog = JSON.stringify(tmpLog);
        const out = execSync(
          `java -jar ${quotedJar} -l ${quotedLog} -c git2 -a coupling`,
          { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );
        fs.writeFileSync(csvFile, out);
      } catch (_e) {
        fs.writeFileSync(csvFile, 'entity,coupled,degree,average_revs\n');
      } finally {
        try { if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog); } catch (_) {}
      }
      return { status: 'ok' };
    }

    return { status: churn.length > 0 ? 'ok' : 'degraded' };
  } catch (e) {
    fs.writeFileSync(jsonFile, JSON.stringify([]));
    return { status: 'degraded' };
  }
}
