import { describe, it, expect } from 'vitest';
import {
  QuorumCompositionResolver,
  resolveQuorum,
  isUiFile,
  isSecurityFile,
  isCodeFile,
  isCopyFile,
  CANONICAL_5_SEAT_QUORUM,
  SHORT_5_SEAT_QUORUM,
} from './quorum-composition-resolver.js';

describe('QuorumCompositionResolver', () => {
  const resolver = new QuorumCompositionResolver();

  describe('Existing resolve() method compatibility', () => {
    it('always includes regression-reviewer regardless of input', () => {
      const emptyPanel = resolver.resolve();
      expect(emptyPanel).toContain('regression-reviewer');

      const backendOnly = resolver.resolve({ files: ['src/db/repo.ts'], isMultiFile: false });
      expect(backendOnly).toContain('regression-reviewer');

      const frontendOnly = resolver.resolve({ files: ['src/ui/button.tsx'], isMultiFile: false });
      expect(frontendOnly).toContain('regression-reviewer');
    });

    it('includes ux-reviewer when frontend files are modified', () => {
      const panel = resolver.resolve({ files: ['packages/ui/src/Modal.tsx'], isMultiFile: false });
      expect(panel).toContain('ux-reviewer');
      expect(panel).toEqual([
        'security-reviewer',
        'correctness-reviewer',
        'adversarial-reviewer',
        'regression-reviewer',
        'ux-reviewer',
      ]);
    });

    it('includes ux-reviewer when copy/doc files are modified', () => {
      const panel = resolver.resolve({ files: ['docs/guide.md'], isMultiFile: false });
      expect(panel).toContain('ux-reviewer');
    });

    it('includes ux-reviewer when domain is frontend or copy', () => {
      const frontendDomain = resolver.resolve({ domains: ['frontend'] });
      expect(frontendDomain).toContain('ux-reviewer');

      const copyDomain = resolver.resolve({ domains: ['copy'] });
      expect(copyDomain).toContain('ux-reviewer');
    });

    it('defaults to full 5-reviewer panel for multi-file changes', () => {
      const panel = resolver.resolve({ files: ['src/api/user.ts', 'src/db/user.ts'] });
      expect(panel).toHaveLength(5);
      expect(panel).toContain('ux-reviewer');
      expect(panel).toContain('regression-reviewer');
    });

    it('omits ux-reviewer for single non-frontend, non-copy file without UI keywords', () => {
      const panel = resolver.resolve({ files: ['src/core/math.ts'], isMultiFile: false });
      expect(panel).toHaveLength(4);
      expect(panel).not.toContain('ux-reviewer');
      expect(panel).toContain('regression-reviewer');
    });

    it('triggers ux-reviewer when intent mentions UI/UX or copy adjustments', () => {
      const panel = resolver.resolve({
        files: ['src/handler.ts'],
        isMultiFile: false,
        intent: 'Update terminal banner and error message phrasing',
      });
      expect(panel).toContain('ux-reviewer');
    });

    it('works via static resolve helper', () => {
      const panel = QuorumCompositionResolver.resolve({ domains: ['copy'] });
      expect(panel).toContain('ux-reviewer');
      expect(panel).toContain('regression-reviewer');
    });
  });

  describe('resolveQuorum() Invariants', () => {
    describe('Invariant 1: RegressionReviewer is ALWAYS included (omnipresent)', () => {
      it('includes regression-reviewer when files list is empty', () => {
        const panel = QuorumCompositionResolver.resolveQuorum([]);
        expect(panel).toContain('regression-reviewer');
      });

      it('includes regression-reviewer for non-code documentation changes', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['README.md']);
        expect(panel).toContain('regression-reviewer');
      });

      it('includes regression-reviewer for single backend code changes', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/algorithms/fib.ts']);
        expect(panel).toContain('regression-reviewer');
      });

      it('includes regression-reviewer for pure stylesheet changes', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/styles/theme.css']);
        expect(panel).toContain('regression-reviewer');
      });

      it('includes regression in short format when requested', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['README.md'], { shortNames: true });
        expect(panel).toContain('regression');
      });
    });

    describe('Invariant 2: UxReviewer (ux-reviewer) is mandatory for UI and copy files', () => {
      it('mandates ux-reviewer for *.tsx files', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/components/Dialog.tsx']);
        expect(panel).toContain('ux-reviewer');
      });

      it('mandates ux-reviewer for *.jsx files', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/views/Feed.jsx']);
        expect(panel).toContain('ux-reviewer');
      });

      it('mandates ux-reviewer for *.vue files', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/App.vue']);
        expect(panel).toContain('ux-reviewer');
      });

      it('mandates ux-reviewer for *.svelte files', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/Sidebar.svelte']);
        expect(panel).toContain('ux-reviewer');
      });

      it('mandates ux-reviewer for *.css and *.scss files', () => {
        const cssPanel = QuorumCompositionResolver.resolveQuorum(['src/main.css']);
        expect(cssPanel).toContain('ux-reviewer');

        const scssPanel = QuorumCompositionResolver.resolveQuorum(['src/variables.scss']);
        expect(scssPanel).toContain('ux-reviewer');
      });

      it('mandates ux-reviewer for *.html files', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['public/index.html']);
        expect(panel).toContain('ux-reviewer');
      });

      it('mandates ux-reviewer for locales/ directory files', () => {
        const panel1 = QuorumCompositionResolver.resolveQuorum(['locales/en.json']);
        expect(panel1).toContain('ux-reviewer');

        const panel2 = QuorumCompositionResolver.resolveQuorum(['src/locales/fr.json']);
        expect(panel2).toContain('ux-reviewer');
      });

      it('mandates ux-reviewer for copy/text in UI components', () => {
        const panel1 = QuorumCompositionResolver.resolveQuorum(['src/ui/copy.ts']);
        expect(panel1).toContain('ux-reviewer');

        const panel2 = QuorumCompositionResolver.resolveQuorum(['src/components/strings.json']);
        expect(panel2).toContain('ux-reviewer');
      });

      it('mandates ux-reviewer for single documentation or copy files via isCopyFile', () => {
        const readmePanel = QuorumCompositionResolver.resolveQuorum(['README.md']);
        expect(readmePanel).toContain('ux-reviewer');

        const docsPanel = QuorumCompositionResolver.resolveQuorum(['docs/guide.md']);
        expect(docsPanel).toContain('ux-reviewer');

        const textPanel = QuorumCompositionResolver.resolveQuorum(['notes.txt']);
        expect(textPanel).toContain('ux-reviewer');
      });

      it('includes ux-reviewer when options.hasUiChanges is explicitly set', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/data.bin'], {
          hasUiChanges: true,
        });
        expect(panel).toContain('ux-reviewer');
      });
    });

    describe('Invariant 3: SecurityReviewer is included for auth, network, storage, env, or API files', () => {
      it('includes security-reviewer for auth files', () => {
        const authPanel = QuorumCompositionResolver.resolveQuorum(['src/auth/jwt-service.ts']);
        expect(authPanel).toContain('security-reviewer');

        const loginPanel = QuorumCompositionResolver.resolveQuorum(['src/login-controller.ts']);
        expect(loginPanel).toContain('security-reviewer');

        const rbacPanel = QuorumCompositionResolver.resolveQuorum(['src/rbac-permissions.ts']);
        expect(rbacPanel).toContain('security-reviewer');
      });

      it('includes security-reviewer for network files', () => {
        const netPanel = QuorumCompositionResolver.resolveQuorum(['src/network/http-client.ts']);
        expect(netPanel).toContain('security-reviewer');

        const socketPanel = QuorumCompositionResolver.resolveQuorum(['src/websocket-handler.ts']);
        expect(socketPanel).toContain('security-reviewer');
      });

      it('includes security-reviewer for storage and database files', () => {
        const dbPanel = QuorumCompositionResolver.resolveQuorum(['src/db/connection.ts']);
        expect(dbPanel).toContain('security-reviewer');

        const redisPanel = QuorumCompositionResolver.resolveQuorum(['src/redis-cache.ts']);
        expect(redisPanel).toContain('security-reviewer');
      });

      it('includes security-reviewer for env files', () => {
        const envPanel = QuorumCompositionResolver.resolveQuorum(['.env.production']);
        expect(envPanel).toContain('security-reviewer');

        const configEnvPanel = QuorumCompositionResolver.resolveQuorum(['src/config/env.ts']);
        expect(configEnvPanel).toContain('security-reviewer');
      });

      it('includes security-reviewer for API route and controller files', () => {
        const apiPanel = QuorumCompositionResolver.resolveQuorum(['src/api/v1/users.ts']);
        expect(apiPanel).toContain('security-reviewer');

        const routePanel = QuorumCompositionResolver.resolveQuorum(['src/routes/billing.ts']);
        expect(routePanel).toContain('security-reviewer');
      });

      it('includes security-reviewer when options.hasSecurityImpact is true', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/utils.ts'], {
          hasSecurityImpact: true,
        });
        expect(panel).toContain('security-reviewer');
      });
    });

    describe('Invariant 4: CorrectnessReviewer and AdversarialReviewer for code/logic changes', () => {
      it('includes correctness and adversarial for TypeScript code', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/algorithms/sorter.ts']);
        expect(panel).toContain('correctness-reviewer');
        expect(panel).toContain('adversarial-reviewer');
        expect(panel).not.toContain('security-reviewer');
        expect(panel).not.toContain('ux-reviewer');
      });

      it('includes correctness and adversarial for Python code', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['scripts/runner.py']);
        expect(panel).toContain('correctness-reviewer');
        expect(panel).toContain('adversarial-reviewer');
      });

      it('includes correctness and adversarial for Go/Rust code', () => {
        const goPanel = QuorumCompositionResolver.resolveQuorum(['daemon/main.go']);
        expect(goPanel).toContain('correctness-reviewer');
        expect(goPanel).toContain('adversarial-reviewer');

        const rsPanel = QuorumCompositionResolver.resolveQuorum(['engine/lib.rs']);
        expect(rsPanel).toContain('correctness-reviewer');
        expect(rsPanel).toContain('adversarial-reviewer');
      });

      it('omits correctness and adversarial for pure CSS styling files', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/styles.css']);
        expect(panel).toContain('regression-reviewer');
        expect(panel).toContain('ux-reviewer');
        expect(panel).not.toContain('correctness-reviewer');
        expect(panel).not.toContain('adversarial-reviewer');
      });

      it('omits correctness and adversarial for markdown documentation files', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['docs/architecture.md']);
        expect(panel).toContain('regression-reviewer');
        expect(panel).not.toContain('correctness-reviewer');
        expect(panel).not.toContain('adversarial-reviewer');
      });

      it('includes correctness and adversarial when options.hasCodeChanges is true', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['README.md'], {
          hasCodeChanges: true,
        });
        expect(panel).toContain('correctness-reviewer');
        expect(panel).toContain('adversarial-reviewer');
      });
    });

    describe('Invariant 5: Full 5-seat quorum for multiple files or cross-cutting changes', () => {
      it('returns full 5-seat quorum for multiple files', () => {
        const panel = QuorumCompositionResolver.resolveQuorum([
          'src/math.ts',
          'src/helpers.ts',
        ]);
        expect(panel).toHaveLength(5);
        expect(panel).toEqual(CANONICAL_5_SEAT_QUORUM);
      });

      it('returns full 5-seat quorum when crossCutting option is true', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['src/math.ts'], {
          crossCutting: true,
        });
        expect(panel).toHaveLength(5);
        expect(panel).toEqual(CANONICAL_5_SEAT_QUORUM);
      });

      it('returns full 5-seat quorum when forceFullQuorum option is true', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(['docs/readme.txt'], {
          forceFullQuorum: true,
        });
        expect(panel).toHaveLength(5);
        expect(panel).toEqual(CANONICAL_5_SEAT_QUORUM);
      });

      it('returns full 5-seat quorum in short format when requested', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(
          ['src/math.ts', 'src/helpers.ts'],
          { format: 'short' }
        );
        expect(panel).toEqual(SHORT_5_SEAT_QUORUM);
        expect(panel).toEqual(['security', 'correctness', 'adversarial', 'regression', 'ux']);
      });

      it('returns full 5-seat quorum in short format with shortNames flag', () => {
        const panel = QuorumCompositionResolver.resolveQuorum(
          ['src/math.ts', 'src/helpers.ts'],
          { shortNames: true }
        );
        expect(panel).toEqual(SHORT_5_SEAT_QUORUM);
      });
    });

    describe('Standalone resolveQuorum helper function', () => {
      it('executes equivalently to QuorumCompositionResolver.resolveQuorum', () => {
        const res1 = resolveQuorum(['src/components/Header.tsx']);
        const res2 = QuorumCompositionResolver.resolveQuorum(['src/components/Header.tsx']);
        expect(res1).toEqual(res2);
      });
    });

    describe('Helper predicate functions', () => {
      it('correctly classifies isUiFile', () => {
        expect(isUiFile('src/Button.tsx')).toBe(true);
        expect(isUiFile('src/Button.jsx')).toBe(true);
        expect(isUiFile('src/app.vue')).toBe(true);
        expect(isUiFile('src/app.svelte')).toBe(true);
        expect(isUiFile('src/styles.css')).toBe(true);
        expect(isUiFile('src/theme.scss')).toBe(true);
        expect(isUiFile('public/index.html')).toBe(true);
        expect(isUiFile('locales/en.json')).toBe(true);
        expect(isUiFile('src/ui/copy.ts')).toBe(true);
        expect(isUiFile('src/math.ts')).toBe(false);
      });

      it('correctly classifies isSecurityFile', () => {
        expect(isSecurityFile('src/auth.ts')).toBe(true);
        expect(isSecurityFile('src/jwt.ts')).toBe(true);
        expect(isSecurityFile('src/network/client.ts')).toBe(true);
        expect(isSecurityFile('src/db/repo.ts')).toBe(true);
        expect(isSecurityFile('.env')).toBe(true);
        expect(isSecurityFile('src/api/users.ts')).toBe(true);
        expect(isSecurityFile('src/ui/button.tsx')).toBe(false);
      });

      it('correctly classifies isCodeFile', () => {
        expect(isCodeFile('src/index.ts')).toBe(true);
        expect(isCodeFile('src/script.py')).toBe(true);
        expect(isCodeFile('src/main.go')).toBe(true);
        expect(isCodeFile('package.json')).toBe(true);
        expect(isCodeFile('styles.css')).toBe(false);
        expect(isCodeFile('README.md')).toBe(false);
      });

      it('correctly classifies isCopyFile', () => {
        expect(isCopyFile('README.md')).toBe(true);
        expect(isCopyFile('docs/guide.markdown')).toBe(true);
        expect(isCopyFile('notes.txt')).toBe(true);
        expect(isCopyFile('locales/en.po')).toBe(true);
        expect(isCopyFile('content/intro.json')).toBe(true);
        expect(isCopyFile('src/index.ts')).toBe(false);
      });
    });
  });
});
