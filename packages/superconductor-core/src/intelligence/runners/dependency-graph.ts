import { execSync, spawnSync } from 'child_process';
import { RunnerResult } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import { LanguageProfile } from '../utils/language-profile.js';

export function runDependencyGraph(projectRoot: string, outputDir: string, capability: any, scopedFiles?: string[]): RunnerResult<any> {
  const outFile = path.join(outputDir, '02_dependency_graph.json');
  
  if (!capability || capability.status === 'unavailable' || !capability.tool) {
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: null };
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded', entries: null };
  }

  try {
    const profile = LanguageProfile.fromFingerprint(outputDir);
    const lang = profile.primaryLanguage.toLowerCase();
    let result: any = { nodes: [], edges: [], circularDeps: [] };

    if (lang === 'typescript' || lang === 'javascript') {
      let data: any;
      if (scopedFiles && scopedFiles.length > 0) {
        const validFiles = scopedFiles
          .map(f => path.resolve(projectRoot, f))
          .filter(absPath => {
            if (!absPath.startsWith(path.resolve(projectRoot))) return false;
            return fs.existsSync(absPath);
          });
        
        if (validFiles.length === 0) return { status: 'degraded', entries: null };
        
        const localBin = path.join(projectRoot, 'node_modules', '.bin', 'depcruise');
        const depBin = fs.existsSync(localBin) ? localBin : 'depcruise';

        const runResult = spawnSync(depBin,
          [...validFiles, '--no-config', '--exclude', 'node_modules|dist|\\.test\\.', '-T', 'json'],
          { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );
        data = JSON.parse(runResult.stdout || '{}');
      } else {
        const candidateDirs: string[] = [];

        // 1. Candidate roots from profile.sourceGlobs
        for (const glob of profile.sourceGlobs) {
          const rootDir = glob.split('/')[0];
          if (rootDir && !rootDir.includes('*')) {
            candidateDirs.push(rootDir);
          }
        }

        // 2. Standard candidate directories
        candidateDirs.push('src', 'lib', 'scripts');

        // 3. Monorepo packages: discover all packages/*/src or packages/*
        const packagesDir = path.join(projectRoot, 'packages');
        if (fs.existsSync(packagesDir)) {
          try {
            const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const pkgSrc = path.join('packages', entry.name, 'src');
                if (fs.existsSync(path.join(projectRoot, pkgSrc))) {
                  candidateDirs.push(pkgSrc);
                } else if (fs.existsSync(path.join(projectRoot, 'packages', entry.name))) {
                  candidateDirs.push(path.join('packages', entry.name));
                }
              }
            }
          } catch {}
        }

        const existingDirs = Array.from(new Set(
          candidateDirs.filter(d => fs.existsSync(path.join(projectRoot, d)))
        ));

        if (existingDirs.length === 0) {
          existingDirs.push('src');
        }

        const localBin = path.join(projectRoot, 'node_modules', '.bin', 'depcruise');
        const depBin = fs.existsSync(localBin) ? localBin : 'depcruise';
        const runResult = spawnSync(depBin,
          [...existingDirs, '--no-config', '--exclude', 'node_modules|dist|\\.test\\.', '-T', 'json'],
          { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );
        data = JSON.parse(runResult.stdout || '{}');
      }
      result.nodes = (data.modules || []).map((m: any) => ({
        source: m.source,
        deps: (m.dependencies || []).map((d: any) => d.resolved)
      }));
      result.circularDeps = (data.summary?.violations || [])
        .filter((v: any) => v.rule?.name === 'no-circular')
        .map((v: any) => v.from);
    } else if (lang === 'python') {
      const out = execSync(`deptry . --json-output`, { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      // process output
    } else {
      if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: null };
      fs.writeFileSync(outFile, JSON.stringify(null));
      return { status: 'degraded', entries: null };
    }
    
    if (scopedFiles && scopedFiles.length > 0) {
      return { status: 'ok', entries: result };
    }
    
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    return { status: 'ok', entries: null };
  } catch (e) {
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: null };
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded', entries: null };
  }
}
