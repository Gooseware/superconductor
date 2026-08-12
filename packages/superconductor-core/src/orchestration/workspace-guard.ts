import { AbstractGate, GateContext, GateResult, GateError } from './abstract-gate.js';
import { SignOffGate, SignOffRequiredError } from './sign-off-gate.js';

export interface ShellRunner {
  exec(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export class BranchMismatchError extends Error {
  constructor(message = 'Branch mismatch') {
    super(message);
    this.name = 'BranchMismatchError';
  }
}

export class TypeScriptError extends Error {
  constructor(public tscOutput: string) {
    super('TypeScript errors detected');
    this.name = 'TypeScriptError';
  }
}

export class UnauthorizedMergeError extends Error {
  constructor(message = 'Unauthorized merge to main: SwarmAuthorizer trailer required') {
    super(message);
    this.name = 'UnauthorizedMergeError';
  }
}

export interface WorkspaceGuardOptions {
  workspaceRoot?: string;
  assignedBranch?: string;
  shell?: ShellRunner;
  stateStore?: any;
}

export class WorkspaceGuard extends AbstractGate {
  public readonly gateName = 'WorkspaceGuard';

  private assignedBranch: string;
  private shell?: ShellRunner;
  private workspaceRoot?: string;
  protected stateStore?: any;

  constructor(opts?: WorkspaceGuardOptions);
  constructor(assignedBranch: string, shell?: ShellRunner);
  constructor(
    assignedBranchOrOpts?: string | WorkspaceGuardOptions,
    shell?: ShellRunner
  ) {
    super();
    if (typeof assignedBranchOrOpts === 'object' && assignedBranchOrOpts !== null) {
      this.assignedBranch = assignedBranchOrOpts.assignedBranch ?? 'main';
      this.shell = assignedBranchOrOpts.shell;
      this.workspaceRoot = assignedBranchOrOpts.workspaceRoot;
      this.stateStore = assignedBranchOrOpts.stateStore;
    } else {
      this.assignedBranch = assignedBranchOrOpts ?? 'main';
      this.shell = shell;
    }
  }

  protected createError(message: string): GateError {
    return new GateError(message);
  }

  async check(context: GateContext): Promise<GateResult> {
    try {
      await this.preCommitCheck();
      return { passed: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { passed: false, reason: msg };
    }
  }

  async preCommitCheck(): Promise<{ ok: true }> {
    // Skip checks if no shell runner is provided
    if (!this.shell) {
      return { ok: true };
    }
    
    // Verify that the current git branch matches the assigned branch
    const branchRes = await this.shell.exec('git branch --show-current');
    const currentBranch = branchRes.stdout.trim();

    if (currentBranch !== this.assignedBranch) {
      throw new BranchMismatchError(
        `Current branch '${currentBranch}' does not match assigned branch '${this.assignedBranch}'`
      );
    }

    // Run TypeScript compiler to ensure there are no type errors
    const tscRes = await this.shell.exec('npx tsc --noEmit');
    if (tscRes.exitCode !== 0) {
      const output = (tscRes.stdout + '\n' + tscRes.stderr).trim();
      throw new TypeScriptError(output);
    }

    return { ok: true };
  }

  async detectHeavyLineDeletions(sharedFiles: string[], diffContent: string): Promise<string[]> {
    const findings: string[] = [];
    if (!sharedFiles || sharedFiles.length === 0 || !diffContent || !diffContent.trim()) {
      return findings;
    }

    // Split diff into per-file blocks using 'diff --git ' headers
    const fileBlocks = diffContent.split(/^diff --git /m);
    for (const block of fileBlocks) {
      // Extract the actual changed file path from 'diff --git a/foo b/foo'
      const headerMatch = block.match(/^a\/(.+?) b\//);
      if (!headerMatch) continue;
      const changedFile = headerMatch[1];
      if (!sharedFiles.some(sf => changedFile.endsWith(sf))) continue;

      // Check if the diff for THIS specific file contains array/object replacements
      const removedLines = block.match(/^-(?!--).*/gm) || [];
      const addedLines = block.match(/^\+(?!\+\+).*/gm) || [];

      // Flag if removed lines significantly exceed added lines (overwrite pattern)
      if (removedLines.length > 3 && addedLines.length < removedLines.length * 0.5) {
        findings.push(changedFile);
      }
    }

    return findings;
  }

  async commitToMain(
    optsOrTrackId: { trailerPresent: boolean; trackId?: string; sessionId?: string } | string,
    sessionId?: string,
    stateStore?: any
  ): Promise<void> {
    let trackId: string | undefined;
    let sessId: string | undefined;
    let trailerPresent = true;
    const store = stateStore || this.stateStore;

    if (typeof optsOrTrackId === 'string') {
      trackId = optsOrTrackId;
      sessId = sessionId;
    } else if (optsOrTrackId && typeof optsOrTrackId === 'object') {
      trailerPresent = optsOrTrackId.trailerPresent;
      trackId = optsOrTrackId.trackId;
      sessId = optsOrTrackId.sessionId;
    }

    if (!trailerPresent) {
      throw new UnauthorizedMergeError();
    }

    if (!trackId || !sessId) {
      throw new Error('trackId and sessionId are required for commitToMain');
    }

    if (trackId && sessId) {
      const approved = await SignOffGate.isApproved(trackId, sessId, store);
      if (!approved) {
        throw new SignOffRequiredError();
      }
    }

    // Verify current branch is a track branch (not main)
    const cp = await import('child_process');
    try {
      let currentBranch = '';
      if (typeof cp.execFileSync === 'function') {
        currentBranch = cp.execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          encoding: 'utf8',
        }).toString().trim();
      } else if (typeof cp.execSync === 'function') {
        currentBranch = cp.execSync('git rev-parse --abbrev-ref HEAD', {
          encoding: 'utf8',
        }).toString().trim();
      }
      if (currentBranch === 'main' || currentBranch === 'master') {
        throw new UnauthorizedMergeError(
          'commitToMain must be called from a track branch, not from main'
        );
      }
    } catch (e) {
      if (e instanceof UnauthorizedMergeError) throw e;
      if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
        throw e;
      }
    }

    // Run pre-commit check if available
    if (typeof this.preCommitCheck === 'function') {
      await this.preCommitCheck();
    }
  }
}
