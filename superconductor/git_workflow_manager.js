/**
 * Manages high-level Git operations for track lifecycle.
 */
export class GitWorkflowManager {
  /**
   * @param {function(string): string} exec - Command execution function.
   */
  constructor(exec = null) {
    this.exec = exec;
  }

  /**
   * Ensures the track branch exists and is derived from main.
   * @param {string} trackId - Unique identifier for the track.
   */
  createBranchFromMain(trackId) {
    const mainExists = this.exec('git branch --list main');
    if (!mainExists || !mainExists.includes('main')) {
      throw new Error("Target base branch 'main' does not exist.");
    }
    this.exec('git checkout main');
    this.exec('git pull origin main');
    this.exec(`git checkout -b track/${trackId}`);
  }

  /**
   * Merges the source branch into the target and cleans up.
   * @param {string} targetBranch - The branch to merge into.
   * @param {string} sourceBranch - The branch to merge from.
   */
  mergeToTarget(targetBranch, sourceBranch) {
    this.exec(`git checkout ${targetBranch}`);
    this.exec(`git pull origin ${targetBranch}`);
    this.exec(`git merge ${sourceBranch}`);
    this.exec(`git push origin ${targetBranch}`);
    this.exec(`git branch -d ${sourceBranch}`);
    this.exec(`git push origin --delete ${sourceBranch}`);
  }
}
