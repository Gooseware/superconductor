/**
 * Merge Track CLI
 * Enforces SwarmAuthorizer trailer + WorkspaceGuard.commitToMain() gate before merging a track branch to the target branch.
 * 
 * Usage: npx superconductor merge-track <trackBranch> <reviewerConvIds...> [--target=<branch>]
 * Example: npx superconductor merge-track track/my-track abc123 def456 ghi789 jkl012 --target=dev
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SwarmAuthorizer } from '../track/index.js';
import { WorkspaceGuard } from '../orchestration/workspace-guard.js';

export interface MergeTrackOptions {
  workspaceRoot?: string;
  dryRun?: boolean;
  trackId?: string;
  sessionId?: string;
  targetBranch?: string;
  oracleVerdict?: string;
  skipCleanCheck?: boolean;
}

export interface MergeTrackResult {
  mergeCommitSha: string;
  trailer: string;
  targetBranch: string;
}

export function validateBranchName(branch: string): void {
  if (!/^[a-zA-Z0-9_.\-\/]+$/.test(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }
}

/**
 * Resolves the target branch from superconductor/tech-stack.md, falling back to overrideBranch or 'main'.
 */
export function resolveTargetBranch(projectRoot?: string, overrideBranch?: string): string {
  if (overrideBranch && overrideBranch.trim()) {
    return overrideBranch.trim();
  }
  const root = projectRoot || process.cwd();
  const techStackPaths = [
    path.join(root, 'superconductor', 'tech-stack.md'),
    path.join(root, 'tech-stack.md'),
  ];
  for (const p of techStackPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      const match = content.match(/Target Branch:\*{0,2}\s*`?([a-zA-Z0-9_.\-\/]+)`?/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }
  return 'main';
}

/**
 * Verifies that the git working directory has no uncommitted changes.
 */
export function verifyWorkingTreeClean(workspaceRoot?: string): void {
  const root = workspaceRoot || process.cwd();
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
  if (status.length > 0) {
    throw new Error(`Working directory is not clean. Please commit or stash changes before merging.\n${status}`);
  }
}

export async function mergeTrack(
  trackBranch: string,
  reviewerConvIds: string[],
  opts: MergeTrackOptions = {},
): Promise<MergeTrackResult> {
  validateBranchName(trackBranch);

  const workspaceRoot = opts.workspaceRoot ?? process.cwd();
  const targetBranch = resolveTargetBranch(workspaceRoot, opts.targetBranch);
  validateBranchName(targetBranch);

  const guard = new WorkspaceGuard({ workspaceRoot, assignedBranch: targetBranch });

  // Generate authorization trailer
  let trailer = '';
  let trailerPresent = false;
  try {
    trailer = SwarmAuthorizer.generateTrailer(reviewerConvIds);
    trailerPresent = SwarmAuthorizer.validateTrailer(`placeholder\n\n${trailer}`);
  } catch {
    trailerPresent = false;
  }

  // Gate: throws UnauthorizedMergeError if trailer is missing
  await guard.commitToMain({ trailerPresent, trackId: opts.trackId, sessionId: opts.sessionId });

  if (opts.dryRun) {
    return { mergeCommitSha: 'dry-run', trailer, targetBranch };
  }

  if (!opts.skipCleanCheck) {
    verifyWorkingTreeClean(workspaceRoot);
  }

  // Execute the merge
  const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
  if (currentBranch !== targetBranch) {
    execFileSync('git', ['checkout', targetBranch], { cwd: workspaceRoot, stdio: 'inherit' });
  }

  const mergeMessageParts = [
    `feat(superconductor): Merge ${trackBranch} into ${targetBranch}`,
    '',
    trailer,
  ];
  if (opts.oracleVerdict) {
    mergeMessageParts.push(`Oracle-Verdict: ${opts.oracleVerdict}`);
  }
  const mergeMessage = mergeMessageParts.join('\n');

  execFileSync('git', ['merge', '--no-ff', trackBranch, '-m', mergeMessage], { cwd: workspaceRoot, stdio: 'inherit' });
  const mergeCommitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();

  return { mergeCommitSha, trailer, targetBranch };
}
