import { simpleGit, type SimpleGit } from 'simple-git';
import path from 'path';

export class AtomicGitService {
  private git: SimpleGit;

  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  /**
   * Performs an atomic pull, stage, commit, and push.
   * @param message Commit message.
   * @param files List of files to stage.
   */
  async commitAndPush(message: string, files: string[] = ['.']) {
    try {
      // 1. Ensure we are up to date
      await this.git.pull('origin', 'main', ['--rebase']);
      
      // 2. Stage files
      for (const file of files) {
        await this.git.add(file);
      }
      
      // 3. Commit
      await this.git.commit(message);
      
      // 4. Push
      await this.git.push('origin', 'main');
      
      return { success: true };
    } catch (error: any) {
      console.error('Atomic Git operation failed:', error instanceof Error ? error.message : String(error));
      throw new Error(`Git operation failed: ${error.message}`);
    }
  }
}
