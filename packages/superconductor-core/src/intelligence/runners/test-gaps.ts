import * as fs from 'fs';
import * as path from 'path';

function walkDir(dir: string, callback: (file: string) => void) {
  if (!fs.existsSync(dir)) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const stat = fs.lstatSync(full);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
          if (!file.includes('node_modules') && !file.includes('.git')) {
            walkDir(full, callback);
          }
        } else {
          callback(full);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

export function runTestGaps(projectRoot: string, outputDir: string, scopedFiles?: string[]) {
  const outFile = path.join(outputDir, '07_test_gaps.json');
  const couplingFile = path.join(outputDir, '04_coupling.json');
  
  let churn: Record<string, number> = {};
  if (fs.existsSync(couplingFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(couplingFile, 'utf8'));
      for (const item of data) {
        if (item.file && item.churnCount !== undefined) {
          churn[item.file] = item.churnCount;
        }
      }
    } catch (e) {}
  }

  const allFiles: string[] = [];
  
  if (scopedFiles && scopedFiles.length > 0) {
    for (const f of scopedFiles) {
      const p = path.join(projectRoot, f);
      if (fs.existsSync(p) && !allFiles.includes(p)) allFiles.push(p);
      const ext = path.extname(p);
      const base = p.slice(0, -ext.length);
      const testCandidates = [
        `${base}.test${ext}`,
        `${base}.spec${ext}`,
        path.join(path.dirname(p), '__tests__', path.basename(p)),
      ];
      for (const tc of testCandidates) {
        if (fs.existsSync(tc) && !allFiles.includes(tc)) {
          allFiles.push(tc);
        }
      }
    }
  } else {
    walkDir(projectRoot, (f) => {
      if (f.endsWith('.ts') || f.endsWith('.js')) {
        allFiles.push(f);
      }
    });
  }

  const testFiles = allFiles.filter(f => 
    f.includes('.test.') || f.includes('.spec.') || 
    f.includes('/tests/') || f.includes('/test/') || 
    f.includes('/__tests__/') || f.includes('/spec/')
  );

  const sourceFiles = allFiles.filter(f => !testFiles.includes(f));
  
  const testImports = new Set<string>();
  for (const tf of testFiles) {
    try {
      const content = fs.readFileSync(tf, 'utf8');
      const importRegex = /import.*from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.')) {
          const resolved = path.resolve(path.dirname(tf), importPath);
          testImports.add(resolved);
        }
      }
    } catch (e) {}
  }

  const gaps = [];
  for (const sf of sourceFiles) {
    const rel = path.relative(projectRoot, sf);
    let isCovered = false;
    for (const ti of testImports) {
      if (sf.startsWith(ti)) {
        isCovered = true;
        break;
      }
    }
    
    if (!isCovered) {
      const churnCount = churn[rel] || 0;
      let riskLevel = 'low';
      if (churnCount >= 5) riskLevel = 'critical';
      else if (churnCount >= 2) riskLevel = 'high';
      else if (churnCount >= 1) riskLevel = 'medium';
      
      gaps.push({
        file: rel,
        exportedSymbols: [], // Simple mock
        gitChurnScore: churnCount,
        riskLevel
      });
    }
  }

  gaps.sort((a, b) => b.gitChurnScore - a.gitChurnScore);
  
  if (scopedFiles && scopedFiles.length > 0) {
    return { status: 'ok', entries: gaps };
  }
  
  fs.writeFileSync(outFile, JSON.stringify(gaps, null, 2));
  return { status: 'ok' };
}
