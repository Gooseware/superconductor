import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { ToolCapability } from '../tool-registry.js';

export async function runGraphify(projectRoot: string, outputDir: string, capability: ToolCapability): Promise<{ status: string }> {
  if (capability.status === 'unavailable' || !capability.tool) {
    return { status: 'unavailable' };
  }

  const graphifyOut = path.join(outputDir, '09_graphify_graph.json');
  
  try {
    
    execFileSync(capability.tool, ['extract', projectRoot, '--code-only'], { stdio: 'ignore', cwd: projectRoot });
    
    const defaultGraphOut = path.join(projectRoot, 'graphify-out', 'graph.json');
    if (fs.existsSync(defaultGraphOut)) {
        fs.copyFileSync(defaultGraphOut, graphifyOut);
        return { status: 'available' };
    }
    
    return { status: 'degraded' };
  } catch (err) {
    console.warn(`[graphify] execution failed: ${err}`);
    return { status: 'degraded' };
  }
}
