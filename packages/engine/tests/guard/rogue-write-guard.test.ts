import { describe, it, expect } from 'vitest';
import { RogueWriteGuard, RogueWriteAttemptError, DEFAULT_PROTECTED_PATTERNS } from '../../src/guard/rogue-write-guard.js';

describe('RogueWriteGuard', () => {
  describe('assertWriteAllowed — role: root (default patterns)', () => {
    it('throws RogueWriteAttemptError when root writes to packages/engine/src/foo.ts', () => {
      const guard = new RogueWriteGuard('root');
      expect(() => guard.assertWriteAllowed('packages/engine/src/foo.ts')).toThrow(RogueWriteAttemptError);
    });

    it('does NOT throw when processor writes to packages/engine/src/foo.ts', () => {
      const guard = new RogueWriteGuard('processor');
      expect(() => guard.assertWriteAllowed('packages/engine/src/foo.ts')).not.toThrow();
    });

    it('error message exactly equals the canonical Superconductor message', () => {
      const guard = new RogueWriteGuard('root');
      let err: RogueWriteAttemptError | undefined;
      try {
        guard.assertWriteAllowed('packages/engine/src/foo.ts');
      } catch (e) {
        err = e as RogueWriteAttemptError;
      }
      expect(err).toBeDefined();
      expect(err!.message).toBe(
        '[Superconductor] Rogue write attempt detected. Aborting. I must dispatch a Processor subagent instead.'
      );
    });

    it('throws RogueWriteAttemptError when root writes to app/routes/sign-in.tsx', () => {
      const guard = new RogueWriteGuard('root');
      expect(() => guard.assertWriteAllowed('app/routes/sign-in.tsx')).toThrow(RogueWriteAttemptError);
    });

    it('does NOT throw when root writes to superconductor/tracks.md (not a protected path)', () => {
      const guard = new RogueWriteGuard('root');
      expect(() => guard.assertWriteAllowed('superconductor/tracks.md')).not.toThrow();
    });

    it('does NOT throw when root writes to packages/engine/tests/foo.test.ts (tests not protected)', () => {
      const guard = new RogueWriteGuard('root');
      expect(() => guard.assertWriteAllowed('packages/engine/tests/foo.test.ts')).not.toThrow();
    });

    it('throws for deep nested protected path packages/engine/src/cli/deep/nested/file.ts', () => {
      const guard = new RogueWriteGuard('root');
      expect(() => guard.assertWriteAllowed('packages/engine/src/cli/deep/nested/file.ts')).toThrow(RogueWriteAttemptError);
    });
  });

  describe('RogueWriteAttemptError prototype chain', () => {
    it('instanceof RogueWriteAttemptError works correctly (prototype chain)', () => {
      const guard = new RogueWriteGuard('root');
      let err: unknown;
      try {
        guard.assertWriteAllowed('packages/engine/src/foo.ts');
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(RogueWriteAttemptError);
      expect(err).toBeInstanceOf(Error);
    });

    it('error.attemptedPath and error.role are set correctly', () => {
      const guard = new RogueWriteGuard('root');
      let err: RogueWriteAttemptError | undefined;
      try {
        guard.assertWriteAllowed('packages/engine/src/foo.ts');
      } catch (e) {
        err = e as RogueWriteAttemptError;
      }
      expect(err!.attemptedPath).toBe('packages/engine/src/foo.ts');
      expect(err!.role).toBe('root');
    });

    it('error.name is RogueWriteAttemptError', () => {
      const guard = new RogueWriteGuard('root');
      let err: RogueWriteAttemptError | undefined;
      try {
        guard.assertWriteAllowed('packages/engine/src/foo.ts');
      } catch (e) {
        err = e as RogueWriteAttemptError;
      }
      expect(err!.name).toBe('RogueWriteAttemptError');
    });
  });

  describe('custom protectedPatterns option', () => {
    it('custom protectedPatterns overrides defaults', () => {
      const guard = new RogueWriteGuard('root', { protectedPatterns: ['custom/**'] });
      // Should NOT throw for a default-protected path since defaults are overridden
      expect(() => guard.assertWriteAllowed('packages/engine/src/foo.ts')).not.toThrow();
      // Should throw for the custom pattern
      expect(() => guard.assertWriteAllowed('custom/some/file.ts')).toThrow(RogueWriteAttemptError);
    });

    it('custom protectedPatterns with empty array allows all writes for root', () => {
      const guard = new RogueWriteGuard('root', { protectedPatterns: [] });
      expect(() => guard.assertWriteAllowed('packages/engine/src/foo.ts')).not.toThrow();
      expect(() => guard.assertWriteAllowed('app/routes/anything.ts')).not.toThrow();
    });
  });

  describe('constructor — workspaceDir validation', () => {
    it('throws Error with "filesystem root" when workspaceDir is "/"', () => {
      expect(() => new RogueWriteGuard('root', { workspaceDir: '/' })).toThrow(Error);
      expect(() => new RogueWriteGuard('root', { workspaceDir: '/' })).toThrow('filesystem root');
    });

    it('does NOT throw when workspaceDir is a valid project root', () => {
      expect(() => new RogueWriteGuard('root', { workspaceDir: '/home/user/project' })).not.toThrow();
    });
  });

  describe('assertWriteAllowed — paths escaping workspace (Layer 2)', () => {
    it('throws RogueWriteAttemptError when root writes to an absolute path outside the workspace', () => {
      const guard = new RogueWriteGuard('root', { workspaceDir: '/home/user/project' });
      expect(() => guard.assertWriteAllowed('/absolute/path/outside/workspace')).toThrow(RogueWriteAttemptError);
    });

    it('throws RogueWriteAttemptError when root uses path traversal to escape workspace', () => {
      const guard = new RogueWriteGuard('root', { workspaceDir: '/home/user/project' });
      expect(() => guard.assertWriteAllowed('../../etc/passwd')).toThrow(RogueWriteAttemptError);
    });

    it('does NOT throw for processor writing an outside-workspace absolute path', () => {
      const guard = new RogueWriteGuard('processor', { workspaceDir: '/home/user/project' });
      expect(() => guard.assertWriteAllowed('/absolute/path/outside/workspace')).not.toThrow();
    });
  });

  describe('DEFAULT_PROTECTED_PATTERNS export', () => {
    it('exports DEFAULT_PROTECTED_PATTERNS array with expected values', () => {
      expect(DEFAULT_PROTECTED_PATTERNS).toContain('packages/*/src/**');
      expect(DEFAULT_PROTECTED_PATTERNS).toContain('app/**');
    });

    it('is frozen and cannot be mutated', () => {
      expect(Object.isFrozen(DEFAULT_PROTECTED_PATTERNS)).toBe(true);
      expect(() => {
        (DEFAULT_PROTECTED_PATTERNS as string[]).push('hacked/**');
      }).toThrow();
    });
  });
});
