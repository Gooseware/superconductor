import * as fs from 'fs';
import * as path from 'path';
import { RunnerResult } from './types.js';
import { LanguageProfile } from '../utils/language-profile.js';

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

export function runTestGaps(projectRoot: string, outputDir: string, scopedFiles?: string[]): RunnerResult<any> {
  const outFile = path.join(outputDir, '07_test_gaps.json');
  const couplingFile = path.join(outputDir, '04_coupling.json');
  const profile = LanguageProfile.fromFingerprint(outputDir);
  
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
      const dir = path.dirname(p);
      const filename = path.basename(p);
      const testCandidates = [
        `${base}.test${ext}`,
        `${base}.spec${ext}`,
        path.join(dir, '__tests__', filename),
        `${base}_test${ext}`,
        path.join(dir, `test_${filename}`),
      ];
      for (const tc of testCandidates) {
        if (fs.existsSync(tc) && !allFiles.includes(tc)) {
          allFiles.push(tc);
        }
      }
    }
  } else {
    walkDir(projectRoot, (f) => {
      if (profile.fileExtensions.some(ext => f.endsWith(ext))) {
        allFiles.push(f);
      }
    });
  }

  const testFiles = allFiles.filter(f => {
    const rel = path.relative(projectRoot, f);
    return profile.testFilePattern.test(f) || profile.testFilePattern.test(rel);
  });

  const sourceFiles = allFiles.filter(f => !testFiles.includes(f));
  
  const testImports = new Set<string>();
  for (const tf of testFiles) {
    try {
      const content = fs.readFileSync(tf, 'utf8');
      if (profile.primaryLanguage === 'Python') {
        const pyRegex = /(?:from\s+([a-zA-Z0-9_.]+)\s+import|import\s+([a-zA-Z0-9_.]+))/g;
        let match;
        while ((match = pyRegex.exec(content)) !== null) {
          const mod = (match[1] || match[2] || '').replace(/\./g, path.sep);
          if (mod) testImports.add(mod);
        }
      } else {
        const importRegex = /import.*from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1];
          if (importPath.startsWith('.')) {
            const resolved = path.resolve(path.dirname(tf), importPath);
            testImports.add(resolved);
          }
        }
      }
    } catch (e) {}
  }

  const gaps = [];
  for (const sf of sourceFiles) {
    const rel = path.relative(projectRoot, sf);
    const baseNameWithoutExt = path.basename(sf, path.extname(sf));
    let isCovered = false;

    for (const ti of testImports) {
      if (sf.startsWith(ti) || rel.startsWith(ti) || rel.includes(ti) || baseNameWithoutExt === ti) {
        isCovered = true;
        break;
      }
    }

    if (!isCovered && profile.primaryLanguage === 'Go') {
      const siblingTest = path.join(path.dirname(sf), `${baseNameWithoutExt}_test.go`);
      if (testFiles.includes(siblingTest)) {
        isCovered = true;
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
  return { status: 'ok', entries: null };
}
