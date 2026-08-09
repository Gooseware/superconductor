import fs from 'node:fs';
import { execSync } from 'node:child_process';

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

function findWtBinary(): string {
  try {
    return execSync('which wt', { encoding: 'utf8' }).trim();
  } catch {
    return '/home/gooseware/.cargo/bin/wt';
  }
}

export class WorktreeIsolationManager {
  private allocations = new Map<string, string>(); // agentId -> branchName

  private sigintHandler = (): void => {
    void this.releaseAll();
  };

  private sigtermHandler = (): void => {
    void this.releaseAll();
  };

  constructor(
    private shell: ShellRunner,
    private wtBinary = findWtBinary()
  ) {
    this.verifyWt();
    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);
  }

  private verifyWt(): void {
    if (!fs.existsSync(this.wtBinary)) {
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
    await this.shell.exec(`${this.wtBinary} switch --create ${branch}`);
    this.allocations.set(agentId, branch);
    return branch;
  }

  async release(agentId: string): Promise<void> {
    const branch = this.allocations.get(agentId);
    if (!branch) return;
    await this.shell.exec(`${this.wtBinary} remove ${branch}`);
    this.allocations.delete(agentId);
  }

  async releaseAll(): Promise<void> {
    const agentIds = Array.from(this.allocations.keys());
    for (const agentId of agentIds) {
      await this.release(agentId);
    }
  }

  getWorktreePath(agentId: string): string | undefined {
    const branch = this.allocations.get(agentId);
    if (!branch) return undefined;
    return `.worktrees/${branch}`;
  }

  destroy(): void {
    process.removeListener('SIGINT', this.sigintHandler);
    process.removeListener('SIGTERM', this.sigtermHandler);
  }
}
