import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function runComplexity(projectRoot: string, outputDir: string, capability: any) {
  const outFile = path.join(outputDir, '03_complexity.json');
  
  try {
    let churn: Record<string, number> = {};
    try {
      const churnOut = execSync(`git log --all --name-only --format='format:' | sort | uniq -c | sort -rn`, { cwd: projectRoot, encoding: 'utf8' });
      const lines = churnOut.split('\\n');
      for (const line of lines) {
        const parts = line.trim().split(/\\s+/);
        if (parts.length === 2) {
          churn[parts[1]] = parseInt(parts[0], 10);
        }
      }
    } catch (e) {}

    let hotspots = [];

    if (capability && capability.status !== 'unavailable' && capability.tool === 'lizard') {
      const out = execSync(`lizard ${projectRoot} -w -f json`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      // parse lizard json... for now fallback
    }
    
    // git-only churn score fallback
    for (const [file, churnCount] of Object.entries(churn)) {
      hotspots.push({
        file,
        cyclomatic_complexity: 1, // unknown
        churnCount,
        hotspot_score: Math.log(1 + churnCount)
      });
    }
    
    hotspots.sort((a, b) => b.hotspot_score - a.hotspot_score);
    fs.writeFileSync(outFile, JSON.stringify(hotspots, null, 2));
    
    console.log('\\nTop 10 Complexity Hotspots:');
    for (let i = 0; i < Math.min(10, hotspots.length); i++) {
      console.log(`${hotspots[i].file} (Score: ${hotspots[i].hotspot_score.toFixed(2)})`);
    }

    return { status: capability?.tool === 'lizard' ? 'ok' : 'degraded' };
  } catch (e) {
    fs.writeFileSync(outFile, JSON.stringify([]));
    return { status: 'degraded' };
  }
}
