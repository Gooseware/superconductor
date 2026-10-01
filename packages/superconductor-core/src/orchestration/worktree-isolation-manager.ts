import fs from 'node:fs';
import path from 'node:path';
import * as child_process from 'node:child_process';
import { parse } from 'smol-toml';

export class WorktreeAlreadyAllocatedError extends Error {
  constructor(agentId: string) {
    super(`Worktree already allocated for agent: ${agentId}`);
    this.name = 'WorktreeAlreadyAllocatedError';
  }
}

export class WorktrunkNotInstalledError extends Error {
  constructor(path: string) {
    super(
      `Worktrunk binary (wt) not found at ${path}. Please run scripts/install-worktrunk.sh to install worktrunk.`
    );
    this.name = 'WorktrunkNotInstalledError';
  }
}

export class InvalidAgentIdError extends Error {
  constructor(id: string) {
    super(`Invalid agent or track ID: ${id}`);
    this.name = 'InvalidAgentIdError';
  }
}

export interface ShellRunner {
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode?: number } | string>;
}

export interface WorktreeIsolationManagerOptions {
  skipBinaryCheck?: boolean;
  execSync?: (command: string, options?: any) => string | Buffer;
}

export function findWtBinary(): string {
  try {
    return child_process.execSync('which wt', { encoding: 'utf8' }).trim();
  } catch {
    return '/home/gooseware/.cargo/bin/wt';
  }
}

export class WorktreeIsolationManager {
  private allocations = new Map<string, string>(); // agentId -> branchName
  private wtBinary: string;
  private isCustomBinary: boolean;
  private options?: WorktreeIsolationManagerOptions;
  private execSyncFn: (command: string, options?: any) => string | Buffer;

  private sigintHandler = (): void => {
    void this.releaseAll();
  };

  private sigtermHandler = (): void => {
    void this.releaseAll();
  };

  constructor(
    private shell: ShellRunner,
    wtBinaryOrOptions?: string | WorktreeIsolationManagerOptions,
    options?: WorktreeIsolationManagerOptions
  ) {
    let customBinary: string | undefined;
    let opts: WorktreeIsolationManagerOptions | undefined;

    if (typeof wtBinaryOrOptions === 'string') {
      customBinary = wtBinaryOrOptions;
      opts = options;
    } else if (wtBinaryOrOptions && typeof wtBinaryOrOptions === 'object') {
      opts = wtBinaryOrOptions;
    }

    this.isCustomBinary = customBinary !== undefined;
    this.wtBinary = customBinary ?? findWtBinary();
    this.options = opts;
    this.execSyncFn = opts?.execSync ?? child_process.execSync;

    this.verifyWt();
    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);
  }

  private verifyWt(): void {
    if (this.options?.skipBinaryCheck) {
      return;
    }
    if (!fs.existsSync(this.wtBinary)) {
      if (process.env.NODE_ENV === 'test' && !this.isCustomBinary) {
        return;
      }
      console.error(
        `Worktrunk binary not found at ${this.wtBinary}. Run scripts/install-worktrunk.sh to install.`
      );
      throw new WorktrunkNotInstalledError(this.wtBinary);
    }
  }

  private sanitizeBranchName(input: string): string {
    const sanitized = input.replace(/[^a-zA-Z0-9/_-]/g, '');
    if (!sanitized || sanitized !== input) {
      throw new InvalidAgentIdError(input);
    }
    return sanitized;
  }

  async allocate(agentId: string, trackId: string): Promise<string> {
    if (this.allocations.has(agentId)) {
      throw new WorktreeAlreadyAllocatedError(agentId);
    }
    const safeAgentId = this.sanitizeBranchName(agentId);
    const safeTrackId = this.sanitizeBranchName(trackId);
    const branch = `wt/${safeAgentId}-${safeTrackId}`;
    await this.shell.exec(`"${this.wtBinary}" switch --create ${branch}`);
    this.allocations.set(agentId, branch);

    const worktreeDir = this.getWorktreePath(agentId);
    if (worktreeDir) {
      const targetNodeModules = path.join(worktreeDir, 'node_modules');
      const rootNodeModulesDir = path.join(process.cwd(), 'node_modules');
      if (!fs.existsSync(targetNodeModules) && fs.existsSync(rootNodeModulesDir)) {
        const rootNodeModules = path.relative(worktreeDir, rootNodeModulesDir);
        try {
          fs.symlinkSync(rootNodeModules, targetNodeModules, 'junction');
        } catch {
          // If worktree directory doesn't exist on disk (e.g. in mocked test environments), ignore
        }
      }
    }

    return branch;
  }

  async release(agentId: string): Promise<void> {
    const branch = this.allocations.get(agentId);
    if (!branch) return;
    await this.shell.exec(`"${this.wtBinary}" remove ${branch}`);
    this.allocations.delete(agentId);
  }

  async releaseAll(): Promise<void> {
    const agentIds = Array.from(this.allocations.keys());
    for (const agentId of agentIds) {
      await this.release(agentId);
    }
  }

  private resolveConfigWorktreePath(branch: string): string | undefined {
    try {
      const configPath = path.join(process.cwd(), '.config', 'wt.toml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        let template: string | undefined;
        try {
          const parsed = parse(content) as Record<string, any>;
          if (typeof parsed['worktree-path'] === 'string') {
            template = parsed['worktree-path'];
          }
        } catch {
          const match = content.match(/worktree-path\s*=\s*["']([^"']+)["']/);
          if (match && match[1]) {
            template = match[1];
          }
        }

        if (template) {
          const sanitizedBranch = branch.replace(/\//g, '-');
          return template
            .replace(/\{\{\s*repo_path\s*\}\}/g, process.cwd())
            .replace(/\{\{\s*branch\s*\|\s*sanitize\s*\}\}/g, sanitizedBranch)
            .replace(/\{\{\s*branch\s*\}\}/g, branch);
        }
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  getWorktreePath(agentId: string): string | undefined {
    const branch = this.allocations.get(agentId);
    if (!branch) return undefined;

    try {
      const rawOutput = this.execSyncFn(`"${this.wtBinary}" list --format=json`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, PAGER: 'cat' },
      });
      const output = typeof rawOutput === 'string' ? rawOutput : rawOutput.toString('utf8');

      const jsonStart = output.indexOf('{');
      const jsonEnd = output.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1));
        if (Array.isArray(parsed?.items)) {
          const match = parsed.items.find((item: any) => item.branch === branch);
          if (match?.worktree?.path) {
            return match.worktree.path;
          }
        }
      }
    } catch {
      // Query failed or wt list not available; fall through to canonical path
    }

    const configResolved = this.resolveConfigWorktreePath(branch);
    if (configResolved) {
      return configResolved;
    }

    return path.join(process.cwd(), '.worktrees', branch);
  }

  destroy(): void {
    process.removeListener('SIGINT', this.sigintHandler);
    process.removeListener('SIGTERM', this.sigtermHandler);
  }
}
