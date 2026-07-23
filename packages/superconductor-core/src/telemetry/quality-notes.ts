import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';

const execAsync = promisify(exec);

export const QualityNoteSchema = z.object({
    track_id: z.string(),
    phase: z.string(),
    timestamp: z.number(),
    swarm_pass_rate: z.number(),
    retry_count: z.number(),
    critical_findings: z.number(),
    advisory_findings: z.number(),
    token_usage_estimate: z.number(),
    abi_tweaks_applied: z.array(z.string())
});

export type QualityNote = z.infer<typeof QualityNoteSchema>;

export class QualityNotesWriter {
    constructor(private cwd: string = process.cwd()) {}

    private async execute(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, { cwd: this.cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Command failed: ${command}\nStderr: ${stderr}\nStdout: ${stdout}`));
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    async hasNote(commitSha: string): Promise<boolean> {
        try {
            await this.execute(`git notes --ref=refs/notes/quality show ${commitSha}`);
            return true;
        } catch {
            return false;
        }
    }

    async appendPhaseNote(commitSha: string, note: unknown): Promise<void> {
        const validatedNote = QualityNoteSchema.parse(note);
        
        const noteExists = await this.hasNote(commitSha);
        if (noteExists) {
            return;
        }

        const noteJson = JSON.stringify(validatedNote);
        const escapedJson = noteJson.replace(/'/g, "'\\''");
        await this.execute(`git notes --ref=refs/notes/quality append -m '${escapedJson}' ${commitSha}`);
    }
}
