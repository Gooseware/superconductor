import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CheckpointOrchestrator,
  QualityNoteSchema,
  InvalidShaError,
  InvalidPhaseError,
  PathTraversalError,
  CheckpointTestFailureError,
  validatePlanPath
} from './checkpoint-orchestrator.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn()
}));

describe('CheckpointOrchestrator', () => {
  let mockShell: any;

  beforeEach(() => {
    mockShell = {
      exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    };
    vi.mocked(fs.readFile).mockResolvedValue('## Phase 5\n\nSome tasks\n');
    vi.mocked(fs.writeFile).mockResolvedValue();
  });

  it('in dryRun mode returns CheckpointReport without shell mutations', async () => {
    mockShell.exec.mockImplementation(async (cmd: string) => {
      if (cmd.startsWith('git diff')) {
        return { stdout: 'file1.ts\nfile2.ts', stderr: '', exitCode: 0 };
      }
      return { stdout: 'mock-sha', stderr: '', exitCode: 0 };
    });

    const orchestrator = new CheckpointOrchestrator('plan.md', mockShell, true);
    const report = await orchestrator.run('Phase 5', 'abcdef1');

    expect(report.phase).toBe('Phase 5');
    expect(report.changedFiles).toEqual(['file1.ts', 'file2.ts']);
    expect(report.testsPass).toBe(true);
    expect(report.planUpdated).toBe(true);
    
    // In dry run, it shouldn't execute commits
    expect(mockShell.exec).not.toHaveBeenCalledWith(expect.stringContaining('git commit'));
    expect(mockShell.exec).not.toHaveBeenCalledWith(expect.stringContaining('git notes add'));
  });

  it('executes git diff --name-only <prevSha> HEAD', async () => {
    const orchestrator = new CheckpointOrchestrator('plan.md', mockShell);
    mockShell.exec.mockResolvedValue({ stdout: 'changed.ts', stderr: '', exitCode: 0 });
    
    await orchestrator.run('Phase 5', 'abcdef1');
    expect(mockShell.exec).toHaveBeenCalledWith('git diff --name-only abcdef1 HEAD');
  });

  it('generates superconductor(checkpoint): commit', async () => {
    const orchestrator = new CheckpointOrchestrator('plan.md', mockShell);
    mockShell.exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('git log -1 --format="%H"')) return { stdout: 'newsha123', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    
    await orchestrator.run('Phase 5', 'abcdef1');
    expect(mockShell.exec).toHaveBeenCalledWith('git commit -m "superconductor(checkpoint): Checkpoint end of Phase 5"');
  });

  it('writes [checkpoint: <sha>] to plan.md phase header', async () => {
    const orchestrator = new CheckpointOrchestrator('plan.md', mockShell);
    mockShell.exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('git log -1 --format="%H"')) return { stdout: 'newsha123', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    
    await orchestrator.run('Phase 5', 'abcdef1');
    
    expect(fs.writeFile).toHaveBeenCalledWith(
      'plan.md',
      expect.stringContaining('## Phase 5 [checkpoint: newsha123]'),
      'utf-8'
    );
  });

  it('calls git notes add with valid QualityNote JSON', async () => {
    const orchestrator = new CheckpointOrchestrator('plan.md', mockShell);
    mockShell.exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('git log -1 --format="%H"')) return { stdout: 'newsha123', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    
    await orchestrator.run('Phase 5', 'abcdef1');
    
    // Find the git notes call
    const notesCall = mockShell.exec.mock.calls.find((c: any) => c[0].startsWith('git notes add'));
    expect(notesCall).toBeDefined();
    
    // Extract JSON string from the command (git notes add -m '{"phase":...}' HEAD)
    const match = notesCall[0].match(/-m '(.+)' HEAD/);
    expect(match).toBeDefined();
    
    const parsedNote = JSON.parse(match![1]);
    expect(QualityNoteSchema.safeParse(parsedNote).success).toBe(true);
    expect(parsedNote.phase).toBe('Phase 5');
    expect(parsedNote.checkpointSha).toBe('newsha123');
  });

  it('throws InvalidShaError when prevSha is invalid', async () => {
    const orchestrator = new CheckpointOrchestrator('plan.md', mockShell);
    await expect(orchestrator.run('Phase 5', '; DROP TABLE')).rejects.toThrow(InvalidShaError);
  });

  it('throws InvalidPhaseError when phase is empty after sanitization', async () => {
    const orchestrator = new CheckpointOrchestrator('plan.md', mockShell);
    await expect(orchestrator.run(';;;;', 'abcdef1')).rejects.toThrow(InvalidPhaseError);
  });

  it('throws PathTraversalError when planPath is outside workspace root', async () => {
    const orchestrator = new CheckpointOrchestrator('../../../etc/passwd', mockShell);
    await expect(orchestrator.run('Phase 5', 'abcdef1')).rejects.toThrow(PathTraversalError);
  });

  it('throws CheckpointTestFailureError when tests fail and does not call git commit', async () => {
    mockShell.exec.mockImplementation(async (cmd: string) => {
      if (cmd === 'CI=true npm test') {
        return { stdout: 'Test suite failed', stderr: '1 test failed', exitCode: 1 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const orchestrator = new CheckpointOrchestrator('plan.md', mockShell);
    await expect(orchestrator.run('Phase 5', 'abcdef1')).rejects.toThrow(CheckpointTestFailureError);

    expect(mockShell.exec).not.toHaveBeenCalledWith(expect.stringContaining('git commit'));
  });
});
