import * as fs from 'fs';
import * as path from 'path';
import { DependencyAnalyzer } from '../dependency-analyzer.js';
import { RunnerResult } from './types.js';

function getFiles(dir: string, ext: string[]): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git')) {
      results = results.concat(getFiles(file, ext));
    } else {
      if (ext.some(e => file.endsWith(e))) {
        results.push(file);
      }
    }
  });
  return results;
}

export function runDependencySurface(projectRoot: string, outputDir: string, scopedFiles?: string[]): RunnerResult<any> {
  const outFile = path.join(outputDir, '08_dependency_surface.json');
  
  const files = scopedFiles || getFiles(projectRoot, ['.ts', '.tsx', '.js', '.jsx']);
  
  const analyzer = new DependencyAnalyzer();
  analyzer.setFileReader((filePath: string) => {
    return fs.readFileSync(filePath, 'utf8');
  });
  
  const heatmap = analyzer.generateUsageHeatmap(files);
  
  const relativeHeatmap: Record<string, number> = {};
  for (const [key, val] of Object.entries(heatmap)) {
    const relativeKey = path.relative(projectRoot, key);
    const posixKey = relativeKey.split(path.sep).join(path.posix.sep);
    relativeHeatmap[posixKey] = val;
  }
  
  const data = { heatmap: relativeHeatmap };
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
  
  return { status: 'ok', entries: data };
}
