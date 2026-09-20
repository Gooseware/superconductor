import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { IntelligenceAuditReporter, type AuditReport } from '@superconductor/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type IntelligenceStatus = 'LIVE' | 'STALE' | 'NONE' | 'MISMATCH';
export type IntelligenceStatusResult = AuditReport;
export type { AuditReport };

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export class IntelligenceStatusService {
  async getStatus(outputDir: string, projectRoot?: string): Promise<AuditReport> {
    const normalizedOutputDir = safeRealpath(outputDir);
    let targetDir = normalizedOutputDir;

    if (
      !fs.existsSync(path.join(targetDir, '00_manifest.json')) &&
      !fs.existsSync(path.join(targetDir, 'superconductor', 'intelligence', '00_manifest.json')) &&
      fs.existsSync(path.join(targetDir, 'intelligence', '00_manifest.json'))
    ) {
      targetDir = path.join(targetDir, 'intelligence');
    }

    const effectiveProjectRoot = projectRoot ?? process.env.PROJECT_ROOT;
    const normalizedProjectRoot = effectiveProjectRoot ? safeRealpath(effectiveProjectRoot) : undefined;

    return IntelligenceAuditReporter.report(targetDir, normalizedProjectRoot);
  }

  async refresh(
    outputDir?: string,
    force?: boolean
  ): Promise<{ success: boolean; result: AuditReport; message?: string }> {
    const targetDir = outputDir
      ? safeRealpath(outputDir)
      : (process.env.PROJECT_ROOT ? safeRealpath(process.env.PROJECT_ROOT) : process.cwd());

    let executionCwd = targetDir;
    try {
      const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: targetDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (gitRoot) {
        executionCwd = safeRealpath(gitRoot);
      }
    } catch {
      // Not a git repo, use targetDir
    }

    try {
      const cliPath = this.resolveCliBinary();
      const tsCliPath = this.resolveTsCliBinary();

      const cliArgs = force ? ['intelligence', '--force'] : ['intelligence', '--refresh'];

      if (cliPath) {
        execFileSync('node', [cliPath, ...cliArgs], {
          cwd: executionCwd,
          encoding: 'utf8',
        });
      } else if (tsCliPath) {
        execFileSync('npx', ['tsx', tsCliPath, ...cliArgs], {
          cwd: executionCwd,
          encoding: 'utf8',
        });
      }
    } catch (err: any) {
      console.error(`[IntelligenceStatusService] Refresh execution error:`, err);
    }

    const updated = await this.getStatus(targetDir);
    return { success: true, result: updated };
  }

  private resolveCliBinary(): string | null {
    const candidates: string[] = [];

    // 1. Literal path from requirement specification:
    candidates.push(
      path.resolve(__dirname, '..', '..', 'superconductor-core', 'dist', 'cli', 'index.js')
    );

    // 2. Relative from services directory (3 levels up to packages):
    candidates.push(
      path.resolve(__dirname, '..', '..', '..', 'superconductor-core', 'dist', 'cli', 'index.js')
    );

    // 3. Fallback to process.env.SUPERCONDUCTOR_DIR:
    if (process.env.SUPERCONDUCTOR_DIR) {
      candidates.push(
        path.resolve(process.env.SUPERCONDUCTOR_DIR, 'packages', 'superconductor-core', 'dist', 'cli', 'index.js'),
        path.resolve(process.env.SUPERCONDUCTOR_DIR, 'superconductor-core', 'dist', 'cli', 'index.js'),
        path.resolve(process.env.SUPERCONDUCTOR_DIR, 'dist', 'cli', 'index.js')
      );
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private resolveTsCliBinary(): string | null {
    const candidates: string[] = [
      path.resolve(__dirname, '..', '..', 'superconductor-core', 'src', 'cli', 'index.ts'),
      path.resolve(__dirname, '..', '..', '..', 'superconductor-core', 'src', 'cli', 'index.ts'),
    ];

    if (process.env.SUPERCONDUCTOR_DIR) {
      candidates.push(
        path.resolve(process.env.SUPERCONDUCTOR_DIR, 'packages', 'superconductor-core', 'src', 'cli', 'index.ts'),
        path.resolve(process.env.SUPERCONDUCTOR_DIR, 'superconductor-core', 'src', 'cli', 'index.ts'),
        path.resolve(process.env.SUPERCONDUCTOR_DIR, 'src', 'cli', 'index.ts')
      );
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}
