import * as child_process from 'child_process';
import * as path from 'path';
import { EventStore } from '../state/event-store.js';
import { DagNode } from '../types/dag.types.js';

export class GccController {
  private store: EventStore;
  private repoPath: string;

  constructor(store: EventStore, repoPath: string) {
    this.store = store;
    this.repoPath = repoPath;
  }

  private execGit(command: string): void {
    child_process.execSync(command, { cwd: this.repoPath, stdio: 'ignore' });
  }

  private getWorktreePath(taskId: string): string {
    return path.join(this.repoPath, '.worktrees', taskId);
  }

  gccBranch(taskId: string): void {
    const branchName = `gcc/${taskId}`;
    const worktreePath = this.getWorktreePath(taskId);

    try {
      this.execGit(`git worktree add -b ${branchName} ${worktreePath}`);
      this.store.append({
        type: 'safety',
        timestamp: Date.now(),
        detail: {
          taskId,
          operation: 'branch',
          timestamp: Date.now(),
          success: true
        }
      });
    } catch (error: any) {
      this.store.append({
        type: 'safety',
        timestamp: Date.now(),
        detail: {
          taskId,
          operation: 'branch',
          timestamp: Date.now(),
          success: false,
          error: error.message
        }
      });
      throw error;
    }
  }

  gccMerge(taskId: string): void {
    const branchName = `gcc/${taskId}`;
    const worktreePath = this.getWorktreePath(taskId);

    try {
      this.execGit(`git merge ${branchName}`);
      this.execGit(`git worktree remove ${worktreePath}`);
      this.store.append({
        type: 'safety',
        timestamp: Date.now(),
        detail: {
          taskId,
          operation: 'merge',
          timestamp: Date.now(),
          success: true
        }
      });
    } catch (error: any) {
      this.store.append({
        type: 'safety',
        timestamp: Date.now(),
        detail: {
          taskId,
          operation: 'merge',
          timestamp: Date.now(),
          success: false,
          error: error.message
        }
      });
      throw error;
    }
  }

  gccDrop(taskId: string): void {
    const branchName = `gcc/${taskId}`;
    const worktreePath = this.getWorktreePath(taskId);

    try {
      this.execGit(`git worktree remove --force ${worktreePath}`);
      this.execGit(`git branch -D ${branchName}`);
      this.store.append({
        type: 'safety',
        timestamp: Date.now(),
        detail: {
          taskId,
          operation: 'drop',
          timestamp: Date.now(),
          success: true
        }
      });
    } catch (error: any) {
      this.store.append({
        type: 'safety',
        timestamp: Date.now(),
        detail: {
          taskId,
          operation: 'drop',
          timestamp: Date.now(),
          success: false,
          error: error.message
        }
      });
      throw error;
    }
  }

  shouldIsolateTask(task: DagNode): boolean {
    if (task.tier && task.tier >= 4) {
      return true;
    }
    return false;
  }
}
