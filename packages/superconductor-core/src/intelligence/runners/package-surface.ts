import * as fs from 'fs';
import * as path from 'path';
import { RunnerResult } from './types.js';

interface PackageUsage {
  version: string;
  usedApis: string[];
  importedBy: string[];
  isNodeBuiltin: boolean;
}

// Node.js built-in module names (subset of most common)
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dns', 'events',
  'fs', 'fs/promises', 'http', 'https', 'net', 'os', 'path', 'perf_hooks',
  'process', 'querystring', 'readline', 'stream', 'string_decoder', 'timers',
  'tls', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib'
]);

function normalizePackageName(raw: string): string {
  // Normalize 'node:path' -> 'path', 'node:fs' -> 'fs', etc.
  return raw.startsWith('node:') ? raw.slice(5) : raw;
}

const IMPORT_RE = /^\s*(?:import|export)\s+(?:(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))(?:\s*,\s*(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+)))?)\s+from\s+['"]([^'"./][^'"]*)['"]/gm;
const SIDE_EFFECT_RE = /^\s*import\s+['"]([^'"./][^'"]*)['"]/gm;

function collectSourceFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, results);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

function extractImportedApis(content: string): Map<string, string[]> {
  const pkgApis = new Map<string, string[]>();

  // Named/default/namespace imports
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const pkg = m[7];
    const namedA = m[1] || '';
    const namedB = m[4] || '';
    const named = `${namedA},${namedB}`.split(',')
      .map(s => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    const ns = [m[2], m[3], m[5], m[6]].filter(Boolean);
    const apis = [...named, ...ns];
    if (!pkgApis.has(pkg)) pkgApis.set(pkg, []);
    pkgApis.get(pkg)!.push(...apis);
  }

  // Side-effect imports: import 'pkg'
  SIDE_EFFECT_RE.lastIndex = 0;
  while ((m = SIDE_EFFECT_RE.exec(content)) !== null) {
    const pkg = m[1];
    if (!pkgApis.has(pkg)) pkgApis.set(pkg, []);
  }

  return pkgApis;
}

export function runPackageSurface(projectRoot: string, outputDir: string, scopedFiles?: string[]): RunnerResult<any> {
  const outFile = path.join(outputDir, '08_package_surface.json');

  try {
    // Read declared dependencies from all package.json files
    const declaredVersions: Record<string, string> = {};
    const pkgJsonPaths = [
      path.join(projectRoot, 'package.json'),
      ...fs.readdirSync(path.join(projectRoot, 'packages'))
          .map(d => path.join(projectRoot, 'packages', d, 'package.json'))
          .filter(p => fs.existsSync(p))
    ].filter(p => fs.existsSync(p));

    for (const pkgPath of pkgJsonPaths) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        for (const [name, ver] of Object.entries({
          ...pkg.dependencies || {},
          ...pkg.devDependencies || {},
          ...pkg.peerDependencies || {}
        })) {
          declaredVersions[name] = ver as string;
        }
      } catch (_e) {}
    }

    // Collect source files (not node_modules/dist)
    let sourceFiles: string[] = [];
    if (scopedFiles && scopedFiles.length > 0) {
      sourceFiles = scopedFiles.map(f => path.join(projectRoot, f)).filter(f => fs.existsSync(f));
    } else {
      const srcDirs = ['packages', 'scripts'].map(d => path.join(projectRoot, d));
      for (const d of srcDirs) collectSourceFiles(d, sourceFiles);
    }

    // Extract import surface
    const surface: Record<string, PackageUsage> = {};

    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const pkgApis = extractImportedApis(content);
        const relFile = file.replace(projectRoot + '/', '');

        for (const [rawPkg, apis] of pkgApis) {
          const pkg = normalizePackageName(rawPkg);
          if (!surface[pkg]) {
            surface[pkg] = {
              version: declaredVersions[pkg] || (NODE_BUILTINS.has(pkg) ? 'node-builtin' : 'unknown'),
              usedApis: [],
              importedBy: [],
              isNodeBuiltin: NODE_BUILTINS.has(pkg)
            };
          }
          // Merge unique APIs
          for (const api of apis) {
            if (api && !surface[pkg].usedApis.includes(api)) {
              surface[pkg].usedApis.push(api);
            }
          }
          if (!surface[pkg].importedBy.includes(relFile)) {
            surface[pkg].importedBy.push(relFile);
          }
        }
      } catch (_e) {}
    }

    // Sort: most-used packages first
    const sorted: Record<string, PackageUsage> = {};
    for (const key of Object.keys(surface).sort(
      (a, b) => surface[b].importedBy.length - surface[a].importedBy.length
    )) {
      sorted[key] = surface[key];
    }
    
    if (scopedFiles && scopedFiles.length > 0) {
      return { status: 'ok', entries: sorted };
    }

    fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2));

    const count = Object.keys(sorted).length;
    console.log(`\nPackage Surface: ${count} external packages used`);
    for (const [pkg, usage] of Object.entries(sorted).slice(0, 10)) {
      console.log(`  ${pkg}@${usage.version} — ${usage.usedApis.slice(0, 5).join(', ')} (${usage.importedBy.length} files)`);
    }

    return { status: 'ok', entries: null };
  } catch (e) {
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: [] };
    fs.writeFileSync(outFile, JSON.stringify({}));
    return { status: 'degraded', entries: null };
  }
}
