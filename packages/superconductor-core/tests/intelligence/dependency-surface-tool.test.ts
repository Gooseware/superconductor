import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getDependencySurface } from '../../src/intelligence/dependency-surface-tool';

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
});
