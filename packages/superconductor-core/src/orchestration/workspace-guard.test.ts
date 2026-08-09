import { describe, it, expect, vi } from 'vitest';
import {
  WorkspaceGuard,
  ShellRunner,
  BranchMismatchError,
  TypeScriptError,
  UnauthorizedMergeError
} from './workspace-guard.js';

describe('WorkspaceGuard', () => {
  describe('preCommitCheck', () => {
    it('throws BranchMismatchError when branch does not match assigned branch', async () => {
      const mockShell: ShellRunner = {
        exec: vi.fn().mockImplementation(async (cmd: string) => {
          if (cmd === 'git branch --show-current') {
            return { stdout: 'feature-branch\n', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        })
      };

      const guard = new WorkspaceGuard('main', mockShell);
      await expect(guard.preCommitCheck()).rejects.toThrow(BranchMismatchError);
    });

    it('throws TypeScriptError when tsc exits non-zero', async () => {
      const mockShell: ShellRunner = {
        exec: vi.fn().mockImplementation(async (cmd: string) => {
          if (cmd === 'git branch --show-current') {
            return { stdout: 'main\n', stderr: '', exitCode: 0 };
          }
          if (cmd.includes('tsc')) {
            return {
              stdout: 'src/index.ts(1,1): error TS2304: Cannot find name "foo".',
              stderr: '',
              exitCode: 1
            };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        })
      };

      const guard = new WorkspaceGuard('main', mockShell);
      try {
        await guard.preCommitCheck();
        expect.fail('Should have thrown TypeScriptError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(TypeScriptError);
        expect(err.tscOutput).toContain('error TS2304');
      }
    });

    it('returns { ok: true } when branch matches + tsc clean', async () => {
      const mockShell: ShellRunner = {
        exec: vi.fn().mockImplementation(async (cmd: string) => {
          if (cmd === 'git branch --show-current') {
            return { stdout: 'phase2\n', stderr: '', exitCode: 0 };
          }
          if (cmd.includes('tsc')) {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        })
      };

      const guard = new WorkspaceGuard('phase2', mockShell);
      const result = await guard.preCommitCheck();
      expect(result).toEqual({ ok: true });
    });
  });

  describe('detectSharedSingletonOverwrite', () => {
    it('returns findings for full array overwrites in shared files', async () => {
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('main', mockShell);

      const diffContent = `
diff --git a/MockFeedService.ts b/MockFeedService.ts
--- a/MockFeedService.ts
+++ b/MockFeedService.ts
@@ -1,5 +1,3 @@
-export const mockItems = [
-  { id: 1, name: 'Item 1' }
-];
+export const mockItems = [{ id: 99, name: 'Replaced' }];
`;

      const findings = await guard.detectSharedSingletonOverwrite(['MockFeedService.ts'], diffContent);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toContain('MockFeedService.ts');
    });

    it('returns empty for additive changes in shared files', async () => {
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('main', mockShell);

      const diffContent = `
diff --git a/MockFeedService.ts b/MockFeedService.ts
--- a/MockFeedService.ts
+++ b/MockFeedService.ts
@@ -5,3 +5,6 @@
 export const mockItems = [
   { id: 1, name: 'Item 1' },
+  { id: 2, name: 'Item 2' }
 ];
`;

      const findings = await guard.detectSharedSingletonOverwrite(['MockFeedService.ts'], diffContent);
      expect(findings).toEqual([]);
    });

    it('returns empty array when diff content is empty or no shared files match', async () => {
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('main', mockShell);

      const findings = await guard.detectSharedSingletonOverwrite(['MockFeedService.ts'], '');
      expect(findings).toEqual([]);

      const unrelatedDiff = `
diff --git a/OtherFile.ts b/OtherFile.ts
--- a/OtherFile.ts
+++ b/OtherFile.ts
@@ -1,1 +1,2 @@
-old line
+new line
`;
      const findings2 = await guard.detectSharedSingletonOverwrite(['MockFeedService.ts'], unrelatedDiff);
      expect(findings2).toEqual([]);
    });
  });

  describe('commitToMain', () => {
    it('throws UnauthorizedMergeError when trailerPresent is false', async () => {
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('main', mockShell);

      await expect(guard.commitToMain({ trailerPresent: false })).rejects.toThrow(UnauthorizedMergeError);
    });

    it('resolves when trailerPresent is true', async () => {
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('main', mockShell);

      await expect(guard.commitToMain({ trailerPresent: true })).resolves.toBeUndefined();
    });
  });
});
