import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function runSymbolExtraction(projectRoot: string, outputDir: string, capability: any, scopedFiles?: string[]) {
  const outFile = path.join(outputDir, '06_api_surface.toon');
  
  if (!capability || capability.status === 'unavailable') {
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: null };
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }

  try {
    if (capability.tool === 'universal-ctags' || capability.tool === 'ctags') {
      let targets = projectRoot;
      if (scopedFiles && scopedFiles.length > 0) {
        targets = scopedFiles.filter(f => fs.existsSync(path.join(projectRoot, f))).map(f => JSON.stringify(path.join(projectRoot, f))).join(' ');
      }
      
      if (scopedFiles && scopedFiles.length > 0 && !targets) {
        return { status: 'ok', entries: '' };
      }

      const out = execSync(
        `ctags --output-format=json -R \
          --exclude=node_modules --exclude=dist --exclude=.git --exclude=coverage \
          --exclude='*.min.js' --exclude='*.bundle.js' \
          --languages=TypeScript,JavaScript \
          ${targets}`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] }
      );
      
      if (scopedFiles && scopedFiles.length > 0) {
        return { status: 'ok', entries: out };
      }
      fs.writeFileSync(outFile, out);
      return { status: 'ok' };
    } else if (capability.tool === 'tree-sitter-analyzer') {
      // not implemented fully, mock
      if (scopedFiles && scopedFiles.length > 0) return { status: 'ok', entries: null };
      fs.writeFileSync(outFile, JSON.stringify(null));
      return { status: 'ok' };
    }
    
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: null };
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  } catch (e) {
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: null };
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }
}

export function runToonSummary(projectRoot: string, outputDir: string) {
  const toonFile = path.join(outputDir, '06_api_surface.toon');
  const outFile = path.join(outputDir, '06_api_surface_summary.md');
  
  if (!fs.existsSync(toonFile)) {
    fs.writeFileSync(outFile, 'No symbol data available.');
    return { status: 'degraded' };
  }

  const content = fs.readFileSync(toonFile, 'utf8');
  if (content === 'null' || !content) {
    fs.writeFileSync(outFile, 'No symbol data available.');
    return { status: 'degraded' };
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
  return { status: 'ok' };
}
