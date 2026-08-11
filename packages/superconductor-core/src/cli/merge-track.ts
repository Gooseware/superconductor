/**
 * Merge Track CLI
 * Enforces SwarmAuthorizer trailer + WorkspaceGuard.commitToMain() gate before merging a track branch to main.
 * 
 * Usage: node dist/cli/merge-track.js <trackBranch> <reviewerConvIds...>
 * Example: node dist/cli/merge-track.js track/my-track abc123 def456 ghi789 jkl012
 */
import { SwarmAuthorizer } from '../track/index.js';
import { WorkspaceGuard } from '../orchestration/workspace-guard.js';
import { execSync } from 'child_process';

export async function mergeTrack(
  trackBranch: string,
  reviewerConvIds: string[],
  opts: { workspaceRoot?: string; dryRun?: boolean } = {},
): Promise<{ mergeCommitSha: string; trailer: string }> {
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
  await guard.commitToMain({ trailerPresent });

  if (opts.dryRun) {
    return { mergeCommitSha: 'dry-run', trailer };
  }

  // Execute the merge
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  if (currentBranch !== 'main') {
    execSync('git checkout main', { stdio: 'inherit' });
  }

  const mergeMessage = [
    `feat(superconductor): Merge ${trackBranch} into main`,
    '',
    trailer,
  ].join('\n');

  execSync(`git merge --no-ff ${trackBranch} -m ${JSON.stringify(mergeMessage)}`, { stdio: 'inherit' });
  const mergeCommitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

  return { mergeCommitSha, trailer };
}
