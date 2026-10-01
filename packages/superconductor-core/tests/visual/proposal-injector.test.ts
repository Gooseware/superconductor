import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProposalInjector } from '../../src/visual/proposal-injector.js';
import { VitePreviewHarness } from '../../src/visual/vite-harness.js';
import type { ProposalPatch } from '../../src/visual/surface-adapter.js';

describe('ProposalInjector', () => {
  let harness: VitePreviewHarness;
  let injector: ProposalInjector;

  beforeEach(() => {
    harness = new VitePreviewHarness();
    injector = new ProposalInjector();
  });

  afterEach(async () => {
    if (harness.isAlive()) {
      await harness.stop();
    }
  });

  describe('Initial State', () => {
    it('should have initial current state and empty history', () => {
      expect(injector.getActiveProposal()).toBeNull();
      expect(injector.getABState()).toBe('current');
      expect(injector.getHistory()).toEqual([]);
      expect(injector.getAllDiffs()).toEqual([]);
      expect(injector.getDiff()).toBeNull();
    });
  });

  describe('applyProposal', () => {
    it('should apply proposal to unconfigured harness and set virtual entry module', async () => {
      const patch: ProposalPatch = {
        id: 'patch-button-pill',
        title: 'Transform button into pill style',
        targetFilePath: '/src/components/Button.tsx',
        cssDelta: '.btn-pill { border-radius: 9999px; }',
        jsxReplacement: '() => React.createElement("button", { className: "btn-pill" }, "Pill Button")',
        injectedProps: { variant: 'pill', size: 'lg' },
      };

      const result = await injector.applyProposal(harness, patch);

      expect(result.activeProposalId).toBe('patch-button-pill');
      expect(result.aBState).toBe('proposal');

      expect(injector.getActiveProposal()).toEqual(patch);
      expect(injector.getABState()).toBe('proposal');

      // Verify harness in-memory virtual state
      const current = harness.getCurrentComponent();
      expect(current?.componentPath).toBe('/src/components/Button.tsx');
      expect(current?.patch).toEqual(patch);

      // Verify virtual module content without disk writes
      const virtualCode = harness.getVirtualModuleContent();
      expect(virtualCode).toContain('.btn-pill { border-radius: 9999px; }');
      expect(virtualCode).toContain('const JsxReplacement = () => React.createElement("button", { className: "btn-pill" }, "Pill Button");');
      expect(virtualCode).toContain('variant');
    });

    it('should preserve existing harness mockProps when applying a proposal', async () => {
      harness.setVirtualComponent('/src/components/Card.tsx', {
        title: 'Original Title',
        elevation: 2,
      });

      const patch: ProposalPatch = {
        id: 'patch-card-shadow',
        title: 'Add colored drop shadow',
        targetFilePath: '/src/components/Card.tsx',
        cssDelta: '.card { box-shadow: 0 10px 15px rgba(99, 102, 241, 0.3); }',
        injectedProps: { elevation: 4, hasBorder: true },
      };

      await injector.applyProposal(harness, patch);

      const virtualCode = harness.getVirtualModuleContent();
      expect(virtualCode).toContain('baseProps = {"title":"Original Title","elevation":2}');
      expect(virtualCode).toContain('patchProps = {"elevation":4,"hasBorder":true}');
    });

    it('should compute and record proposal diff', async () => {
      const patch: ProposalPatch = {
        id: 'patch-input-focus',
        title: 'Add focus-visible outline',
        targetFilePath: '/src/components/Input.tsx',
        cssDelta: 'input:focus-visible { outline: 2px solid #3b82f6; }',
        injectedProps: { placeholder: 'Search components...' },
      };

      await injector.applyProposal(harness, patch);

      const diff = injector.getDiff('patch-input-focus');
      expect(diff).not.toBeNull();
      expect(diff?.proposalId).toBe('patch-input-focus');
      expect(diff?.targetFilePath).toBe('/src/components/Input.tsx');
      expect(diff?.hasCssDelta).toBe(true);
      expect(diff?.hasJsxReplacement).toBe(false);
      expect(diff?.propsChanged).toContain('placeholder');
      expect(diff?.cssDelta).toBe(patch.cssDelta);
    });

    it('should reject invalid proposal patch with missing required fields', async () => {
      const invalidPatch = {
        id: '',
        title: 'Missing target',
        targetFilePath: '',
      } as ProposalPatch;

      await expect(injector.applyProposal(harness, invalidPatch)).rejects.toThrow();
    });

    it('should handle sequential proposals, marking earlier proposals inactive in history', async () => {
      const patch1: ProposalPatch = {
        id: 'patch-v1',
        title: 'First iteration',
        targetFilePath: '/src/App.tsx',
        cssDelta: '.body { background: #111; }',
      };

      const patch2: ProposalPatch = {
        id: 'patch-v2',
        title: 'Second iteration',
        targetFilePath: '/src/App.tsx',
        cssDelta: '.body { background: #222; }',
      };

      await injector.applyProposal(harness, patch1);
      await injector.applyProposal(harness, patch2);

      expect(injector.getActiveProposal()?.id).toBe('patch-v2');

      const history = injector.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].id).toBe('patch-v1');
      expect(history[0].status).toBe('inactive');
      expect(history[1].id).toBe('patch-v2');
      expect(history[1].status).toBe('active');
    });
  });

  describe('toggleAB', () => {
    it('should toggle from proposal to current and revert virtual preview content', async () => {
      harness.setVirtualComponent('/src/Badge.tsx', { label: 'Baseline' });

      const patch: ProposalPatch = {
        id: 'patch-badge-red',
        title: 'Red alert badge',
        targetFilePath: '/src/Badge.tsx',
        cssDelta: '.badge { background-color: #ef4444; }',
      };

      await injector.applyProposal(harness, patch);
      expect(injector.getABState()).toBe('proposal');
      expect(harness.getVirtualModuleContent()).toContain('.badge { background-color: #ef4444; }');

      // Toggle to current
      const state = await injector.toggleAB(harness, 'current');
      expect(state).toBe('current');
      expect(injector.getABState()).toBe('current');

      // Virtual module content should now be clean of the patch
      const currentCode = harness.getVirtualModuleContent();
      expect(currentCode).not.toContain('.badge { background-color: #ef4444; }');
      expect(currentCode).toContain('import TargetComponent from "/src/Badge.tsx";');
    });

    it('should toggle back from current to proposal and restore active patch', async () => {
      harness.setVirtualComponent('/src/Badge.tsx', { label: 'Baseline' });

      const patch: ProposalPatch = {
        id: 'patch-badge-green',
        title: 'Green success badge',
        targetFilePath: '/src/Badge.tsx',
        cssDelta: '.badge { background-color: #10b981; }',
      };

      await injector.applyProposal(harness, patch);
      await injector.toggleAB(harness, 'current');

      // Toggle back to proposal
      const state = await injector.toggleAB(harness, 'proposal');
      expect(state).toBe('proposal');
      expect(injector.getABState()).toBe('proposal');

      const proposalCode = harness.getVirtualModuleContent();
      expect(proposalCode).toContain('.badge { background-color: #10b981; }');
    });

    it('should throw an error when toggling to proposal if no active proposal exists', async () => {
      await expect(injector.toggleAB(harness, 'proposal')).rejects.toThrow(
        /No active proposal to toggle to/
      );
    });

    it('should throw an error if an invalid state is passed', async () => {
      // @ts-expect-error testing runtime validation
      await expect(injector.toggleAB(harness, 'invalid_state')).rejects.toThrow(
        /Invalid A\/B state/
      );
    });
  });

  describe('revertProposal', () => {
    it('should reset virtual component and mark proposal as reverted in history', async () => {
      harness.setVirtualComponent('/src/Nav.tsx', { brand: 'Superconductor' });

      const patch: ProposalPatch = {
        id: 'patch-nav-sticky',
        title: 'Sticky navigation bar',
        targetFilePath: '/src/Nav.tsx',
        cssDelta: 'nav { position: sticky; top: 0; }',
      };

      await injector.applyProposal(harness, patch);
      expect(injector.getActiveProposal()).not.toBeNull();

      await injector.revertProposal(harness);

      expect(injector.getActiveProposal()).toBeNull();
      expect(injector.getABState()).toBe('current');

      // Verify harness code has no patch
      const code = harness.getVirtualModuleContent();
      expect(code).not.toContain('position: sticky');

      // History should indicate reverted
      const history = injector.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].id).toBe('patch-nav-sticky');
      expect(history[0].status).toBe('reverted');
      expect(history[0].aBState).toBe('current');
    });

    it('should safely handle revert when no proposal is active', async () => {
      await expect(injector.revertProposal(harness)).resolves.toBeUndefined();
      expect(injector.getActiveProposal()).toBeNull();
    });
  });

  describe('History and Diff Tracking', () => {
    it('should retrieve diffs by ID and list all diffs', async () => {
      const patch1: ProposalPatch = {
        id: 'diff-test-1',
        title: 'Test 1',
        targetFilePath: '/src/A.tsx',
        cssDelta: 'body { color: red; }',
      };
      const patch2: ProposalPatch = {
        id: 'diff-test-2',
        title: 'Test 2',
        targetFilePath: '/src/B.tsx',
        jsxReplacement: '() => null',
      };

      await injector.applyProposal(harness, patch1);
      await injector.applyProposal(harness, patch2);

      const allDiffs = injector.getAllDiffs();
      expect(allDiffs.length).toBe(2);

      const diff1 = injector.getDiff('diff-test-1');
      expect(diff1?.hasCssDelta).toBe(true);
      expect(diff1?.hasJsxReplacement).toBe(false);

      const diff2 = injector.getDiff('diff-test-2');
      expect(diff2?.hasCssDelta).toBe(false);
      expect(diff2?.hasJsxReplacement).toBe(true);
    });

    it('should clear history and diffs on clearHistory', async () => {
      const patch: ProposalPatch = {
        id: 'patch-clear',
        title: 'Clear test',
        targetFilePath: '/src/C.tsx',
      };

      await injector.applyProposal(harness, patch);
      expect(injector.getHistory().length).toBe(1);
      expect(injector.getAllDiffs().length).toBe(1);

      injector.clearHistory();

      expect(injector.getHistory()).toEqual([]);
      expect(injector.getAllDiffs()).toEqual([]);
    });
  });
});
