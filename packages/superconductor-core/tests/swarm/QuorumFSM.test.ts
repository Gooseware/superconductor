import { expect, describe, it, beforeEach, vi } from 'vitest';
import { QuorumFSM } from '../../../../scripts/quorum-review';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';

vi.mock('node:child_process', () => ({
    execFile: vi.fn()
}));

describe('QuorumFSM', () => {
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

  it('should initialize to IDLE', () => {
    const fsm = new QuorumFSM('test.ts');
    expect(fsm.stateData.state).toBe('IDLE');
    expect(fsm.stateData.loops).toBe(0);
  });

  it('halts at REQUIRES_HUMAN_INTERVENTION after 3 loops', async () => {
    const fsm = new QuorumFSM('test.ts');
    fsm.stateData.loops = 3;
    fsm.stateData.state = 'REVIEW_PENDING';
    
    const result = await fsm.run();
    expect(result.status).toBe('REQUIRES_HUMAN_INTERVENTION');
    expect(fsm.stateData.state).toBe('REQUIRES_HUMAN_INTERVENTION');
  });

  it('rejects duplicate findings', async () => {
    const mockExecFile = execFile as any;
    mockExecFile.mockImplementation((cmd: string, args: string[], cb: any) => {
        cb(null, { stdout: '{"findings": ["finding_0_security"]}' });
    });

    const fsm = new QuorumFSM('test.ts');
    // Pre-populate history with the same finding to simulate a duplicate across loops
    fsm.stateData.history = ['finding_0_security'];
    
    const result = await fsm.run();
    expect(result.status).toBe('FAILED');
    expect(fsm.stateData.state).toBe('FAILED');
  });
});
