import { BacklogParser } from './backlog-parser.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class JobDispatcher {
  private parser: BacklogParser;

  constructor() {
    this.parser = new BacklogParser();
  }

  /**
   * Reads the backlog, claims the next pending item, generates a track ID,
   * creates a git worktree, and spawns the agent to generate the spec/plan.
   * @param backlogPath Path to the backlog file
   * @returns The generated track ID, or null if no pending items
   */
  async dispatchNextJob(backlogPath: string): Promise<string | null> {
    if (!fs.existsSync(backlogPath)) {
      return null;
    }

    const content = fs.readFileSync(backlogPath, 'utf8');
    const pendingItems = this.parser.extractPendingItems(content);

    if (pendingItems.length === 0) {
      return null;
    }

    const nextJob = pendingItems[0];
    
    // Generate a track ID based on the title (lowercase, alphanumeric, underscores)
    const sanitizedTitle = nextJob.title
      .replace(/^(Feature|Bugfix|Task):\s*/i, '') // Remove prefixes
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 8); // YYYYMMDD
    const trackId = `${sanitizedTitle}_${timestamp}`;

    const trackDir = path.resolve(path.dirname(backlogPath), 'tracks', trackId);

    // Create an isolated branch and git worktree
    try {
      // Check if branch exists
      const branchName = `track/${trackId}`;
      const branches = cp.execSync('git branch --list ' + branchName).toString();
      
      if (!branches.includes(branchName)) {
        cp.execSync(`git branch ${branchName} main`);
      }

      // Create worktree
      if (!fs.existsSync(trackDir)) {
        cp.execSync(`git worktree add ${trackDir} ${branchName}`);
      }
    } catch (error) {
      console.error(`Failed to create git worktree for ${trackId}:`, error);
      throw error;
    }

    // Spawn the agent in the new worktree to generate spec and plan
    try {
      const prompt = `Please act as a spec generator. I am assigning you the following task from the backlog:\n"${nextJob.title}"\nCreate a spec.md and plan.md in this directory following the Superconductor framework guidelines. Keep it concise.`;
      
      cp.spawn('agy', ['--new-project', '--prompt-interactive', prompt], {
        cwd: trackDir,
        stdio: 'inherit'
      });
      // In a real implementation we would wait for it or manage the process
      // But for testing and basic implementation, spawn is sufficient
    } catch (error) {
      console.error(`Failed to spawn agent for ${trackId}:`, error);
      throw error;
    }

    return trackId;
  }

  /**
   * Marks a job as completed in the backlog.
   * @param backlogPath Path to the backlog file
   * @param jobTitle The title of the job to mark as completed
   */
  completeJob(backlogPath: string, jobTitle: string): void {
    if (!fs.existsSync(backlogPath)) {
      throw new Error(`Backlog file not found at ${backlogPath}`);
    }

    const content = fs.readFileSync(backlogPath, 'utf8');
    const updatedContent = this.parser.markItemAsDone(content, jobTitle);
    
    fs.writeFileSync(backlogPath, updatedContent, 'utf8');
  }
}
