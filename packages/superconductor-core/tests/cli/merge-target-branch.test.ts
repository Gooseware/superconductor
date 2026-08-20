import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const mockExecFileSync = vi.fn();
const mockExecSync = vi.fn();

vi.mock('child_process', () => ({
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
  execSync: (...args: any[]) => mockExecSync(...args),
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
  execSync: (...args: any[]) => mockExecSync(...args),
  spawn: vi.fn(),
}));

import {
  resolveTargetBranch,
  verifyWorkingTreeClean,
  mergeTrack,
  validateBranchName,
} from '../../src/cli/merge-track.js';

describe('merge-target-branch and Git reconciliation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-merge-test-'));
    mockExecFileSync.mockReset();
    mockExecSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('resolveTargetBranch', () => {
    it('resolves target branch from superconductor/tech-stack.md with backticks', () => {
      const scDir = path.join(tmpDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });
      fs.writeFileSync(
        path.join(scDir, 'tech-stack.md'),
        '# Tech Stack\n\n## Development Preferences\n- **Target Branch:** `dev`\n',
        'utf8'
      );

      const branch = resolveTargetBranch(tmpDir);
      expect(branch).toBe('dev');
    });

    it('resolves target branch from tech-stack.md without backticks', () => {
      const scDir = path.join(tmpDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });
      fs.writeFileSync(
        path.join(scDir, 'tech-stack.md'),
        '# Tech Stack\n\n## Development Preferences\n- Target Branch: release/v2.0\n',
        'utf8'
      );

      const branch = resolveTargetBranch(tmpDir);
      expect(branch).toBe('release/v2.0');
    });

    it('prefers overrideBranch over tech-stack.md when overrideBranch is provided', () => {
      const scDir = path.join(tmpDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });
      fs.writeFileSync(
        path.join(scDir, 'tech-stack.md'),
        '# Tech Stack\n\n## Development Preferences\n- **Target Branch:** `dev`\n',
        'utf8'
      );

      const branch = resolveTargetBranch(tmpDir, 'feature-staging');
      expect(branch).toBe('feature-staging');
    });

    it('falls back to main when tech-stack.md does not exist', () => {
      const branch = resolveTargetBranch(tmpDir);
      expect(branch).toBe('main');
    });

    it('falls back to main when tech-stack.md lacks Target Branch section', () => {
      const scDir = path.join(tmpDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });
      fs.writeFileSync(
        path.join(scDir, 'tech-stack.md'),
        '# Tech Stack\n\n## Language\nTypeScript\n',
        'utf8'
      );

      const branch = resolveTargetBranch(tmpDir);
      expect(branch).toBe('main');
    });
  });

  describe('verifyWorkingTreeClean', () => {
    it('passes when git status --porcelain is empty', () => {
      mockExecFileSync.mockReturnValue('');
      expect(() => verifyWorkingTreeClean(tmpDir)).not.toThrow();
      expect(mockExecFileSync).toHaveBeenCalledWith('git', ['status', '--porcelain'], expect.objectContaining({ cwd: tmpDir }));
    });

    it('throws error when git status --porcelain has uncommitted changes', () => {
      mockExecFileSync.mockReturnValue(' M src/cli/merge-track.ts\n?? untracked.txt');
      expect(() => verifyWorkingTreeClean(tmpDir)).toThrow(/Working directory is not clean/);
    });
  });

  describe('mergeTrack with dynamic target and trailers', () => {
    it('merges into resolved target branch and embeds Swarm trailer and Oracle verdict', async () => {
      const scDir = path.join(tmpDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });
      fs.writeFileSync(
        path.join(scDir, 'tech-stack.md'),
        '# Tech Stack\n\n## Development Preferences\n- **Target Branch:** `dev`\n',
        'utf8'
      );

      const { SignOffGate } = await import('../../src/orchestration/sign-off-gate.js');
      vi.spyOn(SignOffGate, 'isApproved').mockResolvedValue(true);

      const executedCommands: Array<{ cmd: string; args: string[] }> = [];
      mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
        executedCommands.push({ cmd, args: (args as string[]) || [] });
        if (args && args.includes('status')) return '';
        if (args && args.includes('HEAD')) return 'a1b2c3d';
        return '';
      });

      const result = await mergeTrack('track/feature-x', ['rev-sec', 'rev-corr'], {
        workspaceRoot: tmpDir,
        trackId: 'feature-x',
        sessionId: 'sess-123',
        oracleVerdict: 'READY',
      });

      expect(result.targetBranch).toBe('dev');
      expect(result.trailer).toContain('rev-sec,rev-corr');
      expect(result.mergeCommitSha).toBe('a1b2c3d');

      const mergeInvocation = executedCommands.find(c => c.args && c.args.includes('merge'));
      expect(mergeInvocation).toBeDefined();
      expect(mergeInvocation?.args).toContain('--no-ff');
      expect(mergeInvocation?.args).toContain('track/feature-x');

      // Check message content
      const msgIndex = mergeInvocation?.args.indexOf('-m');
      expect(msgIndex).toBeGreaterThan(-1);
      const commitMessage = mergeInvocation?.args[msgIndex! + 1];
      expect(commitMessage).toContain('Merge track/feature-x into dev');
      expect(commitMessage).toContain('Swarm-Authorized: true | reviewers: rev-sec,rev-corr');
      expect(commitMessage).toContain('Oracle-Verdict: READY');
    });

    it('accepts explicit targetBranch option overriding tech-stack.md', async () => {
      const scDir = path.join(tmpDir, 'superconductor');
      fs.mkdirSync(scDir, { recursive: true });
      fs.writeFileSync(
        path.join(scDir, 'tech-stack.md'),
        '# Tech Stack\n\n## Development Preferences\n- **Target Branch:** `main`\n',
        'utf8'
      );

      const { SignOffGate } = await import('../../src/orchestration/sign-off-gate.js');
      vi.spyOn(SignOffGate, 'isApproved').mockResolvedValue(true);

      mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
        if (args && args.includes('status')) return '';
        if (args && args.includes('HEAD')) return 'c3d4e5f';
        return '';
      });

      const result = await mergeTrack('track/feature-y', ['rev-1', 'rev-2'], {
        workspaceRoot: tmpDir,
        trackId: 'feature-y',
        sessionId: 'sess-456',
        targetBranch: 'release-2026',
        skipCleanCheck: true,
      });

      expect(result.targetBranch).toBe('release-2026');
      expect(result.mergeCommitSha).toBe('c3d4e5f');
    });

    it('returns dryRun result without executing git checkout or git merge', async () => {
      const { SignOffGate } = await import('../../src/orchestration/sign-off-gate.js');
      vi.spyOn(SignOffGate, 'isApproved').mockResolvedValue(true);

      const executedCommands: Array<{ cmd: string; args: string[] }> = [];
      mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
        executedCommands.push({ cmd, args: (args as string[]) || [] });
        return '';
      });

      const result = await mergeTrack('track/feature-z', ['rev-1'], {
        workspaceRoot: tmpDir,
        trackId: 'feature-z',
        sessionId: 'sess-789',
        dryRun: true,
      });

      expect(result.mergeCommitSha).toBe('dry-run');
      expect(result.targetBranch).toBe('main');
      expect(result.trailer).toContain('rev-1');
      expect(executedCommands.some(c => c.args && c.args.includes('merge'))).toBe(false);
    });

    it('throws error when branch name has invalid characters', async () => {
      await expect(
        mergeTrack('track/bad branch;rm -rf', ['rev-1'], { workspaceRoot: tmpDir })
      ).rejects.toThrow(/Invalid branch name/);
    });
  });
});
