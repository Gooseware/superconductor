import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runDependencySurface } from '../../../src/intelligence/runners/dependency-surface';

describe('Dependency Surface Runner', () => {
  it('should generate usage heatmap and serialize to 08_dependency_surface.json', async () => {
    // Setup test scenario
    const projectRoot = path.join(__dirname, 'fixtures', 'mock-project');
    const outputDir = path.join(__dirname, 'output-tmp');
    
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Create mock project structure
    fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'a.ts'), 'import { b } from "./b";');
    fs.writeFileSync(path.join(projectRoot, 'src', 'b.ts'), 'export const b = 1;');
    fs.writeFileSync(path.join(projectRoot, 'src', 'c.ts'), 'import { b } from "./b";\nimport { d } from "./d";');
    fs.writeFileSync(path.join(projectRoot, 'src', 'd.ts'), 'export const d = 2;');
    
    // Run the runner
    await runDependencySurface(projectRoot, outputDir);
    
    const outFile = path.join(outputDir, '08_dependency_surface.json');
    expect(fs.existsSync(outFile)).toBe(true);
    
    const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    // Heatmap should show how many times a file is imported by others
    // a.ts imports b.ts
    // c.ts imports b.ts, d.ts
    // So 'src/b.ts' = 2, 'src/d.ts' = 1
    expect(data.heatmap).toBeDefined();
    expect(data.heatmap['src/b.ts']).toBe(2);
    expect(data.heatmap['src/d.ts']).toBe(1);
    expect(data.heatmap['src/a.ts'] || 0).toBe(0);
    expect(data.heatmap['src/c.ts'] || 0).toBe(0);

    // Cleanup
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });
});
