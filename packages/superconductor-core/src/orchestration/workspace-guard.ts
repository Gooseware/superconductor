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

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class WorkspaceGuard {
  constructor(private assignedBranch: string, private shell: ShellRunner) {}

  async preCommitCheck(): Promise<{ ok: true }> {
    const branchRes = await this.shell.exec('git branch --show-current');
    const currentBranch = branchRes.stdout.trim();

    if (currentBranch !== this.assignedBranch) {
      throw new BranchMismatchError(
        `Current branch '${currentBranch}' does not match assigned branch '${this.assignedBranch}'`
      );
    }

    const tscRes = await this.shell.exec('npx tsc --noEmit');
    if (tscRes.exitCode !== 0) {
      const output = (tscRes.stdout + '\n' + tscRes.stderr).trim();
      throw new TypeScriptError(output);
    }

    return { ok: true };
  }

  async detectSharedSingletonOverwrite(sharedFiles: string[], diffContent: string): Promise<string[]> {
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

  async commitToMain(opts: { trailerPresent: boolean }): Promise<void> {
    if (!opts.trailerPresent) {
      throw new UnauthorizedMergeError();
    }
  }
}
