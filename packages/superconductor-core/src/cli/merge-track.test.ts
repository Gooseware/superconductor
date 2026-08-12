import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedMergeError } from '../orchestration/workspace-guard.js';

// Mock execFileSync and execSync so tests don't run real git
vi.mock('child_process', () => ({
  execFileSync: vi.fn().mockReturnValue('abc1234'),
  execSync: vi.fn().mockReturnValue('abc1234'),
  spawn: vi.fn(),
}));

import { mergeTrack, validateBranchName } from './merge-track.js';

describe('validateBranchName', () => {
  it('throws on invalid branch name with shell metacharacters', () => {
    // trackBranch with semicolons should be rejected
    expect(() => validateBranchName('track/foo; rm -rf /')).toThrow('Invalid branch name');
    expect(() => validateBranchName('track/foo$(whoami)')).toThrow('Invalid branch name');
    expect(() => validateBranchName('track/foo`id`')).toThrow('Invalid branch name');
  });

  it('accepts valid branch names', () => {
    expect(() => validateBranchName('track/feature-123')).not.toThrow();
    expect(() => validateBranchName('main')).not.toThrow();
    expect(() => validateBranchName('user_name/branch.name-1')).not.toThrow();
  });
});

describe('mergeTrack', () => {
  it('generates a trailer from reviewer IDs', async () => {
    const { SignOffGate } = await import('../orchestration/sign-off-gate.js');
    vi.spyOn(SignOffGate, 'isApproved').mockResolvedValue(true);
    const result = await mergeTrack('track/test', ['id1', 'id2'], { dryRun: true, trackId: 't1', sessionId: 's1' });
    expect(result.trailer).toBeTruthy();
    expect(result.trailer).toContain('id1');
    expect(result.trailer).toContain('id2');
  });

  it('throws UnauthorizedMergeError with empty reviewer IDs if trailer validation fails', async () => {
    // SwarmAuthorizer.generateTrailer([]) should produce an invalid/empty trailer
    // This tests the gate: if no reviewers, merge should be blocked
    // We mock WorkspaceGuard to throw
    const { WorkspaceGuard } = await import('../orchestration/workspace-guard.js');
    vi.spyOn(WorkspaceGuard.prototype, 'commitToMain').mockRejectedValueOnce(new UnauthorizedMergeError());
    await expect(mergeTrack('track/test', [], { dryRun: true, trackId: 't1', sessionId: 's1' })).rejects.toThrow(UnauthorizedMergeError);
  });

  it('returns mergeCommitSha and trailer in dryRun mode', async () => {
    const { SignOffGate } = await import('../orchestration/sign-off-gate.js');
    vi.spyOn(SignOffGate, 'isApproved').mockResolvedValue(true);
    const result = await mergeTrack('track/test', ['reviewer1', 'reviewer2'], { dryRun: true, trackId: 't1', sessionId: 's1' });
    expect(result.mergeCommitSha).toBe('dry-run');
    expect(result.trailer).toBeDefined();
  });

  it('rejects invalid branch name in mergeTrack', async () => {
    await expect(mergeTrack('track/foo; rm -rf /', ['id1'], { dryRun: true })).rejects.toThrow('Invalid branch name');
  });
});

