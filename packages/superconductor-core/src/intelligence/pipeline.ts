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
import { runPackageSurface } from './runners/package-surface.js';
import { generateReport } from './report.js';

export function runPipeline(args: string[], projectRoot: string, baseOutputDir: string) {
  const skipSast = args.includes('--skip-sast');
  const generateRep = args.includes('--report');
  const setupOnly = args.includes('--setup-only');

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
    phases: {} as Record<string, { elapsed: number; output: string; error?: string }>
  };

  // Resilient measure: phase failures are caught and recorded — pipeline always continues
  const measure = (name: string, fn: () => { status: string }) => {
    const start = Date.now();
    try {
      const result = fn();
      const elapsed = Date.now() - start;
      manifest.phases[name] = { elapsed, output: result.status };
      if (result.status === 'degraded' || result.status === 'unavailable') {
        manifest.degraded.push(name);
      }
    } catch (err: unknown) {
      const elapsed = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      manifest.phases[name] = { elapsed, output: 'degraded', error: msg.slice(0, 200) };
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
  measure('p8_package_surface', () => runPackageSurface(projectRoot, outputDir));

  // Always write manifest — even on partial failure
  fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify(manifest, null, 2));

  if (generateRep) {
    generateReport(outputDir);
  }
}
