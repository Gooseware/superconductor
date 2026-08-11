import { describe, it, expect, vi } from 'vitest';
import * as cp from 'child_process';
import {
  WorkspaceGuard,
  ShellRunner,
  BranchMismatchError,
  TypeScriptError,
  UnauthorizedMergeError
} from './workspace-guard.js';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof cp>();
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

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
    it('triggers finding when array content in MockFeedService.ts is directly replaced', async () => {
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('main', mockShell);

      const diffContent = `
diff --git a/MockFeedService.ts b/MockFeedService.ts
--- a/MockFeedService.ts
+++ b/MockFeedService.ts
@@ -1,7 +1,3 @@
-export const mockItems = [
-  { id: 1, name: 'Item 1' },
-  { id: 2, name: 'Item 2' },
-  { id: 3, name: 'Item 3' }
-];
+export const mockItems = [{ id: 99, name: 'Replaced' }];
`;

      const findings = await guard.detectSharedSingletonOverwrite(['MockFeedService.ts'], diffContent);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toContain('MockFeedService.ts');
    });

    it('does not trigger finding when MockFeedService.ts is imported in another file', async () => {
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('main', mockShell);

      const diffContent = `
diff --git a/ConsumerComponent.ts b/ConsumerComponent.ts
--- a/ConsumerComponent.ts
+++ b/ConsumerComponent.ts
@@ -1,5 +1,2 @@
-import { mockItems } from './MockFeedService.ts';
-import { item1 } from './MockFeedService.ts';
-import { item2 } from './MockFeedService.ts';
-import { item3 } from './MockFeedService.ts';
+import { mockItems } from './MockFeedService.ts';
`;

      const findings = await guard.detectSharedSingletonOverwrite(['MockFeedService.ts'], diffContent);
      expect(findings).toEqual([]);
    });

    it('returns zero false positive findings for cross-file import reference diffs', async () => {
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('main', mockShell);

      const diffContent = `
diff --git a/src/services/ConsumerService.ts b/src/services/ConsumerService.ts
--- a/src/services/ConsumerService.ts
+++ b/src/services/ConsumerService.ts
@@ -1,10 +1,2 @@
-import { MockFeedService } from './MockFeedService.ts';
-const line1 = 1;
-const line2 = 2;
-const line3 = 3;
-const line4 = 4;
+import { MockFeedService } from './MockFeedService.ts';
`;

      const findings = await guard.detectSharedSingletonOverwrite(['MockFeedService.ts'], diffContent);
      expect(findings).toEqual([]);
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
      vi.mocked(cp.execFileSync).mockReturnValue('track/feature-1' as any);
      const mockShell: ShellRunner = {
        exec: vi.fn().mockImplementation(async (cmd: string) => {
          if (cmd === 'git branch --show-current') {
            return { stdout: 'track/feature-1\n', stderr: '', exitCode: 0 };
          }
          if (cmd.includes('tsc')) {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        })
      };
      const guard = new WorkspaceGuard('track/feature-1', mockShell);

      await expect(guard.commitToMain({ trailerPresent: true })).resolves.toBeUndefined();
    });

    it('throws UnauthorizedMergeError when called from main branch', async () => {
      vi.mocked(cp.execFileSync).mockReturnValue('main' as any);
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('track/feature-1', mockShell);

      await expect(guard.commitToMain({ trailerPresent: true })).rejects.toThrow(
        'commitToMain must be called from a track branch, not from main'
      );
    });

    it('throws UnauthorizedMergeError when called from master branch', async () => {
      vi.mocked(cp.execFileSync).mockReturnValue('master' as any);
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('track/feature-1', mockShell);

      await expect(guard.commitToMain({ trailerPresent: true })).rejects.toThrow(UnauthorizedMergeError);
    });

    it('throws SignOffRequiredError when called with trackId and sessionId without signoff', async () => {
      vi.mocked(cp.execFileSync).mockReturnValue('track/feature-1' as any);
      const mockShell: ShellRunner = { exec: vi.fn() };
      const guard = new WorkspaceGuard('track/feature-1', mockShell);

      await expect(guard.commitToMain('track-no-signoff', 'sess-123')).rejects.toThrow();
    });

    it('implements AbstractGate check() method', async () => {
      const mockShell: ShellRunner = {
        exec: vi.fn().mockImplementation(async (cmd: string) => {
          if (cmd === 'git branch --show-current') return { stdout: 'main\n', stderr: '', exitCode: 0 };
          if (cmd.includes('tsc')) return { stdout: '', stderr: '', exitCode: 0 };
          return { stdout: '', stderr: '', exitCode: 0 };
        })
      };
      const guard = new WorkspaceGuard('main', mockShell);
      const res = await guard.check({ trackId: 't1', sessionId: 's1' });
      expect(res.passed).toBe(true);
    });
  });
});
