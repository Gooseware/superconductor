import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function runGraphify(projectRoot: string, outputDir: string, capability: any) {
  const outFile = path.join(outputDir, '09_graphify_graph.json');
  if (!capability || capability.status === 'unavailable' || !capability.tool) {
    console.warn('[Intelligence] graphify not installed, skipping domain partition (graceful degradation).');
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }

  try {
    // Run graphify in project root
    execSync(`graphify .`, { cwd: projectRoot, stdio: 'ignore' });
    
    // Default output location of graphify is graphify-out/graph.json
    const graphifyOut = path.join(projectRoot, 'graphify-out', 'graph.json');
    if (fs.existsSync(graphifyOut)) {
      fs.copyFileSync(graphifyOut, outFile);
    } else {
      console.warn('[Intelligence] graphify succeeded but graphify-out/graph.json not found.');
      fs.writeFileSync(outFile, JSON.stringify(null));
      return { status: 'degraded' };
    }
    
    return { status: 'ok' };
  } catch (e: any) {
    console.warn(`[Intelligence] graphify failed: ${e.message}`);
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }
}
