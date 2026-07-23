import * as fs from 'fs';
import * as path from 'path';
import { getSuperconductorHome, resolveRegistry } from './tool-registry.js';
import { preflight } from './preflight.js';
import { runFingerprint } from './runners/fingerprint.js';
import { runDependencyGraph } from './runners/dependency-graph.js';
import { runComplexity } from './runners/complexity.js';
import { runCoupling } from './runners/coupling.js';
import { runSast } from './runners/sast.js';
import { runSymbolExtraction, runToonSummary } from './runners/symbol-extraction.js';
import { runTestGaps } from './runners/test-gaps.js';
import { generateReport } from './report.js';

export function runPipeline(args: string[], projectRoot: string, baseOutputDir: string) {
  let skipSast = args.includes('--skip-sast');
  let generateRep = args.includes('--report');
  let setupOnly = args.includes('--setup-only');
  
  const home = getSuperconductorHome();
  const registry = resolveRegistry(home);
  
  if (setupOnly) return;
  
  const outputDir = path.join(baseOutputDir, 'intelligence');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const manifest = {
    superconductorVersion: '1.0.0',
    timestamp: Date.now(),
    trackId: 'unknown',
    projectRoot,
    tools: registry.capabilities,
    degraded: [] as string[],
    phases: {} as any
  };

  const measure = (name: string, fn: () => any) => {
    const start = Date.now();
    const result = fn();
    const elapsed = Date.now() - start;
    manifest.phases[name] = { elapsed, output: result.status };
    if (result.status === 'degraded' || result.status === 'unavailable') {
      manifest.degraded.push(name);
    }
  };

  measure('p1_fingerprint', () => runFingerprint(projectRoot, outputDir, registry.capabilities.fingerprint));
  measure('p2_dependency_graph', () => runDependencyGraph(projectRoot, outputDir, registry.capabilities.dependency_graph));
  measure('p3_complexity', () => runComplexity(projectRoot, outputDir, registry.capabilities.complexity));
  measure('p4_coupling', () => runCoupling(projectRoot, outputDir, registry.capabilities.coupling));
  
  if (!skipSast) {
    measure('p5_sast', () => runSast(projectRoot, outputDir, registry.capabilities.sast, registry.capabilities.sca));
  }
  
  measure('p6_symbol_extraction', () => {
    const res = runSymbolExtraction(projectRoot, outputDir, registry.capabilities.symbol_extraction);
    runToonSummary(projectRoot, outputDir);
    return res;
  });
  
  measure('p7_test_gaps', () => runTestGaps(projectRoot, outputDir));

  fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifest, null, 2));

  if (generateRep) {
    generateReport(outputDir);
  }
}
