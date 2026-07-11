import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobDispatcher } from '../src/dispatcher/job-dispatcher.js';
import { BacklogParser } from '../src/dispatcher/backlog-parser.js';
import * as cp from 'child_process';
import * as fs from 'fs';

vi.mock('child_process');
vi.mock('fs');

describe('JobDispatcher', () => {
  let dispatcher: JobDispatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatcher = new JobDispatcher();
  });

  it('should claim an item, create a worktree, and invoke the agent', async () => {
    const mockPendingItems = [{ title: 'Feature: Test', rawLine: '- [ ] Feature: Test' }];
    vi.spyOn(BacklogParser.prototype, 'extractPendingItems').mockReturnValue(mockPendingItems);
    
    // Mock fs
    (fs.existsSync as any).mockImplementation((p: string) => {
      if (p === 'superconductor/backlog.md') return true;
      return false; // trackDir does not exist
    });
    (fs.readFileSync as any).mockReturnValue('- [ ] Feature: Test');

    // Mock git worktree check
    (cp.execSync as any).mockReturnValue('');

    const trackId = await dispatcher.dispatchNextJob('superconductor/backlog.md');

    // Should return the track id
    expect(trackId).toMatch(/^test_\d+$/);

    // Should create a worktree
    expect(cp.execSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree add ')
    );

    // Should start the agent
    expect(cp.spawn).toHaveBeenCalledWith(
      'agy',
      expect.arrayContaining(['--new-project', '--prompt-interactive', expect.stringContaining('Feature: Test')]),
      expect.any(Object)
    );
  });

  it('should mark a job as completed', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue('- [ ] Feature: Test');
    vi.spyOn(BacklogParser.prototype, 'markItemAsDone').mockReturnValue('- [x] Feature: Test');

    dispatcher.completeJob('superconductor/backlog.md', 'Feature: Test');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'superconductor/backlog.md',
      '- [x] Feature: Test',
      'utf8'
    );
  });
});
