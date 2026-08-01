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

vi.mock('node:child_process', () => {
    const execFile = vi.fn();
    (execFile as any)[Symbol.for('nodejs.util.promisify.custom')] = vi.fn();
    return { execFile };
});

import { QuorumFSM } from '../../../../scripts/quorum-review';

describe('QuorumFSM', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should transition through states and approve if no findings', async () => {
        // @ts-ignore
        child_process.execFile[Symbol.for('nodejs.util.promisify.custom')].mockResolvedValue({ stdout: 'No errors', stderr: '' });
        
        const fsm = new QuorumFSM('test.ts');
        const res = await fsm.run(); console.log('res is:', res);
        
        expect(res.status).toBe('APPROVED');
        expect(fsm.stateData.state).toBe('APPROVED');
        expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should deduplicate findings and reject if matches verbatim', async () => {
        // Mock with finding
        // @ts-ignore
        child_process.execFile[Symbol.for('nodejs.util.promisify.custom')].mockResolvedValue({ stdout: '{"findings":["some error"]}', stderr: '' });

        const fsm = new QuorumFSM('test.ts');
        fsm.stateData.history = ['some error']; // Already in history
        
        const res = await fsm.run();
        
        expect(res.status).toBe('FAILED');
        expect(fsm.stateData.state).toBe('FAILED');
    });

    it('should require human intervention after MAX_QUORUM_LOOPS', async () => {
        // @ts-ignore
        let loopCount = 0;
        child_process.execFile[Symbol.for('nodejs.util.promisify.custom')].mockImplementation(async () => {
            loopCount++;
            return { stdout: `{"findings":["new error ${loopCount}"]}`, stderr: '' };
        });

        const fsm = new QuorumFSM('test.ts');
        
        const res1 = await fsm.run();
        expect(res1.status).toBe('REMEDIATION_REQUIRED');

        const res2 = await fsm.run();
        expect(res2.status).toBe('REMEDIATION_REQUIRED');

        const res3 = await fsm.run();
        
        expect(res3.status).toBe('REQUIRES_HUMAN_INTERVENTION');
        expect(fsm.stateData.state).toBe('REQUIRES_HUMAN_INTERVENTION');
    });
});
