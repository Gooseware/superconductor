import { z } from 'zod';
import * as fs from 'fs/promises';

export const QualityNoteSchema = z.object({
  phase: z.string(),
  timestamp: z.string(),
  checkpointSha: z.string(),
  testsPass: z.boolean(),
  coverage: z.number().optional(),
  changedFiles: z.array(z.string()),
});
export type QualityNote = z.infer<typeof QualityNoteSchema>;

export interface CheckpointReport {
  phase: string;
  checkpointSha: string;
  changedFiles: string[];
  testsPass: boolean;
  qualityNote: QualityNote;
  planUpdated: boolean;
}

export interface ShellRunner {
  exec(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export class CheckpointOrchestrator {
  constructor(
    private planPath: string,
    private shell: ShellRunner,
    private dryRun = false
  ) {}

  async run(phase: string, prevSha: string): Promise<CheckpointReport> {
    // Step 3: diff
    const diffRes = await this.shell.exec(`git diff --name-only ${prevSha} HEAD`);
    const changedFiles = diffRes.stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Step 4: test
    let testsPass = true;
    if (!this.dryRun) {
      const testRes = await this.shell.exec('CI=true npm test');
      if (testRes.exitCode !== 0) testsPass = false;
    }

    let checkpointSha = 'dry-run-sha';
    if (!this.dryRun) {
      // Step 8: commit
      await this.shell.exec(`git commit -m "superconductor(checkpoint): Checkpoint end of ${phase}"`);
      
      const shaRes = await this.shell.exec(`git log -1 --format="%H"`);
      checkpointSha = shaRes.stdout.trim();

      // Step 9: git notes
      const note: QualityNote = {
        phase,
        timestamp: new Date().toISOString(),
        checkpointSha,
        testsPass,
        changedFiles
      };
      await this.shell.exec(`git notes add -m '${JSON.stringify(note)}' HEAD`);
    }

    // Step 10: update plan.md
    let planUpdated = false;
    try {
      let content = await fs.readFile(this.planPath, 'utf-8');
      const phaseRegex = new RegExp(`(##\\s+${phase}[^\\n]*)`);
      if (phaseRegex.test(content)) {
        content = content.replace(phaseRegex, `$1 [checkpoint: ${checkpointSha}]`);
        if (!this.dryRun) {
          await fs.writeFile(this.planPath, content, 'utf-8');
          // Step 11: commit plan
          await this.shell.exec(`git add ${this.planPath}`);
          await this.shell.exec(`git commit -m "superconductor(plan): Mark phase '${phase}' as complete"`);
        }
        planUpdated = true;
      }
    } catch (e) {
      // ignore
    }

    return {
      phase,
      checkpointSha,
      changedFiles,
      testsPass,
      qualityNote: {
        phase,
        timestamp: new Date().toISOString(),
        checkpointSha,
        testsPass,
        changedFiles
      },
      planUpdated
    };
  }
}
