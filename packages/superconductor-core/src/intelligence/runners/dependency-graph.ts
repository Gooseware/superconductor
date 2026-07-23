import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function runDependencyGraph(projectRoot: string, outputDir: string, capability: any) {
  const outFile = path.join(outputDir, '02_dependencies.json');
  const fpFile = path.join(outputDir, '01_fingerprint.json');
  
  if (!fs.existsSync(fpFile) || !capability || capability.status === 'unavailable' || !capability.tool) {
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }

  try {
    const fp = JSON.parse(fs.readFileSync(fpFile, 'utf8'));
    if (!fp || !fp.primaryLanguage) {
      fs.writeFileSync(outFile, JSON.stringify(null));
      return { status: 'degraded' };
    }

    const lang = fp.primaryLanguage.toLowerCase();
    let result = { nodes: [], edges: [], circularDeps: [] };

    if (lang === 'typescript' || lang === 'javascript') {
      // Target source dirs only — exclude node_modules/dist to avoid noise
      const candidates = ['packages/superconductor-core/src', 'packages/superconductor-mcp-server/src', 'scripts'];
      const srcDirs = candidates.filter(d => fs.existsSync(path.join(projectRoot, d))).join(' ');
      const target = srcDirs || 'src';
      // Use local depcruise binary so it has access to project's TypeScript transpiler
      const localBin = path.join(projectRoot, 'node_modules', '.bin', 'depcruise');
      const depBin = fs.existsSync(localBin) ? localBin : 'npx depcruise';
      const out = execSync(
        `${depBin} ${target} --no-config --exclude "node_modules|dist|\\.test\\." -T json`,
        { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      const data = JSON.parse(out);
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
      fs.writeFileSync(outFile, JSON.stringify(null));
      return { status: 'degraded' };
    }
    
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    return { status: 'ok' };
  } catch (e) {
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }
}
