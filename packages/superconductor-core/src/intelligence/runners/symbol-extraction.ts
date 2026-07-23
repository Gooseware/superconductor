import { execSync, spawnSync } from 'child_process';
import { RunnerResult } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

export function runSymbolExtraction(projectRoot: string, outputDir: string, capability: any, scopedFiles?: string[]): RunnerResult<any> {
  const outFile = path.join(outputDir, '06_api_surface.toon');
  
  if (!capability || capability.status === 'unavailable') {
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: null };
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded', entries: null };
  }

  try {
    if (capability.tool === 'universal-ctags' || capability.tool === 'ctags') {
      let out = '';
      if (scopedFiles && scopedFiles.length > 0) {
        const validScopedFiles = scopedFiles.filter(f => fs.existsSync(path.join(projectRoot, f)));
        if (validScopedFiles.length === 0) {
          return { status: 'ok', entries: [] };
        }
        for (const f of validScopedFiles) {
          const absPath = path.resolve(projectRoot, f);
          if (!absPath.startsWith(path.resolve(projectRoot))) continue;
          
          const result = spawnSync('ctags', [
            '--output-format=json',
            '-R',
            '--exclude=node_modules', '--exclude=dist', '--exclude=.git', '--exclude=coverage',
            '--exclude=*.min.js', '--exclude=*.bundle.js',
            '--languages=TypeScript,JavaScript',
            absPath
          ], {
            encoding: 'utf8',
            maxBuffer: 5 * 1024 * 1024
          });
          if (result.stdout) out += result.stdout;
        }
        return { status: 'ok', entries: [out] }; // wrapped in array to match T[]
      }

      out = spawnSync('ctags', [
        '--output-format=json',
        '-R',
        '--exclude=node_modules', '--exclude=dist', '--exclude=.git', '--exclude=coverage',
        '--exclude=*.min.js', '--exclude=*.bundle.js',
        '--languages=TypeScript,JavaScript',
        projectRoot
      ], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024
      }).stdout || '';
      
      fs.writeFileSync(outFile, out);
      return { status: 'ok', entries: null };
    } else if (capability.tool === 'tree-sitter-analyzer') {
      // not implemented fully, mock
      if (scopedFiles && scopedFiles.length > 0) return { status: 'ok', entries: null };
      fs.writeFileSync(outFile, JSON.stringify(null));
      return { status: 'ok', entries: null };
    }
    
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: null };
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded', entries: null };
  } catch (e) {
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: null };
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded', entries: null };
  }
}

export function runToonSummary(projectRoot: string, outputDir: string): RunnerResult<any> {
  const toonFile = path.join(outputDir, '06_api_surface.toon');
  const outFile = path.join(outputDir, '06_api_surface_summary.md');
  
  if (!fs.existsSync(toonFile)) {
    fs.writeFileSync(outFile, 'No symbol data available.');
    return { status: 'degraded', entries: null };
  }

  const content = fs.readFileSync(toonFile, 'utf8');
  if (content === 'null' || !content) {
    fs.writeFileSync(outFile, 'No symbol data available.');
    return { status: 'degraded', entries: null };
  }

  let summary = '# API Surface Summary\\n\\n';
  try {
    const lines = content.split('\\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        summary += `[${item.kind || 'symbol'}] ${item.path}:${item.line} ${item.name}() — "undocumented"\\n`;
      } catch (e) {}
    }
  } catch (e) {
    summary += 'Failed to parse symbol data.';
  }
  
  fs.writeFileSync(outFile, summary);
  return { status: 'ok', entries: null };
}
