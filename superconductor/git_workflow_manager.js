import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves the target branch from superconductor/tech-stack.md, falling back to overrideBranch or 'main'.
 * @param {string} [projectRoot]
 * @param {string} [overrideBranch]
 * @returns {string}
 */
export function resolveTargetBranch(projectRoot = null, overrideBranch = null) {
  if (overrideBranch && typeof overrideBranch === 'string' && overrideBranch.trim()) {
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
 * Manages high-level Git operations for track lifecycle.
 */
export class GitWorkflowManager {
  /**
   * @param {function(string): string} exec - Command execution function.
   * @param {string} [projectRoot] - Project root directory.
   */
  constructor(exec = null, projectRoot = null) {
    this.exec = exec;
    this.projectRoot = projectRoot;
  }

  /**
   * Resolves the target branch for this workflow manager.
   * @param {string} [overrideBranch]
   * @returns {string}
   */
  getTargetBranch(overrideBranch = null) {
    return resolveTargetBranch(this.projectRoot, overrideBranch);
  }

  /**
   * Ensures the track branch exists and is derived from target branch (or main).
   * @param {string} trackId - Unique identifier for the track.
   * @param {string} [targetBranch] - Target base branch. Defaults to resolved target branch or main.
   */
  createBranch(trackId, targetBranch = null) {
    const target = targetBranch || this.getTargetBranch();
    const branchExists = this.exec(`git branch --list ${target}`);
    if (!branchExists || !branchExists.includes(target)) {
      throw new Error(`Target base branch '${target}' does not exist.`);
    }
    this.exec(`git checkout ${target}`);
    this.exec(`git pull origin ${target}`);
    this.exec(`git checkout -b track/${trackId}`);
  }

  /**
   * Backward-compatible alias for createBranch from main.
   * @param {string} trackId - Unique identifier for the track.
   */
  createBranchFromMain(trackId) {
    this.createBranch(trackId, 'main');
  }

  /**
   * Merges the source branch into the target and cleans up.
   * @param {string} targetBranch - The branch to merge into.
   * @param {string} sourceBranch - The branch to merge from.
   * @param {object} [opts] - Optional parameters (e.g. message, trailers).
   */
  mergeToTarget(targetBranch, sourceBranch, opts = {}) {
    const target = targetBranch || this.getTargetBranch();
    this.exec(`git checkout ${target}`);
    this.exec(`git pull origin ${target}`);
    let mergeCmd = `git merge ${sourceBranch}`;
    if (opts.noFf || opts.trailer || opts.message) {
      const msg = opts.message || `feat(superconductor): Merge ${sourceBranch} into ${target}${opts.trailer ? `\n\n${opts.trailer}` : ''}`;
      mergeCmd = `git merge --no-ff ${sourceBranch} -m "${msg}"`;
    }
    this.exec(mergeCmd);
    this.exec(`git push origin ${target}`);
    this.exec(`git branch -d ${sourceBranch}`);
    this.exec(`git push origin --delete ${sourceBranch}`);
  }
}
