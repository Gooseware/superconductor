import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as util from 'node:util';
import * as child_process from 'node:child_process';

// Mock fs and child_process
vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn()
}));

vi.mock('node:child_process', () => ({
    execFile: vi.fn()
}));

vi.mock('node:util', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        promisify: (fn: any) => fn
    };
});

import { QuorumFSM } from '../../../../scripts/quorum-review';

describe('QuorumFSM', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should transition through states and approve if no findings', async () => {
        // @ts-ignore
        child_process.execFile.mockResolvedValue({ stdout: 'No errors' });
        
        const fsm = new QuorumFSM('test.ts');
        const res = await fsm.run(); console.log('res is:', res);
        
        expect(res.status).toBe('APPROVED');
        expect(fsm.stateData.state).toBe('APPROVED');
        expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should deduplicate findings and reject if matches verbatim', async () => {
        // Mock with finding
        // @ts-ignore
        child_process.execFile.mockResolvedValue({ stdout: '{"findings":["some error"]}' });

        const fsm = new QuorumFSM('test.ts');
        fsm.stateData.history = ['some error']; // Already in history
        
        const res = await fsm.run();
        
        expect(res.status).toBe('FAILED');
        expect(fsm.stateData.state).toBe('FAILED');
    });

    it('should require human intervention after MAX_QUORUM_LOOPS', async () => {
        // @ts-ignore
        child_process.execFile.mockResolvedValue({ stdout: '{"findings":["new error"]}' });

        const fsm = new QuorumFSM('test.ts');
        fsm.stateData.loops = 2; // Next one will be 3
        
        const res = await fsm.run();
        
        expect(res.status).toBe('REQUIRES_HUMAN_INTERVENTION');
        expect(fsm.stateData.state).toBe('REQUIRES_HUMAN_INTERVENTION');
    });
});
