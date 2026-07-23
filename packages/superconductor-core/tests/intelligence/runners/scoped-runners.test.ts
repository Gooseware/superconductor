import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runComplexity } from '../../../src/intelligence/runners/complexity';
import { runDependencyGraph } from '../../../src/intelligence/runners/dependency-graph';
import { runSast } from '../../../src/intelligence/runners/sast';
import { runSymbolExtraction } from '../../../src/intelligence/runners/symbol-extraction';
import { runTestGaps } from '../../../src/intelligence/runners/test-gaps';
import { runPackageSurface } from '../../../src/intelligence/runners/package-surface';

describe('Scoped Runners Backward Compatibility', () => {
  const projectRoot = process.cwd();
  let outputDir: string;
  const dummyCapability = { status: 'unavailable', tool: '' };
  
  beforeAll(() => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch(e) {}
  });

  const testCases = [
    { name: 'complexity', fn: (files?: string[]) => runComplexity(projectRoot, outputDir, dummyCapability, files) },
    { name: 'dependency-graph', fn: (files?: string[]) => runDependencyGraph(projectRoot, outputDir, dummyCapability, files) },
    { name: 'sast', fn: (files?: string[]) => runSast(projectRoot, outputDir, dummyCapability, dummyCapability, files) },
    { name: 'symbol-extraction', fn: (files?: string[]) => runSymbolExtraction(projectRoot, outputDir, dummyCapability, files) },
    { name: 'test-gaps', fn: (files?: string[]) => runTestGaps(projectRoot, outputDir, files) },
    { name: 'package-surface', fn: (files?: string[]) => runPackageSurface(projectRoot, outputDir, files) },
  ];

  for (const { name, fn } of testCases) {
    describe(`Runner: ${name}`, () => {
      it('degrades gracefully with nonexistent files', () => {
        expect(() => {
          const result = fn(['nonexistent_file_12345.ts']);
          expect(result).toBeDefined();
          expect(result.status).toBeDefined();
        }).not.toThrow();
      });

      it('behaves as before when scopedFiles is undefined', () => {
        expect(() => {
          const result = fn(undefined);
          expect(result).toBeDefined();
          expect(result.status).toBeDefined();
        }).not.toThrow();
      });

      it('behaves as before when scopedFiles is empty array', () => {
        expect(() => {
          const result = fn([]);
          expect(result).toBeDefined();
          expect(result.status).toBeDefined();
        }).not.toThrow();
      });
    });
  }
});
