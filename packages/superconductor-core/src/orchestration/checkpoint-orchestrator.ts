import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IntelligenceAutoSyncEngine } from '../intelligence/auto-sync-engine.js';

export class InvalidShaError extends Error {}
export class InvalidPhaseError extends Error {}
export class PathTraversalError extends Error {}
export class CheckpointTestFailureError extends Error {
  constructor(public testOutput: string) {
    super('Tests failed — checkpoint aborted');
  }
}

export function validatePlanPath(planPath: string, workspaceRoot: string = process.cwd()): void {
  const resolvedPlan = path.resolve(planPath);
  const resolvedRoot = path.resolve(workspaceRoot);
  const relative = path.relative(resolvedRoot, resolvedPlan);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PathTraversalError(`Path traversal detected: ${planPath}`);
  }
}

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
    private dryRun = false,
    private workspaceRoot = process.cwd()
  ) {}

  async run(phase: string, prevSha: string): Promise<CheckpointReport> {
    validatePlanPath(this.planPath, this.workspaceRoot);

    if (!/^[0-9a-f]{7,40}$/i.test(prevSha)) {
      throw new InvalidShaError(`Invalid git SHA: ${prevSha}`);
    }

    const sanitizedPhase = phase.replace(/[^a-zA-Z0-9 _-]/g, '');
    if (!sanitizedPhase || sanitizedPhase.trim().length === 0) {
      throw new InvalidPhaseError(`Invalid phase name: ${phase}`);
    }

    // Step 3: diff
    const diffRes = await this.shell.exec(`git diff --name-only ${prevSha} HEAD`);
    const changedFiles = diffRes.stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Step 4: test
    let testsPass = true;
    if (!this.dryRun) {
      const testRes = await this.shell.exec('CI=true npm test');
      if (testRes.exitCode !== 0) {
        testsPass = false;
        const testOutput = [testRes.stdout, testRes.stderr].filter(Boolean).join('\n');
        throw new CheckpointTestFailureError(testOutput);
      }
    }

    let checkpointSha = 'dry-run-sha';
    if (!this.dryRun) {
      // Step 8: commit
      await this.shell.exec(`git commit -m "superconductor(checkpoint): Checkpoint end of ${sanitizedPhase}"`);
      
      const shaRes = await this.shell.exec(`git log -1 --format="%H"`);
      checkpointSha = shaRes.stdout.trim();

      // Step 9: git notes
      const note: QualityNote = {
        phase: sanitizedPhase,
        timestamp: new Date().toISOString(),
        checkpointSha,
        testsPass,
        changedFiles
      };
      const noteJson = JSON.stringify(note).replace(/'/g, "'\\''");
      await this.shell.exec(`git notes add -m '${noteJson}' HEAD`);

      // Step 9.5: Continuous Code Intelligence Auto-Sync
      try {
        await IntelligenceAutoSyncEngine.syncPhaseFiles(changedFiles, {
          projectRoot: this.workspaceRoot,
        });
      } catch (err) {
        process.stderr.write(`[superconductor:checkpoint] Intelligence auto-sync error: ${err}\n`);
      }
    }

    // Step 10: update plan.md
    let planUpdated = false;
    try {
      let content = await fs.readFile(this.planPath, 'utf-8');
      const phaseRegex = new RegExp(`(##\\s+${sanitizedPhase}[^\\n]*)`);
      if (phaseRegex.test(content)) {
        content = content.replace(phaseRegex, `$1 [checkpoint: ${checkpointSha}]`);
        if (!this.dryRun) {
          await fs.writeFile(this.planPath, content, 'utf-8');
          // Step 11: commit plan
          await this.shell.exec(`git add ${this.planPath}`);
          await this.shell.exec(`git commit -m "superconductor(plan): Mark phase '${sanitizedPhase}' as complete"`);
        }
        planUpdated = true;
      }
    } catch (e) {
      // ignore
    }

    return {
      phase: sanitizedPhase,
      checkpointSha,
      changedFiles,
      testsPass,
      qualityNote: {
        phase: sanitizedPhase,
        timestamp: new Date().toISOString(),
        checkpointSha,
        testsPass,
        changedFiles
      },
      planUpdated
    };
  }
}
