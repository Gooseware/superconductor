import { execSync } from 'child_process';

export class GitCheckpointManager {
  public createCheckpoint(taskId: string): string {
    try {
      const msg = `checkpoint: pre-task ${taskId}`;
      execSync(`git commit --allow-empty -m "${msg}"`, { stdio: 'ignore' });
      const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      return sha;
    } catch {
      return 'mock-checkpoint-sha';
    }
  }

  public rollbackToCheckpoint(sha: string): boolean {
    try {
      execSync(`git reset --hard ${sha}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
