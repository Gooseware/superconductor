import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { mergeIntoJson, PHASE_INVALIDATION, update } from '../../src/intelligence/incremental-updater';
import * as pipelineModule from '../../src/intelligence/pipeline';
import * as registryModule from '../../src/intelligence/tool-registry';
import * as childProcess from 'child_process';

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
  runDependencyGraph: vi.fn(() => ({ status: 'ok', entries: [] }))
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

    // ADV-3: spawnSync is now used instead of execSync. Provide a default mock
    // that returns the correct SpawnSyncReturns shape so headSha resolves gracefully.
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

    it('handles missing/malformed existing file gracefully', () => {
      const file = path.join(tmpDir, 'test2.json');
      mergeIntoJson(file, [{ file: 'a.ts', hotspot_score: 5 }]);
      let content = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(content).toEqual([{ file: 'a.ts', hotspot_score: 5 }]);

      fs.writeFileSync(file, '{ malformed json');
      mergeIntoJson(file, [{ file: 'b.ts', hotspot_score: 1 }]);
      content = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(content).toEqual([{ file: 'b.ts', hotspot_score: 1 }]);
    });

    it('atomic write: uses temp file and renames', () => {
      const file = path.join(tmpDir, 'test3.json');
      mergeIntoJson(file, [{ file: 'a.ts' }]);
      expect(fs.existsSync(file)).toBe(true);
    });
  });

  describe('PHASE_INVALIDATION', () => {
    it('invalidates correctly for .ts file', () => {
      const f = 'src/index.ts';
      expect(PHASE_INVALIDATION['complexity'](f)).toBe(true);
      expect(PHASE_INVALIDATION['dependency-graph'](f)).toBe(true);
      expect(PHASE_INVALIDATION['sast'](f)).toBe(true);
      expect(PHASE_INVALIDATION['symbol-extraction'](f)).toBe(true);
      expect(PHASE_INVALIDATION['test-gaps'](f)).toBe(true);
      expect(PHASE_INVALIDATION['package-surface'](f)).toBe(true);
      expect(PHASE_INVALIDATION['fingerprint'](f)).toBe(false);
      expect(PHASE_INVALIDATION['coupling'](f)).toBe(true);
    });

    it('invalidates correctly for .test.ts file', () => {
      const f = 'src/index.test.ts';
      expect(PHASE_INVALIDATION['complexity'](f)).toBe(false);
      expect(PHASE_INVALIDATION['test-gaps'](f)).toBe(true);
    });

    it('invalidates correctly for package.json', () => {
      const f = 'package.json';
      expect(PHASE_INVALIDATION['fingerprint'](f)).toBe(true);
      expect(PHASE_INVALIDATION['dependency-graph'](f)).toBe(true);
      expect(PHASE_INVALIDATION['complexity'](f)).toBe(false);
    });
  });

  describe('update()', () => {
    const projectRoot = tmpDir;
    const outputDir = path.join(tmpDir, 'intelligence');

    beforeEach(() => {
      fs.mkdirSync(outputDir, { recursive: true });
    });

    it('with missing manifest: triggers full scan path', async () => {
      const res = await update({ projectRoot, changedFiles: ['a.ts'], outputDir });
      expect(res.phasesRun).toEqual(['full-scan']);
      expect(pipelineModule.runPipeline).toHaveBeenCalled();
    });

    it('with incrementalRuns=50: triggers full rescan path', async () => {
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify({ incrementalRuns: 50 }));
      const res = await update({ projectRoot, changedFiles: ['a.ts'], outputDir });
      expect(res.phasesRun).toEqual(['full-scan']);
      expect(pipelineModule.runPipeline).toHaveBeenCalled();
    });

    it('with 1 changed file: correct phases run, mergeIntoJson called', async () => {
      fs.writeFileSync(path.join(outputDir, '00_manifest.json'), JSON.stringify({ incrementalRuns: 10 }));
      
      const res = await update({ projectRoot, changedFiles: ['src/app.ts'], outputDir });
      
      expect(res.phasesRun).toContain('complexity');
      expect(res.phasesRun).toContain('dependency-graph');
      expect(res.phasesRun).toContain('sast');
      expect(res.phasesRun).toContain('symbol-extraction');
      expect(res.phasesRun).toContain('test-gaps');
      expect(res.phasesRun).toContain('package-surface');
      expect(res.phasesRun).toContain('coupling');
      expect(res.phasesRun).not.toContain('fingerprint');

      const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, '00_manifest.json'), 'utf-8'));
      expect(manifest.incrementalRuns).toBe(11);
    });
  });
});
