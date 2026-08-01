import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { ToolCapability } from '../tool-registry.js';

export async function runGraphify(projectRoot: string, outputDir: string, capability: ToolCapability): Promise<{ status: string }> {
  if (capability.status === 'unavailable') {
    return { status: 'unavailable' };
  }

  const graphifyOut = path.join(outputDir, '09_graphify_graph.json');
  
  try {
    const cmd = `${capability.tool} extract "${projectRoot}" --code-only`;
    execSync(cmd, { stdio: 'ignore', cwd: projectRoot });
    
    const defaultGraphOut = path.join(projectRoot, 'graphify-out', 'graph.json');
    if (fs.existsSync(defaultGraphOut)) {
        fs.copyFileSync(defaultGraphOut, graphifyOut);
        return { status: 'available' };
    }
    
    return { status: 'degraded' };
  } catch (err) {
    return { status: 'degraded' };
  }
}
