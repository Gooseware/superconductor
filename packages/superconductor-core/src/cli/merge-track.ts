/**
 * Merge Track CLI
 * Enforces SwarmAuthorizer trailer + WorkspaceGuard.commitToMain() gate before merging a track branch to main.
 * 
 * Usage: node dist/cli/merge-track.js <trackBranch> <reviewerConvIds...>
 * Example: node dist/cli/merge-track.js track/my-track abc123 def456 ghi789 jkl012
 */
import { SwarmAuthorizer } from '../track/index.js';
import { WorkspaceGuard } from '../orchestration/workspace-guard.js';
import { execFileSync } from 'child_process';

export function validateBranchName(branch: string): void {
  if (!/^[a-zA-Z0-9_.\-\/]+$/.test(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }
}

export async function mergeTrack(
  trackBranch: string,
  reviewerConvIds: string[],
  opts: { workspaceRoot?: string; dryRun?: boolean; trackId?: string; sessionId?: string } = {},
): Promise<{ mergeCommitSha: string; trailer: string }> {
  validateBranchName(trackBranch);

  const workspaceRoot = opts.workspaceRoot ?? process.cwd();
  const guard = new WorkspaceGuard({ workspaceRoot });

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
    return { mergeCommitSha: 'dry-run', trailer };
  }

  // Execute the merge
  const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  if (currentBranch !== 'main') {
    execFileSync('git', ['checkout', 'main'], { stdio: 'inherit' });
  }

  const mergeMessage = [
    `feat(superconductor): Merge ${trackBranch} into main`,
    '',
    trailer,
  ].join('\n');

  execFileSync('git', ['merge', '--no-ff', trackBranch, '-m', mergeMessage], { stdio: 'inherit' });
  const mergeCommitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

  return { mergeCommitSha, trailer };
}

