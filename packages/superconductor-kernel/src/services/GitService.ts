import { simpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export class GitService {
  constructor(private cacheDir: string) {}

  async sync(repoUrl: string, branch: string = 'main') {
    const sourceId = crypto.createHash('sha256').update(repoUrl).digest('hex').slice(0, 16);
    const targetDir = path.join(this.cacheDir, sourceId);

    const exists = await fs.access(targetDir).then(() => true).catch(() => false);
    
    // Per-call simpleGit instance
    const git = exists ? simpleGit(targetDir) : simpleGit();

    if (exists) {
      try {
        await git.pull('origin', branch);
      } catch (e) {
         console.error(`Pull failed for ${repoUrl}, attempting fresh clone. Error:`, e instanceof Error ? e.message : String(e));
         await fs.rm(targetDir, { recursive: true, force: true });
         await git.clone(repoUrl, targetDir, ['--branch', branch, '--single-branch', '--depth', '1']);
      }
    } else {
      try {
          await git.clone(repoUrl, targetDir, ['--branch', branch, '--single-branch', '--depth', '1']);
      } catch (e) {
          await fs.rm(targetDir, { recursive: true, force: true }).catch(() => null);
          throw new Error(`Failed to clone ${repoUrl}: ${e}`);
      }
    }

    return targetDir;
  }
}
