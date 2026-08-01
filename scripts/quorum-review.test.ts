import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuorumFSM } from './quorum-review';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('node:child_process', () => ({
    execFile: vi.fn()
}));

describe('Quorum Review', () => {
    const STATE_DIR = path.join(process.cwd(), 'superconductor', 'logs');
    const STATE_FILE = path.join(STATE_DIR, 'quorum-state.json');

    beforeEach(() => {
        vi.clearAllMocks();
        if (fs.existsSync(STATE_FILE)) {
            fs.unlinkSync(STATE_FILE);
        }
        if (fs.existsSync(STATE_FILE + '.tmp')) {
            fs.unlinkSync(STATE_FILE + '.tmp');
        }
    });

    it('should pass --findings as a named flag, not after --', async () => {
        const mockExecFile = execFile as any;
        // Mock reviewer failing with a finding
        mockExecFile.mockImplementation((cmd: string, args: string[], cb: any) => {
            if (args.includes('correctness-reviewer')) {
                cb(null, { stdout: '{"findings": [{"msg": "error"}]}' });
            } else if (args.includes('remediation-processor')) {
                cb(null, { stdout: 'fixed' });
            } else {
                cb(null, { stdout: 'APPROVED: NO FINDINGS' });
            }
        });

        const fsm = new QuorumFSM('test.ts');
        await fsm.run();

        const remediatorCalls = mockExecFile.mock.calls.filter((call: any) => call[1].includes('remediation-processor'));
        expect(remediatorCalls.length).toBeGreaterThan(0);
        
        const args = remediatorCalls[0][1];
        expect(args.includes('--')).toBe(false); // Should not have --
        expect(args.indexOf('--findings')).toBeGreaterThan(args.indexOf('--file'));
    });

    it('should transition to REQUIRES_HUMAN_INTERVENTION if reviewer process fails', async () => {
        const mockExecFile = execFile as any;
        mockExecFile.mockImplementation((cmd: string, args: string[], cb: any) => {
            cb(new Error('Process crashed'));
        });

        const fsm = new QuorumFSM('test.ts');
        const result = await fsm.run();

        expect(result.status).toBe('REQUIRES_HUMAN_INTERVENTION');
        expect(fsm.stateData.state).toBe('REQUIRES_HUMAN_INTERVENTION');
    });

    it('should approve for exact string match, but reject for substring with extra content', async () => {
        const mockExecFile = execFile as any;
        
        // 1. Substring match with extra content should be treated as findings or parse error
        mockExecFile.mockImplementationOnce((cmd: string, args: string[], cb: any) => cb(null, { stdout: 'APPROVED: NO FINDINGS but wait there is more' }))
                    .mockImplementationOnce((cmd: string, args: string[], cb: any) => cb(null, { stdout: 'APPROVED: NO FINDINGS' }))
                    .mockImplementationOnce((cmd: string, args: string[], cb: any) => cb(null, { stdout: 'APPROVED: NO FINDINGS' }));
                    
        const fsm1 = new QuorumFSM('test1.ts');
        const res1 = await fsm1.run();
        expect(res1.status).not.toBe('APPROVED');

        // 2. Exact match should approve
        mockExecFile.mockReset();
        mockExecFile.mockImplementation((cmd: string, args: string[], cb: any) => cb(null, { stdout: 'APPROVED: NO FINDINGS' }));
        
        const fsm2 = new QuorumFSM('test2.ts');
        const res2 = await fsm2.run();
        expect(res2.status).toBe('APPROVED');
        expect(fsm2.stateData.state).toBe('APPROVED');
    });
});
