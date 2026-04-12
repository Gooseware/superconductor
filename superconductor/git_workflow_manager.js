export class GitWorkflowManager {
  constructor(exec = null) {
    this.exec = exec;
  }

  createBranchFromMain(trackId) {
    const mainExists = this.exec('git branch --list main');
    if (!mainExists || !mainExists.includes('main')) {
      throw new Error("Target base branch 'main' does not exist.");
    }
    this.exec('git checkout main');
    this.exec('git pull origin main');
    this.exec(`git checkout -b track/${trackId}`);
  }

  mergeToTarget(targetBranch, sourceBranch) {
    this.exec(`git checkout ${targetBranch}`);
    this.exec(`git pull origin ${targetBranch}`);
    this.exec(`git merge ${sourceBranch}`);
    this.exec(`git push origin ${targetBranch}`);
    this.exec(`git branch -d ${sourceBranch}`);
  }
}
