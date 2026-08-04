import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { mergeIntoJson, PHASE_INVALIDATION, update } from '../../src/intelligence/incremental-updater';
import * as pipelineModule from '../../src/intelligence/pipeline';
import * as registryModule from '../../src/intelligence/tool-registry';
import * as childProcess from 'child_process';
import * as dependencyGraphModule from '../../src/intelligence/runners/dependency-graph';

vi.mock('child_process');

vi.mock('../../src/intelligence/pipeline', () => ({
  runPipeline: vi.fn(),
}));

vi.mock('../../src/intelligence/tool-registry', () => ({
  getSuperconductorHome: vi.fn(() => '/fake/home'),
  resolveRegistry: vi.fn(() => ({
    capabilities: {
      fingerprint: true,
      dependency_graph: true,
      complexity: true,
      sast: true,
      sca: true,
      symbol_extraction: true,
      coupling: true
    }
  })),
}));

vi.mock('../../src/intelligence/runners/fingerprint', () => ({
  runFingerprint: vi.fn(() => ({ status: 'ok', entries: [{ file: 'package.json', some: 'val' }] }))
}));
vi.mock('../../src/intelligence/runners/dependency-graph', () => ({
  runDependencyGraph: vi.fn(() => ({ status: 'ok', entries: { nodes: [], edges: [], circularDeps: [] } }))
}));
vi.mock('../../src/intelligence/runners/complexity', () => ({
  runComplexity: vi.fn(() => ({ status: 'ok', entries: [] }))
}));
vi.mock('../../src/intelligence/runners/sast', () => ({
  runSast: vi.fn(() => ({ status: 'ok', entries: [] }))
}));
vi.mock('../../src/intelligence/runners/symbol-extraction', () => ({
  runSymbolExtraction: vi.fn(() => ({ status: 'ok', entries: [] }))
}));
vi.mock('../../src/intelligence/runners/test-gaps', () => ({
  runTestGaps: vi.fn(() => ({ status: 'ok', entries: [] }))
}));
vi.mock('../../src/intelligence/runners/package-surface', () => ({
  runPackageSurface: vi.fn(() => ({ status: 'ok', entries: [] }))
}));

describe('IncrementalUpdater', () => {
  const tmpDir = path.join(__dirname, 'tmp-test');

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });

    vi.mocked(childProcess.spawnSync).mockReturnValue({
      pid: 0, output: [], stdout: '', stderr: '', status: 0, signal: null, error: undefined
    } as any);
  });

  describe('mergeIntoJson', () => {
    it('merges new entries, removes old entries for same file, keeps entries for other files', () => {
      const file = path.join(tmpDir, 'test1.json');
      fs.writeFileSync(file, JSON.stringify([
        { file: 'a.ts', hotspot_score: 5 },
        { file: 'b.ts', hotspot_score: 2 }
      ]));

      mergeIntoJson(file, [{ file: 'b.ts', hotspot_score: 10 }, { file: 'c.ts', hotspot_score: 1 }]);

      const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(content).toEqual([
        { file: 'b.ts', hotspot_score: 10 },
        { file: 'a.ts', hotspot_score: 5 },
        { file: 'c.ts', hotspot_score: 1 }
      ]);
    });
  });

  describe('PHASE_INVALIDATION', () => {
    it('invalidates correctly for .ts file', () => {
      const f = 'src/index.ts';
      expect(PHASE_INVALIDATION['dependency-graph'](f)).toBe(true);
    });
  });

  describe('update()', () => {
    const projectRoot = tmpDir;
    const outputDir = path.join(tmpDir, 'intelligence');

    beforeEach(() => {
      fs.mkdirSync(outputDir, { recursive: true });
    });

    it('with 1 changed file: filters ghost nodes using changedFiles directly', async () => {
      // 1. Create a mock OLD graph with nodes from files ['src/a.ts', 'src/b.ts']
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify({ incrementalRuns: 10 }));
      fs.writeFileSync(path.join(outputDir, '02_dependency_graph.json'), JSON.stringify({ nodes: [
        { file: 'src/a.ts', deps: ['x'] },
        { file: 'src/b.ts', deps: ['y'] }
      ], edges: [], circularDeps: [] }));
      
      // 2. Declare changedFiles = ['src/a.ts'] (only a.ts changed)
      // 3. Create mock NEW graph output containing only src/a.ts nodes
      vi.mocked(dependencyGraphModule.runDependencyGraph).mockReturnValueOnce({
        status: 'ok',
        entries: { nodes: [{ source: 'src/a.ts', deps: ['z'] }], edges: [], circularDeps: [] }
      } as any);
      
      // 4. Call the real incremental merge function with OLD graph + new output + changedFiles
      await update({ projectRoot, changedFiles: ['src/a.ts'], outputDir });
      
      // 5. Assert: result contains src/a.ts nodes from new graph, src/b.ts nodes from old graph
      const graph = JSON.parse(fs.readFileSync(path.join(outputDir, '02_dependency_graph.json'), 'utf-8'));
      expect(graph.nodes).toContainEqual({ file: 'src/a.ts', deps: ['z'], source: 'src/a.ts' });
      expect(graph.nodes).toContainEqual({ file: 'src/b.ts', deps: ['y'] });
      expect(graph.nodes).not.toContainEqual({ file: 'src/a.ts', deps: ['x'] }); // NO ghost nodes
    });

    it('with file deletion: filters ghost nodes if new graph is empty', async () => {
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify({ incrementalRuns: 10 }));
      fs.writeFileSync(path.join(outputDir, '02_dependency_graph.json'), JSON.stringify({ nodes: [
        { file: 'src/a.ts', deps: ['x'] },
        { file: 'src/b.ts', deps: ['y'] }
      ], edges: [], circularDeps: [] }));
      
      vi.mocked(dependencyGraphModule.runDependencyGraph).mockReturnValueOnce({
        status: 'ok',
        entries: { nodes: [], edges: [], circularDeps: [] } // a.ts deleted, empty nodes returned
      } as any);
      
      await update({ projectRoot, changedFiles: ['src/a.ts'], outputDir });
      
      const graph = JSON.parse(fs.readFileSync(path.join(outputDir, '02_dependency_graph.json'), 'utf-8'));
      expect(graph.nodes).toEqual([{ file: 'src/b.ts', deps: ['y'] }]);
      expect(graph.nodes).not.toContainEqual({ file: 'src/a.ts', deps: ['x'] }); // Ghost node removed
    });
  });
});
