import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function runGraphify(projectRoot: string, outputDir: string, capability: any) {
  const outFile = path.join(outputDir, '09_graphify_graph.json');

  // Graceful degradation: graphify not installed is an expected, non-error state.
  if (!capability || capability.status === 'unavailable' || !capability.tool) {
    console.warn('[Intelligence] graphify not installed — skipping Leiden domain partition (graceful degradation).');
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded', reason: 'graphify_not_installed' };
  }

  // Runtime failures must throw — caller decides on fallback strategy.
  try {
    execSync('graphify .', { cwd: projectRoot, stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`[Intelligence] graphify failed: ${e.message}`);
  }

  const graphifyOut = path.join(projectRoot, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graphifyOut)) {
    throw new Error(
      '[Intelligence] graphify exited 0 but graphify-out/graph.json was not produced. ' +
      'Check graphify version and output directory configuration.'
    );
  }

  try {
    const data = JSON.parse(fs.readFileSync(graphifyOut, 'utf8'));
    fs.writeFileSync(outFile, JSON.stringify(data));
  } catch (e: any) {
    throw new Error(
      `[Intelligence] Failed to parse graphify output: ${e.message}. ` +
      'Ensure the graphify tool is generating valid JSON.'
    );
  }

  return { status: 'ok' };
}
