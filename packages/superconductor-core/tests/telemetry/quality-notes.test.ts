import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QualityNotesWriter, QualityNote } from '../../src/telemetry/quality-notes';
import * as child_process from 'child_process';
import { promisify } from 'util';

vi.mock('child_process', () => ({
    execFileSync: vi.fn(),
}));

describe('QualityNotesWriter', () => {
    let writer: QualityNotesWriter;
    const mockExec = vi.mocked(child_process.execFileSync);

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
        mockExec.mockImplementation((cmd, args) => {
            if (args && args.includes('show')) {
                throw new Error('not found');
            } else if (args && args.includes('append')) {
                return 'success';
            }
            return '';
        });

        await writer.appendPhaseNote('abcdef1', validNote);

        expect(mockExec).toHaveBeenCalledTimes(2);
        const appendArgs = mockExec.mock.calls[1][1] as string[];
        expect(appendArgs).toContain('append');
        expect(appendArgs).toContain('abcdef1');
        const expectedJson = JSON.stringify(validNote).replace(/'/g, "'\\''");
        expect(appendArgs.join(' ')).toContain(expectedJson);
    });

    it('should be idempotent and not append if note already exists', async () => {
        // hasNote succeeds (note exists)
        mockExec.mockImplementation((cmd, args) => {
            if (args && args.includes('show')) {
                return 'some existing note';
            }
            return '';
        });

        await writer.appendPhaseNote('abcdef1', validNote);

        expect(mockExec).toHaveBeenCalledTimes(1);
        const showArgs = mockExec.mock.calls[0][1] as string[];
        expect(showArgs).toContain('show');
        expect(showArgs).toContain('abcdef1');
    });

    it('should throw error on JSON schema validation failure', async () => {
        const invalidNote = { ...validNote, swarm_pass_rate: 'invalid' };

        await expect(writer.appendPhaseNote('abcdef1', invalidNote)).rejects.toThrow();
        expect(mockExec).not.toHaveBeenCalled();
    });

    it('should handle missing note gracefully (hasNote returns false)', async () => {
        mockExec.mockImplementation((cmd, args) => {
            if (args && args.includes('show')) {
                throw new Error('fatal: no note found for object');
            }
            return '';
        });

        const exists = await writer.hasNote('abcdef1');
        expect(exists).toBe(false);
    });

    it('should return true if hasNote finds a note', async () => {
        mockExec.mockImplementation((cmd, args) => {
            if (args && args.includes('show')) {
                return '{"track_id":"xyz"}';
            }
            return '';
        });

        const exists = await writer.hasNote('abcdef1');
        expect(exists).toBe(true);
    });
});
