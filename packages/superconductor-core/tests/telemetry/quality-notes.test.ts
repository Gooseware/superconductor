import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QualityNotesWriter, QualityNote } from '../../src/telemetry/quality-notes';
import * as child_process from 'child_process';
import { promisify } from 'util';

vi.mock('child_process', () => ({
    exec: vi.fn(),
}));

describe('QualityNotesWriter', () => {
    let writer: QualityNotesWriter;
    const mockExec = vi.mocked(child_process.exec);

    beforeEach(() => {
        writer = new QualityNotesWriter('/mock/cwd');
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const validNote: QualityNote = {
        track_id: 'track123',
        phase: 'Phase 1',
        timestamp: 1234567890,
        swarm_pass_rate: 0.95,
        retry_count: 1,
        critical_findings: 0,
        advisory_findings: 2,
        token_usage_estimate: 5000,
        abi_tweaks_applied: ['tweak1']
    };

    it('should create a note if it does not exist', async () => {
        // hasNote fails (note does not exist)
        mockExec.mockImplementation((cmd, options, callback) => {
            if (cmd.includes('show')) {
                const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
                cb(new Error('not found'), '', 'not found');
            } else if (cmd.includes('append')) {
                const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
                cb(null, 'success', '');
            }
            return {} as child_process.ChildProcess;
        });

        await writer.appendPhaseNote('abcdef1', validNote);

        expect(mockExec).toHaveBeenCalledTimes(2);
        const appendCall = mockExec.mock.calls[1][0] as string;
        expect(appendCall).toContain('git notes --ref=refs/notes/quality append');
        expect(appendCall).toContain('abcdef1');
        const expectedJson = JSON.stringify(validNote).replace(/'/g, "'\\''");
        expect(appendCall).toContain(expectedJson);
    });

    it('should be idempotent and not append if note already exists', async () => {
        // hasNote succeeds (note exists)
        mockExec.mockImplementation((cmd, options, callback) => {
            if (cmd.includes('show')) {
                const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
                cb(null, 'some existing note', '');
            }
            return {} as child_process.ChildProcess;
        });

        await writer.appendPhaseNote('abcdef1', validNote);

        expect(mockExec).toHaveBeenCalledTimes(1);
        const showCall = mockExec.mock.calls[0][0] as string;
        expect(showCall).toContain('git notes --ref=refs/notes/quality show abcdef1');
    });

    it('should throw error on JSON schema validation failure', async () => {
        const invalidNote = { ...validNote, swarm_pass_rate: 'invalid' };

        await expect(writer.appendPhaseNote('abcdef1', invalidNote)).rejects.toThrow();
        expect(mockExec).not.toHaveBeenCalled();
    });

    it('should handle missing note gracefully (hasNote returns false)', async () => {
        mockExec.mockImplementation((cmd, options, callback) => {
            if (cmd.includes('show')) {
                const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
                cb(new Error('fatal: no note found for object'), '', 'fatal: no note found for object');
            }
            return {} as child_process.ChildProcess;
        });

        const exists = await writer.hasNote('abcdef1');
        expect(exists).toBe(false);
    });

    it('should return true if hasNote finds a note', async () => {
        mockExec.mockImplementation((cmd, options, callback) => {
            if (cmd.includes('show')) {
                const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
                cb(null, '{"track_id":"xyz"}', '');
            }
            return {} as child_process.ChildProcess;
        });

        const exists = await writer.hasNote('abcdef1');
        expect(exists).toBe(true);
    });
});
