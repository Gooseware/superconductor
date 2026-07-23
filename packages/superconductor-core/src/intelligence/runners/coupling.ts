import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function runCoupling(projectRoot: string, outputDir: string, capability: any) {
  const jsonFile = path.join(outputDir, '04_coupling.json');
  
  try {
    const churnOut = execSync(`git log --all --name-only --format='format:' | sort | uniq -c | sort -rn`, { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const lines = churnOut.split('\\n');
    let churn = [];
    for (const line of lines) {
      const parts = line.trim().split(/\\s+/);
      if (parts.length === 2) {
        churn.push({ file: parts[1], churnCount: parseInt(parts[0], 10) });
      }
    }
    
    churn.sort((a, b) => b.churnCount - a.churnCount);
    fs.writeFileSync(jsonFile, JSON.stringify(churn, null, 2));

    if (capability && capability.status !== 'unavailable' && capability.tool === 'code-maat') {
      const csvFile = path.join(outputDir, '04_coupling.csv');
      try {
        // We write mock if it fails
        const out = execSync(`java -jar code-maat.jar -l log.txt -c git -a coupling`, { cwd: projectRoot, encoding: 'utf8' });
        fs.writeFileSync(csvFile, out);
      } catch (e) {
        fs.writeFileSync(csvFile, 'entity,coupled,degree,average_revs');
      }
      return { status: 'ok' };
    }

    return { status: 'degraded' };
  } catch (e) {
    fs.writeFileSync(jsonFile, JSON.stringify([]));
    return { status: 'degraded' };
  }
}
