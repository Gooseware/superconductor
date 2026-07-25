import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getDependencySurface } from '../../src/intelligence/dependency-surface-tool.js';
import { GenerateResearchPrompt } from '../../src/intelligence/prompt-generator.js';
import { IntelligenceSnapshotReader } from '../../src/intelligence/snapshot-reader.js';

describe('getDependencySurface', () => {
  it('should read the full heatmap if no depName is provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-intel-'));
    const intelDir = path.join(tmpDir, 'superconductor', 'intelligence');
    fs.mkdirSync(intelDir, { recursive: true });

    const mockData = {
      heatmap: {
        'src/a.ts': 5,
        'src/b.ts': 2
      }
    };
    fs.writeFileSync(path.join(intelDir, '08_dependency_surface.json'), JSON.stringify(mockData));

    const result = getDependencySurface(tmpDir);
    expect(result).toEqual(mockData.heatmap);
  });

  it('should read specific dependency score if depName is provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-intel-'));
    const intelDir = path.join(tmpDir, 'superconductor', 'intelligence');
    fs.mkdirSync(intelDir, { recursive: true });

    const mockData = {
      heatmap: {
        'src/a.ts': 5,
        'src/b.ts': 2
      }
    };
    fs.writeFileSync(path.join(intelDir, '08_dependency_surface.json'), JSON.stringify(mockData));

    const result = getDependencySurface(tmpDir, 'src/a.ts');
    expect(result).toEqual({ 'src/a.ts': 5 });
  });

  it('should return empty object if file does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-intel-'));
    const result = getDependencySurface(tmpDir);
    expect(result).toEqual({});
  });

  it('should return empty object for unknown dependency', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-intel-'));
    const intelDir = path.join(tmpDir, 'superconductor', 'intelligence');
    fs.mkdirSync(intelDir, { recursive: true });

    const mockData = {
      heatmap: {
        'src/a.ts': 5,
      }
    };
    fs.writeFileSync(path.join(intelDir, '08_dependency_surface.json'), JSON.stringify(mockData));

    const result = getDependencySurface(tmpDir, 'src/unknown.ts');
    expect(result).toEqual({ 'src/unknown.ts': 0 });
  });

  describe('Shared Snapshot Caching & Dynamic Query Capability', () => {
    it('should reuse IntelligenceSnapshotReader shared memory cache on consecutive calls', () => {
      IntelligenceSnapshotReader.clearCache();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-intel-'));
      const intelDir = path.join(tmpDir, 'superconductor', 'intelligence');
      fs.mkdirSync(intelDir, { recursive: true });

      const mockData = {
        heatmap: {
          'src/index.ts': 12,
          'src/util.ts': 4
        }
      };
      const depFilePath = path.join(intelDir, '08_dependency_surface.json');
      fs.writeFileSync(depFilePath, JSON.stringify(mockData));

      const loadSpy = vi.spyOn(IntelligenceSnapshotReader, 'load');

      // First query populates cache
      const result1 = getDependencySurface(tmpDir, 'src/index.ts');
      expect(result1).toEqual({ 'src/index.ts': 12 });

      // Second query uses cached snapshot in IntelligenceSnapshotReader
      const result2 = getDependencySurface(tmpDir, 'src/index.ts');
      expect(result2).toEqual({ 'src/index.ts': 12 });

      expect(loadSpy).toHaveBeenCalledTimes(2);

      // Directly verify IntelligenceSnapshotReader shared memory reference equality
      const context1 = IntelligenceSnapshotReader.load(intelDir, tmpDir);
      const context2 = IntelligenceSnapshotReader.load(intelDir, tmpDir);
      expect(context1).toBe(context2);
      expect(context1?.dependencySurfaceMap).toBe(context2?.dependencySurfaceMap);

      loadSpy.mockRestore();
    });

    it('should verify dependency surface intelligence is dynamically queried and NOT proactively injected into prompt context', () => {
      const basePrompt = 'Perform architectural analysis of the project.';
      const generatedPrompt = GenerateResearchPrompt('/fake/workspace', basePrompt);

      expect(generatedPrompt).toContain(basePrompt);
      expect(generatedPrompt).not.toContain('08_dependency_surface');
      expect(generatedPrompt).not.toContain('dependencySurfaceMap');
    });
  });


});


