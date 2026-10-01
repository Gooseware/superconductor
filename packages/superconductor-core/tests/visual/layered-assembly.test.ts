import { describe, it, expect } from 'vitest';
import {
  LayeredAssemblyEngine,
  ClusteredTrackCandidate,
} from '../../src/visual/layered-assembly.js';
import { SpatialAnnotation } from '../../src/visual/surface-adapter.js';
import { ExecutionPlanner } from '../../src/track/execution-planner.js';

describe('LayeredAssemblyEngine (ADR 0003)', () => {
  const engine = new LayeredAssemblyEngine();

  const tokenAnnotation1: SpatialAnnotation = {
    id: 'ann-token-1',
    viewId: 'view-settings',
    type: 'pin',
    selector: '.theme-picker',
    sourceLocation: {
      filePath: 'src/views/SettingsView.tsx',
      componentName: 'ThemePicker',
      lineNumber: 24,
    },
    geometry: { x: 50, y: 100 },
    author: 'designer@superconductor.dev',
    comment: 'Border radius and card background should use semantic tokens #token #theme',
    tags: ['token', 'theme', 'color'],
    severity: 'enhancement',
    createdAt: '2026-10-01T10:00:00Z',
  };

  const tokenAnnotation2: SpatialAnnotation = {
    id: 'ann-token-2',
    viewId: 'view-checkout',
    type: 'bounding_box',
    selector: '.checkout-summary',
    geometry: { x: 200, y: 300, width: 400, height: 150 },
    author: 'reviewer@superconductor.dev',
    comment: 'Hardcoded hex color #3b82f6 violates design system #design-system',
    tags: ['#design-system'],
    severity: 'blocker',
    createdAt: '2026-10-01T10:05:00Z',
  };

  const buttonAnnotation1: SpatialAnnotation = {
    id: 'ann-btn-1',
    viewId: 'view-checkout',
    type: 'pin',
    selector: 'button.btn-primary',
    sourceLocation: {
      filePath: 'src/components/Button.tsx',
      componentName: 'Button',
      lineNumber: 42,
    },
    geometry: { x: 120, y: 85 },
    author: 'reviewer@superconductor.dev',
    comment: 'Primary button fails WCAG AA contrast',
    tags: ['accessibility', 'wcag-aa'],
    severity: 'blocker',
    createdAt: '2026-10-01T10:10:00Z',
  };

  const buttonAnnotation2: SpatialAnnotation = {
    id: 'ann-btn-2',
    viewId: 'view-dashboard',
    type: 'pin',
    selector: 'button.btn-primary',
    sourceLocation: {
      filePath: 'src/components/Button.tsx',
      componentName: 'Button',
      lineNumber: 55,
    },
    geometry: { x: 300, y: 120 },
    author: 'designer@superconductor.dev',
    comment: 'Button focus ring is clipped in safari',
    tags: ['ui', 'focus'],
    severity: 'nitpick',
    createdAt: '2026-10-01T10:15:00Z',
  };

  const navbarAnnotation: SpatialAnnotation = {
    id: 'ann-nav-1',
    viewId: 'view-dashboard',
    type: 'bounding_box',
    selector: 'nav.top-nav',
    sourceLocation: {
      filePath: 'src/components/Navbar.tsx',
      componentName: 'Navbar',
      lineNumber: 12,
    },
    geometry: { x: 0, y: 0, width: 1280, height: 64 },
    author: 'reviewer@superconductor.dev',
    comment: 'Navbar logo avatar is not vertically centered',
    tags: ['navbar', 'alignment'],
    severity: 'refactor',
    createdAt: '2026-10-01T10:20:00Z',
  };

  const checkoutViewAnnotation: SpatialAnnotation = {
    id: 'ann-checkout-1',
    viewId: 'view-checkout',
    type: 'pin',
    selector: '.checkout-stepper',
    sourceLocation: {
      filePath: 'src/views/CheckoutView.tsx',
      componentName: 'CheckoutStepper',
      lineNumber: 88,
    },
    geometry: { x: 100, y: 250 },
    author: 'tester@superconductor.dev',
    comment: 'Step 2 stepper state does not activate when billing address is validated',
    tags: ['checkout', 'stepper'],
    severity: 'blocker',
    createdAt: '2026-10-01T10:25:00Z',
  };

  const dashboardViewAnnotation: SpatialAnnotation = {
    id: 'ann-dash-1',
    viewId: 'view-dashboard',
    type: 'pin',
    selector: '.stats-grid',
    sourceLocation: {
      filePath: 'src/views/DashboardView.tsx',
      componentName: 'DashboardMetricsGrid',
      lineNumber: 30,
    },
    geometry: { x: 50, y: 200 },
    author: 'pm@superconductor.dev',
    comment: 'Metric cards collapse onto single column too early on tablet viewport',
    tags: ['responsive', 'metrics'],
    severity: 'enhancement',
    createdAt: '2026-10-01T10:30:00Z',
  };

  const workflowAnnotation: SpatialAnnotation = {
    id: 'ann-wf-1',
    viewId: 'view-checkout',
    type: 'pin',
    selector: '.confirm-order-btn',
    geometry: { x: 450, y: 600 },
    author: 'qa@superconductor.dev',
    comment: 'End-to-end checkout-to-receipt flow loses cart session on redirect #workflow #e2e',
    tags: ['workflow', 'e2e', 'session'],
    severity: 'blocker',
    createdAt: '2026-10-01T10:35:00Z',
  };

  describe('Edge cases and empty sets', () => {
    it('should return empty candidate list when annotations array is empty', async () => {
      const candidates = await engine.clusterAnnotations([], '/test/project');
      expect(candidates).toEqual([]);
    });

    it('should handle annotations with missing optional fields without throwing', async () => {
      const bareAnnotation: SpatialAnnotation = {
        id: 'ann-bare',
        viewId: 'view-misc',
        type: 'pin',
        geometry: { x: 10, y: 20 },
        author: 'unknown',
        comment: 'Generic feedback without source location or tags',
        tags: [],
        createdAt: '2026-10-01T10:00:00Z',
      };

      const candidates = await engine.clusterAnnotations([bareAnnotation], '/test/project');
      expect(candidates.length).toBe(1);
      expect(candidates[0].layer).toBe(2);
      expect(candidates[0].viewIds).toContain('view-misc');
    });
  });

  describe('Level 0: Foundational Tokens Clustering', () => {
    it('should extract annotations with #token, #theme, or #design-system into Layer 0', async () => {
      const candidates = await engine.clusterAnnotations(
        [tokenAnnotation1, tokenAnnotation2],
        '/test/project'
      );

      expect(candidates.length).toBe(1);
      const layer0 = candidates[0];

      expect(layer0.layer).toBe(0);
      expect(layer0.layerName).toBe('tokens');
      expect(layer0.domain).toBe('design-tokens');
      expect(layer0.tier).toBe(1);
      expect(layer0.dependsOn).toEqual([]);
      expect(layer0.dependencies).toEqual([]);
      expect(layer0.annotations.length).toBe(2);
      expect(layer0.annotations.map((a) => a.id)).toContain('ann-token-1');
      expect(layer0.annotations.map((a) => a.id)).toContain('ann-token-2');
    });

    it('should give Layer 0 highest precedence even if annotation touches a component', async () => {
      const tokenOnButton: SpatialAnnotation = {
        id: 'ann-token-btn',
        viewId: 'view-landing',
        type: 'pin',
        selector: 'button',
        sourceLocation: {
          filePath: 'src/components/Button.tsx',
          componentName: 'Button',
        },
        geometry: { x: 10, y: 10 },
        author: 'alice',
        comment: 'Use primary brand semantic token for button color #token',
        tags: ['token'],
        severity: 'enhancement',
        createdAt: '2026-10-01T10:00:00Z',
      };

      const candidates = await engine.clusterAnnotations([tokenOnButton], '/test/project');
      expect(candidates.length).toBe(1);
      expect(candidates[0].layer).toBe(0);
      expect(candidates[0].layerName).toBe('tokens');
    });

    it('should compute higher benefitScore for blocker token annotations', async () => {
      const blockerCandidate = await engine.clusterAnnotations([tokenAnnotation2], '/test/project');
      const enhancementCandidate = await engine.clusterAnnotations([tokenAnnotation1], '/test/project');

      expect(blockerCandidate[0].benefitScore).toBeGreaterThan(enhancementCandidate[0].benefitScore);
    });
  });

  describe('Level 1: Shared Golden Components Clustering', () => {
    it('should group notes touching shared components into Layer 1 component tracks', async () => {
      const candidates = await engine.clusterAnnotations(
        [buttonAnnotation1, buttonAnnotation2, navbarAnnotation],
        '/test/project'
      );

      // Should have 2 Layer 1 candidates: one for Button, one for Navbar
      expect(candidates.length).toBe(2);

      const buttonCandidate = candidates.find((c) => c.affectedComponents.includes('Button'));
      const navbarCandidate = candidates.find((c) => c.affectedComponents.includes('Navbar'));

      expect(buttonCandidate).toBeDefined();
      expect(buttonCandidate!.layer).toBe(1);
      expect(buttonCandidate!.layerName).toBe('components');
      expect(buttonCandidate!.annotations.length).toBe(2);
      expect(buttonCandidate!.trackId).toContain('button');

      expect(navbarCandidate).toBeDefined();
      expect(navbarCandidate!.layer).toBe(1);
      expect(navbarCandidate!.layerName).toBe('components');
      expect(navbarCandidate!.annotations.length).toBe(1);
      expect(navbarCandidate!.trackId).toContain('navbar');
    });

    it('should detect shared component by directory path or explicit #shared tag', async () => {
      const inputAnnotation: SpatialAnnotation = {
        id: 'ann-input-1',
        viewId: 'view-login',
        type: 'pin',
        sourceLocation: {
          filePath: 'src/components/form/TextInput.tsx',
          componentName: 'TextInput',
        },
        geometry: { x: 50, y: 50 },
        author: 'bob',
        comment: 'Input padding is inconsistent #shared',
        tags: ['shared'],
        severity: 'enhancement',
        createdAt: '2026-10-01T10:00:00Z',
      };

      const candidates = await engine.clusterAnnotations([inputAnnotation], '/test/project');
      expect(candidates.length).toBe(1);
      expect(candidates[0].layer).toBe(1);
      expect(candidates[0].affectedComponents).toContain('TextInput');
    });

    it('should detect cross-view component reuse as Layer 1 even without standard name', async () => {
      const customCompView1: SpatialAnnotation = {
        id: 'ann-c1',
        viewId: 'view-screen-a',
        type: 'pin',
        sourceLocation: {
          filePath: 'src/elements/CustomHeroBadge.tsx',
          componentName: 'CustomHeroBadge',
        },
        geometry: { x: 10, y: 10 },
        author: 'bob',
        comment: 'Missing badge icon',
        tags: ['ui'],
        createdAt: '2026-10-01T10:00:00Z',
      };

      const customCompView2: SpatialAnnotation = {
        id: 'ann-c2',
        viewId: 'view-screen-b',
        type: 'pin',
        sourceLocation: {
          filePath: 'src/elements/CustomHeroBadge.tsx',
          componentName: 'CustomHeroBadge',
        },
        geometry: { x: 10, y: 10 },
        author: 'alice',
        comment: 'Border clipping',
        tags: ['ui'],
        createdAt: '2026-10-01T10:05:00Z',
      };

      const candidates = await engine.clusterAnnotations(
        [customCompView1, customCompView2],
        '/test/project'
      );

      // Cross-view usage across view-screen-a and view-screen-b promotes it to Layer 1
      expect(candidates.length).toBe(1);
      expect(candidates[0].layer).toBe(1);
      expect(candidates[0].affectedComponents).toContain('CustomHeroBadge');
    });

    it('should set dependsOn to Layer 0 when Layer 0 is present', async () => {
      const candidates = await engine.clusterAnnotations(
        [tokenAnnotation1, buttonAnnotation1],
        '/test/project'
      );

      const layer0 = candidates.find((c) => c.layer === 0);
      const layer1 = candidates.find((c) => c.layer === 1);

      expect(layer0).toBeDefined();
      expect(layer1).toBeDefined();
      expect(layer1!.dependsOn).toContain(layer0!.trackId);
      expect(layer1!.dependencies).toContain(layer0!.trackId);
    });
  });

  describe('Level 2: Downstream Views / Features Clustering', () => {
    it('should group screen-specific notes into separate Layer 2 feature tracks', async () => {
      const candidates = await engine.clusterAnnotations(
        [checkoutViewAnnotation, dashboardViewAnnotation],
        '/test/project'
      );

      expect(candidates.length).toBe(2);
      const checkoutCandidate = candidates.find((c) => c.viewIds.includes('view-checkout'));
      const dashboardCandidate = candidates.find((c) => c.viewIds.includes('view-dashboard'));

      expect(checkoutCandidate).toBeDefined();
      expect(checkoutCandidate!.layer).toBe(2);
      expect(checkoutCandidate!.layerName).toBe('views');
      expect(checkoutCandidate!.trackId).toContain('checkout');

      expect(dashboardCandidate).toBeDefined();
      expect(dashboardCandidate!.layer).toBe(2);
      expect(dashboardCandidate!.layerName).toBe('views');
      expect(dashboardCandidate!.trackId).toContain('dashboard');
    });

    it('should declare explicit dependsOn referencing Layer 0 and Layer 1', async () => {
      const allAnnotations = [
        tokenAnnotation1,
        buttonAnnotation1,
        navbarAnnotation,
        checkoutViewAnnotation,
      ];

      const candidates = await engine.clusterAnnotations(allAnnotations, '/test/project');

      const layer0 = candidates.find((c) => c.layer === 0)!;
      const layer1Button = candidates.find(
        (c) => c.layer === 1 && c.affectedComponents.includes('Button')
      )!;
      const layer2Checkout = candidates.find((c) => c.layer === 2)!;

      expect(layer2Checkout.dependsOn).toContain(layer0.trackId);
      expect(layer2Checkout.dependsOn.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Level 3: Cross-Screen Workflows / E2E Integration Clustering', () => {
    it('should extract workflow and e2e notes into Layer 3 declaring dependencies on all prior layers', async () => {
      const allAnnotations = [
        tokenAnnotation1,
        buttonAnnotation1,
        checkoutViewAnnotation,
        workflowAnnotation,
      ];

      const candidates = await engine.clusterAnnotations(allAnnotations, '/test/project');

      const layer3 = candidates.find((c) => c.layer === 3);
      expect(layer3).toBeDefined();
      expect(layer3!.layerName).toBe('workflows');
      expect(layer3!.domain).toBe('e2e');
      expect(layer3!.tier).toBe(3);

      const layer0 = candidates.find((c) => c.layer === 0)!;
      const layer1 = candidates.find((c) => c.layer === 1)!;
      const layer2 = candidates.find((c) => c.layer === 2)!;

      expect(layer3!.dependsOn).toContain(layer0.trackId);
      expect(layer3!.dependsOn).toContain(layer1.trackId);
      expect(layer3!.dependsOn).toContain(layer2.trackId);
    });
  });

  describe('DAG Properties & ExecutionPlanner.planWaves Integration', () => {
    it('should schedule tracks in topological waves: Wave 0 (Tokens) -> Wave 1 (Components) -> Wave 2 (Views) -> Wave 3 (Workflows)', async () => {
      const annotations: SpatialAnnotation[] = [
        tokenAnnotation1,
        tokenAnnotation2,
        buttonAnnotation1,
        buttonAnnotation2,
        navbarAnnotation,
        checkoutViewAnnotation,
        dashboardViewAnnotation,
        workflowAnnotation,
      ];

      const candidates = await engine.clusterAnnotations(annotations, '/test/project');

      // Schedule waves using ExecutionPlanner
      const waves = ExecutionPlanner.planWaves(candidates);

      expect(waves.length).toBe(4);

      // Wave 0: Level 0 Foundational Tokens
      expect(waves[0].length).toBe(1);
      expect(waves[0][0].trackId).toBe(candidates.find((c) => c.layer === 0)!.trackId);

      // Wave 1: Level 1 Shared Components (Button, Navbar)
      expect(waves[1].length).toBe(2);
      const wave1Ids = waves[1].map((t) => t.trackId);
      expect(wave1Ids).toContain(candidates.find((c) => c.affectedComponents.includes('Button'))!.trackId);
      expect(wave1Ids).toContain(candidates.find((c) => c.affectedComponents.includes('Navbar'))!.trackId);

      // Button has a blocker so it should have a higher benefitScore than Navbar and be scheduled first in Wave 1
      expect(waves[1][0].trackId).toContain('button');

      // Wave 2: Level 2 Downstream Views (Checkout, Dashboard) executed in parallel
      expect(waves[2].length).toBe(2);
      const wave2Ids = waves[2].map((t) => t.trackId);
      expect(wave2Ids).toContain(
        candidates.find((c) => c.layer === 2 && c.viewIds.includes('view-checkout'))!.trackId
      );
      expect(wave2Ids).toContain(
        candidates.find((c) => c.layer === 2 && c.viewIds.includes('view-dashboard'))!.trackId
      );

      // Wave 3: Level 3 Workflows (E2E)
      expect(waves[3].length).toBe(1);
      expect(waves[3][0].trackId).toBe(candidates.find((c) => c.layer === 3)!.trackId);

      // Direct engine.planWaves helper
      const engineWaves = engine.planWaves(candidates);
      expect(engineWaves.length).toBe(4);
      expect(engineWaves[0][0].layer).toBe(0);
    });
  });

  describe('Configuration & Customization', () => {
    it('should respect custom prefix and custom shared components', async () => {
      const customEngine = new LayeredAssemblyEngine({
        idPrefix: 'preview_wf',
        customSharedComponents: ['CustomWidget'],
        tokenTrackId: 'ds_tokens_scaffold',
      });

      const customAnnotation: SpatialAnnotation = {
        id: 'ann-custom-1',
        viewId: 'view-single',
        type: 'pin',
        sourceLocation: {
          filePath: 'src/custom/CustomWidget.tsx',
          componentName: 'CustomWidget',
        },
        geometry: { x: 10, y: 10 },
        author: 'dev',
        comment: 'Fix widget #ui',
        tags: ['ui'],
        createdAt: '2026-10-01T10:00:00Z',
      };

      const tokenNote: SpatialAnnotation = {
        id: 'ann-token-c',
        viewId: 'view-single',
        type: 'pin',
        geometry: { x: 0, y: 0 },
        author: 'dev',
        comment: 'Token definition #token',
        tags: ['token'],
        createdAt: '2026-10-01T10:00:00Z',
      };

      const candidates = await customEngine.clusterAnnotations([customAnnotation, tokenNote], '/test/project');

      const tokenTrack = candidates.find((c) => c.layer === 0)!;
      expect(tokenTrack.trackId).toBe('ds_tokens_scaffold');

      const widgetTrack = candidates.find((c) => c.layer === 1)!;
      expect(widgetTrack.trackId).toBe('preview_wf_layer1_component_customwidget');
    });
  });
});
