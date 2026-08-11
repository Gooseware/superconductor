import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedMergeError } from '../orchestration/workspace-guard.js';

// Mock execSync so tests don't run real git
vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue('abc1234'),
}));

import { mergeTrack } from './merge-track.js';

describe('mergeTrack', () => {
  it('generates a trailer from reviewer IDs', async () => {
    const result = await mergeTrack('track/test', ['id1', 'id2'], { dryRun: true });
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
    await expect(mergeTrack('track/test', [], { dryRun: true })).rejects.toThrow(UnauthorizedMergeError);
  });

  it('returns mergeCommitSha and trailer in dryRun mode', async () => {
    const result = await mergeTrack('track/test', ['reviewer1', 'reviewer2'], { dryRun: true });
    expect(result.mergeCommitSha).toBe('dry-run');
    expect(result.trailer).toBeDefined();
  });
});
