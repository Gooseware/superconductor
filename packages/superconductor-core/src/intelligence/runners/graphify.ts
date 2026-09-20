import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import * as os from 'os';

// Safe file validation
function isSafePath(filePath: string, workspaceRoot: string): boolean {
    const absolute = path.resolve(workspaceRoot, filePath);
    if (!absolute.startsWith(path.resolve(workspaceRoot) + path.sep)) return false;
    try {
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) return false;
        return true;
    } catch { return false; }
}

function findGraphifyBinary(toolName: string, projectRoot: string): string | null {
    const binName = path.basename(toolName);
    const safePaths = [
        path.join(projectRoot, 'node_modules', '.bin'),
        path.join(os.homedir(), '.npm-global', 'bin'),
        '/usr/local/bin',
        '/usr/bin'
    ];
    if (process.env.PATH) {
        for (const p of process.env.PATH.split(path.delimiter)) {
            if (p === '' || p === '.' || p.startsWith('/tmp') || p.startsWith('/var/tmp')) continue;
            safePaths.push(p);
        }
    }
    for (const sp of safePaths) {
        const p = path.join(sp, binName);
        try {
            const stat = fs.lstatSync(p);
            if (!stat.isSymbolicLink() && (stat.mode & 0o111)) return p;
        } catch { /* not found */ }
    }
    return null;
}

export function runGraphify(projectRoot: string, outputDir: string, capability: any) {
  const outFile = path.join(outputDir, '09_graphify_graph.json');

  if (!capability || capability.status === 'unavailable' || !capability.tool) {
    console.warn('[Intelligence] graphify not installed — skipping Leiden domain partition (graceful degradation).');
    return { status: 'degraded' };
  }

  const binary = findGraphifyBinary(capability.tool, projectRoot);
  if (!binary) {
    console.warn('[Intelligence] graphify binary not found — skipping graph update, preserving existing graph');
    return { status: 'degraded' };
  }

  try {
    const currentPath = process.env.PATH || '';
    const fallbackPaths = ['/usr/local/bin', '/usr/bin', '/bin'];
    const pathParts = currentPath ? currentPath.split(path.delimiter) : [];
    for (const p of fallbackPaths) {
      if (!pathParts.includes(p)) {
        pathParts.push(p);
      }
    }
    const combinedPath = pathParts.join(path.delimiter);

    execFileSync(binary, ['--', '.'], {
      cwd: projectRoot,
      stdio: 'pipe',
      env: {
        ...process.env,
        PATH: combinedPath,
      },
    });
  } catch (e: any) {
    const stdout = e.stdout ? e.stdout.toString() : '';
    const stderr = e.stderr ? e.stderr.toString() : '';
    throw new Error(`[Intelligence] graphify failed: ${e.message}\nStdout: ${stdout}\nStderr: ${stderr}`);
  }

  const graphifyOut = path.join(projectRoot, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graphifyOut)) {
    throw new Error(
      '[Intelligence] graphify exited 0 but graphify-out/graph.json was not produced. ' +
      'Check graphify version and output directory configuration.'
    );
  }

  if (!isSafePath(graphifyOut, projectRoot)) {
    throw new Error('Unsafe graphify output path');
  }

  let fd;
  try {
    fd = fs.openSync(graphifyOut, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (stat.nlink > 1) {
      throw new Error("Hardlink detected");
    }
    const data = JSON.parse(fs.readFileSync(fd, 'utf8'));
    
    const tmpDir = fs.mkdtempSync(path.join(path.dirname(outFile), '.tmp-'));
    const tmpOut = path.join(tmpDir, 'graph.json');
    fs.writeFileSync(tmpOut, JSON.stringify(data));
    fs.renameSync(tmpOut, outFile);
    fs.rmdirSync(tmpDir);
    
    return { status: 'ok' };
  } catch (e: any) {
    throw new Error(
      `[Intelligence] Failed to parse graphify output: ${e.message}. ` +
      'Ensure the graphify tool is generating valid JSON.'
    );
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (e) {}
    }
  }
}
