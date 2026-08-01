import { expect, describe, it, beforeEach } from 'vitest';
import { runQuorum, readState, writeState } from '../../../../scripts/quorum-review.ts';
import * as fs from 'fs';
import * as path from 'path';

describe('QuorumFSM', () => {
  const STATE_DIR = path.join(process.cwd(), 'superconductor', 'logs');
  const STATE_FILE = path.join(STATE_DIR, 'quorum-state.json');

  beforeEach(() => {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
    if (fs.existsSync(STATE_FILE + '.tmp')) {
      fs.unlinkSync(STATE_FILE + '.tmp');
    }
  });

  it('should initialize to IDLE', () => {
    const data = readState();
    expect(data.state).toBe('IDLE');
    expect(data.loops).toBe(0);
  });

  it('halts at REQUIRES_HUMAN_INTERVENTION after 3 loops', async () => {
    writeState({ state: 'REVIEW_PENDING', loops: 3, findings: [] });
    await runQuorum();
    const data = readState();
    expect(data.state).toBe('REQUIRES_HUMAN_INTERVENTION');
  });

  it('rejects duplicate findings', async () => {
    // Initial loops=0, findings=[]
    // runQuorum() adds findings and increments loops, then recurses and finds same findings => APPROVED
    writeState({ state: 'ANALYSIS', loops: 0, findings: ['finding_0_security', 'finding_0_correctness'] });
    await runQuorum();
    const data = readState();
    // It should end in APPROVED since uniqueNewFindings is empty
    expect(data.state).toBe('APPROVED');
  });
});
