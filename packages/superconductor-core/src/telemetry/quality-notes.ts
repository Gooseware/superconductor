import { execFileSync } from 'child_process';
import { z } from 'zod';

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

    private validateCommitSha(commitSha: string) {
        if (!/^[a-f0-9]{7,40}$/i.test(commitSha)) {
            throw new Error(`Invalid commit SHA: ${commitSha}`);
        }
    }

    async hasNote(commitSha: string): Promise<boolean> {
        this.validateCommitSha(commitSha);
        try {
            execFileSync('git', ['notes', '--ref=refs/notes/quality', 'show', commitSha], { cwd: this.cwd, timeout: 10000 });
            return true;
        } catch {
            return false;
        }
    }

    async appendPhaseNote(commitSha: string, note: unknown): Promise<void> {
        this.validateCommitSha(commitSha);
        const validatedNote = QualityNoteSchema.parse(note);
        
        const noteExists = await this.hasNote(commitSha);
        if (noteExists) {
            return;
        }

        const noteJson = JSON.stringify(validatedNote);
        execFileSync('git', ['notes', '--ref=refs/notes/quality', 'append', '-m', noteJson, commitSha], { cwd: this.cwd, timeout: 10000 });
    }
}
