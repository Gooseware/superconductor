import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import yaml from 'js-yaml';
import {
  VisualAstScanner,
  VitePreviewHarness,
  MockStoryEnvelope,
  MockScenarioAdapter,
  ProposalInjector,
  VisualStudioWebSocketBridge,
  LayeredAssemblyEngine,
  TrackCompiler,
  type ProposalPatch,
  type SpatialAnnotation,
  type ElementSelectedEvent,
  type CopilotPromptEvent,
  type ClusteredTrackCandidate,
} from '../../src/visual/index.js';
import { TaskWavePlanner, type TaskPlanUnit } from '../../src/orchestration/task-wave-planner.js';
import { parseTaskCard } from '../../src/planning/parser.js';
import { isParsedTaskCard } from '../../src/planning/task-schema.js';

describe('Visual Feedback Pipeline Integration Suite (ADR 0001 - ADR 0003)', () => {
  let tempWorkspaceDir: string;
  let tracksOutputDir: string;

  beforeAll(() => {
    tempWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-visual-feedback-integration-'));
    tracksOutputDir = path.join(tempWorkspaceDir, 'superconductor/tracks');

    // Create realistic project layout
    fs.mkdirSync(path.join(tempWorkspaceDir, 'src/components'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspaceDir, 'src/views'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspaceDir, 'src/theme'), { recursive: true });
    fs.mkdirSync(tracksOutputDir, { recursive: true });

    // 1. Shared PrimaryButton component
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'src/components/PrimaryButton.tsx'),
      `import React from 'react';

export interface PrimaryButtonProps {
  /** Text displayed on the button */
  label: string;
  /** Counter badge */
  count?: number;
  /** Disabled state */
  disabled?: boolean;
  /** Click event handler */
  onClick?: () => void;
}

export function PrimaryButton(props: PrimaryButtonProps) {
  return (
    <button
      disabled={props.disabled}
      onClick={props.onClick}
      className="primary-btn"
      style={{ backgroundColor: '#3b82f6', color: '#ffffff', padding: '8px 16px', borderRadius: '4px' }}
    >
      {props.label} {props.count !== undefined ? \`(\${props.count})\` : ''}
    </button>
  );
}

export default PrimaryButton;
`
    );

    // 2. Shared MetricCard component
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'src/components/MetricCard.tsx'),
      `import React from 'react';

export interface MetricCardProps {
  /** Metric label */
  title: string;
  /** Current metric value */
  value: number;
  /** Percentage trend indicator */
  trend?: string;
  /** Loading skeleton flag */
  isLoading?: boolean;
  /** Error state flag */
  isError?: boolean;
}

export function MetricCard(props: MetricCardProps) {
  if (props.isLoading) {
    return <div className="metric-card skeleton">Loading metrics...</div>;
  }
  if (props.isError) {
    return <div className="metric-card error">Failed to load metric data</div>;
  }
  return (
    <div
      className="metric-card"
      style={{ padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff' }}
    >
      <h3 className="metric-card-title">{props.title}</h3>
      <span className="metric-card-value">{props.value}</span>
      {props.trend && <span className="metric-card-trend">{props.trend}</span>}
    </div>
  );
}

export default MetricCard;
`
    );

    // 3. AnalyticsView View component composing PrimaryButton and MetricCard
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'src/views/AnalyticsView.tsx'),
      `import React from 'react';
import { PrimaryButton } from '../components/PrimaryButton.js';
import { MetricCard } from '../components/MetricCard.js';

export interface AnalyticsViewProps {
  viewTitle: string;
  autoRefresh?: boolean;
}

export function AnalyticsView(props: AnalyticsViewProps) {
  return (
    <div className="analytics-view-container" style={{ padding: '24px' }}>
      <header className="analytics-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1>{props.viewTitle}</h1>
        <PrimaryButton label="Refresh Metrics" count={5} />
      </header>
      <main className="analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <MetricCard title="Daily Active Users" value={1420} trend="+12.4%" />
        <MetricCard title="Checkout Conversion" value={3.8} trend="+0.6%" />
      </main>
    </div>
  );
}

export default AnalyticsView;
`
    );
  });

  afterAll(() => {
    if (fs.existsSync(tempWorkspaceDir)) {
      try {
        fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // =========================================================================
  // 1. Unified Living Wireframe End-to-End Pipeline Flow
  // =========================================================================
  describe('Unified Pipeline: Discovery -> Harness -> Proposals -> Annotations -> Layered Tracks -> Antichain Waves', () => {
    let harness: VitePreviewHarness;
    let bridge: VisualStudioWebSocketBridge;
    let clientWs: WebSocket | null = null;

    afterEach(async () => {
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
      clientWs = null;
      if (harness?.isAlive()) {
        await harness.stop();
      }
      if (bridge?.isListening()) {
        await bridge.stop();
      }
    });

    it('executes the full end-to-end living wireframe feedback loop across all 5 stages', async () => {
      // -----------------------------------------------------------------------
      // Stage 1: Discovery & Harness Setup
      // -----------------------------------------------------------------------
      const scanner = new VisualAstScanner();
      const scannedComponents = await scanner.scan(tempWorkspaceDir);

      expect(scannedComponents.length).toBeGreaterThanOrEqual(3);
      const metricCardInfo = scannedComponents.find((c) => c.name === 'MetricCard');
      const primaryBtnInfo = scannedComponents.find((c) => c.name === 'PrimaryButton');
      const analyticsViewInfo = scannedComponents.find((c) => c.name === 'AnalyticsView');

      expect(metricCardInfo).toBeDefined();
      expect(primaryBtnInfo).toBeDefined();
      expect(analyticsViewInfo).toBeDefined();

      // Check props and synthesized fixtures
      expect(metricCardInfo?.props.map((p) => p.name)).toEqual(
        expect.arrayContaining(['title', 'value', 'trend', 'isLoading', 'isError'])
      );
      expect(metricCardInfo?.mockProps.title).toBeDefined();
      expect(typeof metricCardInfo?.mockProps.value).toBe('number');

      // Scenario Adapter resolution across states
      const scenarioAdapter = new MockScenarioAdapter();
      const syntheticProps = scenarioAdapter.resolveProps(metricCardInfo!.mockProps, 'synthetic');
      const loadingProps = scenarioAdapter.resolveProps(metricCardInfo!.mockProps, 'loading');
      const errorProps = scenarioAdapter.resolveProps(metricCardInfo!.mockProps, 'error');

      expect(loadingProps.isLoading).toBe(true);
      expect(loadingProps.skeleton).toBe(true);
      expect(errorProps.isError).toBe(true);

      // Wrap in MockStoryEnvelope
      const envelope = new MockStoryEnvelope({ theme: 'dark', initialRoute: '/analytics' });
      const envelopeWrapperCode = envelope.generateWrapper(metricCardInfo!.filePath, {
        props: syntheticProps,
      });

      expect(envelopeWrapperCode).toContain('export function SuperconductorEnvelope');
      expect(envelopeWrapperCode).toContain('MockThemeProvider');
      expect(envelopeWrapperCode).toContain('MockRouterProvider');
      expect(envelopeWrapperCode).toContain('MockQueryProvider');
      expect(envelopeWrapperCode).toContain('ErrorBoundary');
      expect(envelopeWrapperCode).toContain('--astryx-primary');

      // Launch in-memory Vite preview harness
      harness = new VitePreviewHarness();
      const { url, port } = await harness.start({ port: 0, logLevel: 'silent', host: '127.0.0.1' });
      expect(harness.isAlive()).toBe(true);
      expect(port).toBeGreaterThan(0);

      // Mount virtual component
      harness.setVirtualComponent(metricCardInfo!.filePath, metricCardInfo!.mockProps);
      expect(harness.getCurrentComponent()?.componentPath).toBe(metricCardInfo!.filePath);

      // Fetch virtual module via HTTP without physical disk writes
      const entryRes = await fetch(`${url}/@superconductor/entry`);
      expect(entryRes.status).toBe(200);
      const entryCode = await entryRes.text();
      expect(entryCode).toContain('SuperconductorErrorBoundary');
      expect(entryCode).toContain(metricCardInfo!.filePath.replace(/\\/g, '/'));

      // -----------------------------------------------------------------------
      // Stage 2: Live In-DOM Proposal & A/B Toggling
      // -----------------------------------------------------------------------
      const injector = new ProposalInjector();
      const initialDiskContent = fs.readFileSync(metricCardInfo!.filePath, 'utf-8');

      const proposalPatch: ProposalPatch = {
        id: 'patch-metric-glassmorphism',
        title: 'Upgrade MetricCard to glassmorphism with glowing border',
        targetFilePath: metricCardInfo!.filePath,
        cssDelta: '.metric-card { backdrop-filter: blur(16px); background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(99, 102, 241, 0.3); }',
        jsxReplacement: '() => React.createElement("div", { className: "metric-card glass" }, "Patched Glassmorphism Card")',
        injectedProps: { variant: 'glassmorphism', glowing: true },
      };

      // Apply proposal patch
      const injectionResult = await injector.applyProposal(harness, proposalPatch);
      expect(injectionResult.activeProposalId).toBe('patch-metric-glassmorphism');
      expect(injectionResult.aBState).toBe('proposal');
      expect(injector.getABState()).toBe('proposal');

      // Verify harness in-memory virtual content reflects patch
      const patchedVirtualModule = harness.getVirtualModuleContent();
      expect(patchedVirtualModule).toContain('superconductor-patch-css');
      expect(patchedVirtualModule).toContain('.metric-card { backdrop-filter: blur(16px);');
      expect(patchedVirtualModule).toContain('JsxReplacement');
      expect(patchedVirtualModule).toContain('"variant":"glassmorphism"');

      // Verify HTTP endpoint serves the live proposal
      const patchedHttpRes = await fetch(`${url}/@superconductor/entry`);
      const patchedHttpCode = await patchedHttpRes.text();
      expect(patchedHttpCode).toContain('.metric-card { backdrop-filter: blur(16px);');

      // Toggle to baseline "current"
      const abRevertState = await injector.toggleAB(harness, 'current');
      expect(abRevertState).toBe('current');
      expect(injector.getABState()).toBe('current');
      const revertedVirtualCode = harness.getVirtualModuleContent();
      expect(revertedVirtualCode).not.toContain('.metric-card { backdrop-filter: blur(16px);');

      // Guarantee ZERO disk mutations occurred
      const diskContentAfterToggle = fs.readFileSync(metricCardInfo!.filePath, 'utf-8');
      expect(diskContentAfterToggle).toBe(initialDiskContent);

      // Toggle back to "proposal"
      const abRestoreState = await injector.toggleAB(harness, 'proposal');
      expect(abRestoreState).toBe('proposal');
      expect(harness.getVirtualModuleContent()).toContain('.metric-card { backdrop-filter: blur(16px);');

      // -----------------------------------------------------------------------
      // Stage 3: Interactive Annotation & WebSocket Flow
      // -----------------------------------------------------------------------
      bridge = new VisualStudioWebSocketBridge();
      const bridgeInfo = await bridge.start({ port: 0, host: '127.0.0.1' });
      expect(bridge.isListening()).toBe(true);
      expect(bridgeInfo.port).toBeGreaterThan(0);

      clientWs = new WebSocket(bridgeInfo.url);
      await new Promise<void>((resolve) => {
        clientWs!.onopen = () => resolve();
      });

      // 3.1 Send element_selected event with Fiber introspection source
      const fiberElementEvent: ElementSelectedEvent = {
        selector: '.metric-card-value',
        xpath: '/html/body/div/div/div[2]/div[1]/span',
        fiberSource: {
          filePath: metricCardInfo!.filePath,
          lineNumber: 28,
          componentName: 'MetricCard',
        },
      };

      const elementSelectedPromise = new Promise<ElementSelectedEvent>((resolve) => {
        bridge.once('element_selected', (data) => resolve(data));
      });

      clientWs.send(JSON.stringify({ type: 'element_selected', payload: fiberElementEvent }));
      const receivedFiberElement = await elementSelectedPromise;
      expect(receivedFiberElement.selector).toBe('.metric-card-value');
      expect(receivedFiberElement.fiberSource?.componentName).toBe('MetricCard');
      expect(receivedFiberElement.fiberSource?.lineNumber).toBe(28);

      // 3.2 Send multi-tier spatial annotations
      const collectedAnnotations: SpatialAnnotation[] = [];
      const annotationsToEmit: SpatialAnnotation[] = [
        // Layer 0 Token annotation
        {
          id: 'ann-token-color',
          viewId: 'view-analytics',
          type: 'pin',
          selector: '.metric-card-title',
          sourceLocation: {
            filePath: metricCardInfo!.filePath,
            componentName: 'MetricCard',
            lineNumber: 27,
          },
          geometry: { x: 45, y: 110 },
          author: 'design-lead@superconductor.dev',
          comment: 'Hardcoded hex color #3b82f6 violates semantic tokens #token #theme',
          tags: ['token', 'theme', 'color'],
          severity: 'blocker',
          createdAt: new Date().toISOString(),
        },
        // Layer 1 Shared Component annotation (PrimaryButton)
        {
          id: 'ann-button-contrast',
          viewId: 'view-analytics',
          type: 'pin',
          selector: 'button.primary-btn',
          sourceLocation: {
            filePath: primaryBtnInfo!.filePath,
            componentName: 'PrimaryButton',
            lineNumber: 18,
          },
          geometry: { x: 120, y: 35 },
          author: 'a11y-auditor@superconductor.dev',
          comment: 'Primary button contrast ratio is 3.8:1, requires 4.5:1 for WCAG AA',
          tags: ['accessibility', 'wcag-aa', 'contrast'],
          severity: 'blocker',
          createdAt: new Date().toISOString(),
        },
        // Layer 1 Shared Component annotation (PrimaryButton mobile padding)
        {
          id: 'ann-button-padding',
          viewId: 'view-analytics',
          type: 'bounding_box',
          selector: 'button.primary-btn',
          sourceLocation: {
            filePath: primaryBtnInfo!.filePath,
            componentName: 'PrimaryButton',
            lineNumber: 20,
          },
          geometry: { x: 110, y: 30, width: 140, height: 44 },
          author: 'mobile-reviewer@superconductor.dev',
          comment: 'Button tap target should be at least 44px min-height on mobile',
          tags: ['ui', 'spacing'],
          severity: 'enhancement',
          createdAt: new Date().toISOString(),
        },
        // Layer 2 Downstream View annotation (AnalyticsView)
        {
          id: 'ann-view-grid',
          viewId: 'view-analytics',
          type: 'bounding_box',
          selector: '.analytics-grid',
          sourceLocation: {
            filePath: analyticsViewInfo!.filePath,
            componentName: 'AnalyticsView',
            lineNumber: 20,
          },
          geometry: { x: 0, y: 80, width: 800, height: 400 },
          author: 'ux-designer@superconductor.dev',
          comment: 'Analytics grid columns should collapse to single column below 768px breakpoint',
          tags: ['responsive', 'layout', 'grid'],
          severity: 'enhancement',
          createdAt: new Date().toISOString(),
        },
        // Layer 3 Cross-Screen Workflow annotation
        {
          id: 'ann-workflow-drilldown',
          viewId: 'view-analytics',
          type: 'pin',
          selector: '.metric-card',
          geometry: { x: 200, y: 250 },
          author: 'pm@superconductor.dev',
          comment: 'Clicking metric card should navigate to metric detail view while preserving time range #workflow #e2e',
          tags: ['workflow', 'e2e', 'navigation'],
          severity: 'blocker',
          createdAt: new Date().toISOString(),
        },
      ];

      for (const ann of annotationsToEmit) {
        const annPromise = new Promise<{ annotation: SpatialAnnotation }>((resolve) => {
          bridge.once('annotation_created', (data) => resolve(data));
        });
        clientWs.send(JSON.stringify({ type: 'annotation_created', annotation: ann }));
        const res = await annPromise;
        collectedAnnotations.push(res.annotation);
      }

      expect(collectedAnnotations).toHaveLength(5);
      clientWs.close();
      clientWs = null;

      // -----------------------------------------------------------------------
      // Stage 4: Layered Assembly & Track Compilation
      // -----------------------------------------------------------------------
      const assemblyEngine = new LayeredAssemblyEngine();
      const trackCandidates = await assemblyEngine.clusterAnnotations(
        collectedAnnotations,
        tempWorkspaceDir
      );

      // Verify 4-tier layered architecture
      const layer0Tokens = trackCandidates.find((c) => c.layer === 0);
      const layer1Components = trackCandidates.filter((c) => c.layer === 1);
      const layer2Views = trackCandidates.find((c) => c.layer === 2);
      const layer3Workflows = trackCandidates.find((c) => c.layer === 3);

      expect(layer0Tokens).toBeDefined();
      expect(layer0Tokens?.layerName).toBe('tokens');
      expect(layer0Tokens?.dependsOn).toEqual([]); // Root wave

      expect(layer1Components.length).toBeGreaterThanOrEqual(1);
      const primaryBtnCandidate = layer1Components.find((c) =>
        c.affectedComponents.includes('PrimaryButton')
      );
      expect(primaryBtnCandidate).toBeDefined();
      expect(primaryBtnCandidate?.dependsOn).toContain(layer0Tokens!.trackId);

      expect(layer2Views).toBeDefined();
      expect(layer2Views?.layerName).toBe('views');
      expect(layer2Views?.dependsOn).toContain(layer0Tokens!.trackId);
      expect(layer2Views?.dependsOn).toContain(primaryBtnCandidate!.trackId);

      expect(layer3Workflows).toBeDefined();
      expect(layer3Workflows?.layerName).toBe('workflows');
      expect(layer3Workflows?.dependsOn).toContain(layer0Tokens!.trackId);
      expect(layer3Workflows?.dependsOn).toContain(layer2Views!.trackId);

      // Compile tracks to disk
      const trackCompiler = new TrackCompiler();
      const compiledTracks = trackCompiler.compileAllToTracks(trackCandidates, tracksOutputDir);
      expect(compiledTracks.length).toBe(trackCandidates.length);

      // Validate schema compliance for each generated track
      for (const compiled of compiledTracks) {
        const { candidate, trackDir, files } = compiled;

        expect(fs.existsSync(path.join(trackDir, 'spec.md'))).toBe(true);
        expect(fs.existsSync(path.join(trackDir, 'plan.md'))).toBe(true);
        expect(fs.existsSync(path.join(trackDir, 'index.md'))).toBe(true);

        // spec.md checks
        expect(files.specMarkdown).toContain(`# Track Specification: ${candidate.title}`);
        expect(files.specMarkdown).toContain('ADR 0003 (Layered Assembly Partitioning)');
        expect(files.specMarkdown).toContain('## Visual Evidence Table');
        expect(files.specMarkdown).toContain('## Functional Requirements');
        expect(files.specMarkdown).toContain('## Acceptance Criteria');

        // plan.md checks & Superconductor task schema parsing
        expect(files.planMarkdown).toContain('**Status:** [ ]');
        expect(files.planMarkdown).toContain('## Phase 0: Implementation & Visual Refactoring');
        expect(files.planMarkdown).toContain('## Phase 1: Verification & Visual Regression Testing');

        const taskBlocks = files.planMarkdown
          .split(/(?=-\s*\[\s*\]\s*Task:)/i)
          .filter((b) => b.toLowerCase().includes('task:'));

        expect(taskBlocks.length).toBe(2);

        for (const block of taskBlocks) {
          const parsed = parseTaskCard(block);
          expect(isParsedTaskCard(parsed)).toBe(true);
          expect(parsed.agent).toBe('superconductor-processor');
          expect(parsed.tier).toBeGreaterThanOrEqual(1);
          expect(parsed.creates.length).toBeGreaterThan(0);
          expect(parsed.protected.length).toBeGreaterThan(0);
          expect(parsed.invariantAfter).toBeDefined();
          expect(parsed.invariantAfter!.length).toBeGreaterThan(5);
          expect(parsed.reuses.length).toBeGreaterThan(0);
          expect(parsed.subtasks.length).toBeGreaterThanOrEqual(2);
        }
      }

      // Generate tracks.yaml and verify structure
      const tracksYamlContent = trackCompiler.generateTracksYaml(trackCandidates);
      const parsedYaml = yaml.load(tracksYamlContent) as { tracks: Array<{ id: string; layer: number; deps: string[] }> };
      expect(parsedYaml.tracks).toHaveLength(trackCandidates.length);

      // -----------------------------------------------------------------------
      // Stage 5: Task Wave Antichain Verification
      // -----------------------------------------------------------------------
      // Construct a unified multi-track plan comprising tasks across Layers 0, 1, and 2
      const tokenTrackFiles = compiledTracks.find((c) => c.candidate.layer === 0)!.files;
      const componentTrackFiles = compiledTracks.find((c) => c.candidate.layer === 1)!.files;
      const viewTrackFiles = compiledTracks.find((c) => c.candidate.layer === 2)!.files;

      const unifiedMultiPhasePlan = [
        tokenTrackFiles.planMarkdown,
        componentTrackFiles.planMarkdown,
        viewTrackFiles.planMarkdown,
      ].join('\n\n');

      const parsedUnits = TaskWavePlanner.parsePlanWithDependencies(unifiedMultiPhasePlan);
      expect(parsedUnits.length).toBe(6); // 2 tasks each across 3 tracks

      const waves = TaskWavePlanner.planTaskWaves(parsedUnits);

      // Verify that waves form valid topological antichains
      expect(waves.length).toBeGreaterThanOrEqual(2);

      // Wave 0 must contain the unblocked foundational token task
      const wave0TaskTitles = waves[0].map((u) => u.task.toLowerCase());
      const hasTokenInWave0 = wave0TaskTitles.some((t) => t.includes('token') || t.includes('foundational'));
      expect(hasTokenInWave0).toBe(true);

      // Independent implementation tasks without conflicting CREATES run concurrently
      // Verify no phase waterfall barrier: Wave 0 contains tasks ready to run immediately
      for (const wave of waves) {
        // Within any single wave, no two tasks can have write-read or write-write conflicts on the same file
        for (let i = 0; i < wave.length; i++) {
          for (let j = i + 1; j < wave.length; j++) {
            const taskA = wave[i];
            const taskB = wave[j];

            if (taskA.creates && taskB.creates) {
              const commonCreates = taskA.creates.filter((f) => taskB.creates!.includes(f));
              expect(commonCreates).toEqual([]);
            }

            if (taskA.creates && taskB.protected) {
              const writeReadConflict = taskA.creates.filter((f) => taskB.protected!.includes(f));
              expect(writeReadConflict).toEqual([]);
            }
          }
        }
      }
    }, 20000);
  });

  // =========================================================================
  // 2. Focused Stage-Specific Integration Tests
  // =========================================================================
  describe('Stage 1: Discovery & Autonomous Mock Envelope Harness', () => {
    it('discovers components, extracts props, and resolves mock scenarios', async () => {
      const scanner = new VisualAstScanner();
      const scanned = await scanner.scan(tempWorkspaceDir);

      const button = scanned.find((c) => c.name === 'PrimaryButton');
      expect(button).toBeDefined();
      expect(button?.props.some((p) => p.name === 'label' && p.required)).toBe(true);
      expect(button?.props.some((p) => p.name === 'count' && !p.required)).toBe(true);
      expect(button?.props.some((p) => p.name === 'onClick')).toBe(true);

      // Test scenario variations
      const adapter = new MockScenarioAdapter();

      // Loading scenario
      const loadingState = adapter.resolveProps(button!.mockProps, 'loading');
      expect(loadingState.isLoading).toBe(true);
      expect(loadingState.status).toBe('loading');
      expect(loadingState.skeleton).toBe(true);

      // Error scenario
      const errorState = adapter.resolveProps(button!.mockProps, 'error');
      expect(errorState.isError).toBe(true);
      expect(errorState.hasError).toBe(true);
      expect(typeof errorState.errorMessage).toBe('string');

      // Empty scenario
      const emptyState = adapter.resolveProps(button!.mockProps, 'empty');
      expect(emptyState.label).toBe('');
      expect(emptyState.count).toBe(0);

      // Astryx Design OS envelope token verification
      const envelope = new MockStoryEnvelope({ theme: 'dark', initialRoute: '/test' });
      const code = envelope.generateWrapper(button!.filePath, {
        scenario: 'loading',
      });

      expect(code).toContain('import React from \'react\';');
      expect(code).toContain('export function MockRouterProvider');
      expect(code).toContain('export const MockThemeContext');
      expect(code).toContain('export function MockQueryProvider');
      expect(code).toContain('export class ErrorBoundary');
      expect(code).toContain('"isLoading": true');
    });

    it('mounts virtual component in VitePreviewHarness and serves in-memory over HTTP', async () => {
      const harness = new VitePreviewHarness();
      const { url } = await harness.start({ port: 0, logLevel: 'silent', host: '127.0.0.1' });

      try {
        const dummyPath = path.join(tempWorkspaceDir, 'src/components/PrimaryButton.tsx');
        harness.setVirtualComponent(dummyPath, { label: 'Click Me', count: 42 });

        const htmlRes = await fetch(url);
        expect(htmlRes.status).toBe(200);
        const html = await htmlRes.text();
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('src="/@superconductor/entry"');

        const entryRes = await fetch(`${url}/@superconductor/entry`);
        expect(entryRes.status).toBe(200);
        const entryCode = await entryRes.text();
        expect(entryCode).toContain('Click Me');
        expect(entryCode).toContain('42');
        expect(entryCode).toContain('SuperconductorErrorBoundary');
      } finally {
        await harness.stop();
      }
    }, 15000);
  });

  describe('Stage 2: Live In-DOM Proposal & A/B Toggling', () => {
    let harness: VitePreviewHarness;

    beforeEach(async () => {
      harness = new VitePreviewHarness();
      await harness.start({ port: 0, logLevel: 'silent', host: '127.0.0.1' });
    });

    afterEach(async () => {
      if (harness.isAlive()) {
        await harness.stop();
      }
    });

    it('seamlessly applies proposal patches and toggles A/B states with disk immutability', async () => {
      const injector = new ProposalInjector();
      const targetFile = path.join(tempWorkspaceDir, 'src/components/PrimaryButton.tsx');
      const originalDiskCode = fs.readFileSync(targetFile, 'utf-8');

      harness.setVirtualComponent(targetFile, { label: 'Original', count: 0 });

      const patch: ProposalPatch = {
        id: 'patch-btn-rounded',
        title: 'Full pill border radius and amber glow',
        targetFilePath: targetFile,
        cssDelta: '.primary-btn { border-radius: 9999px; box-shadow: 0 0 12px #f59e0b; }',
        jsxReplacement: '() => React.createElement("button", { className: "primary-btn pill" }, "Pill Button")',
        injectedProps: { variant: 'pill' },
      };

      // 1. Apply proposal
      await injector.applyProposal(harness, patch);
      expect(injector.getABState()).toBe('proposal');
      expect(injector.getActiveProposal()?.id).toBe('patch-btn-rounded');

      let virtualCode = harness.getVirtualModuleContent();
      expect(virtualCode).toContain('border-radius: 9999px;');
      expect(virtualCode).toContain('box-shadow: 0 0 12px #f59e0b;');
      expect(virtualCode).toContain('Pill Button');

      // 2. Toggle to "current"
      await injector.toggleAB(harness, 'current');
      expect(injector.getABState()).toBe('current');
      virtualCode = harness.getVirtualModuleContent();
      expect(virtualCode).not.toContain('border-radius: 9999px;');
      expect(virtualCode).not.toContain('Pill Button');

      // 3. Confirm file on disk was NEVER touched
      expect(fs.readFileSync(targetFile, 'utf-8')).toBe(originalDiskCode);

      // 4. Toggle back to "proposal"
      await injector.toggleAB(harness, 'proposal');
      expect(injector.getABState()).toBe('proposal');
      virtualCode = harness.getVirtualModuleContent();
      expect(virtualCode).toContain('border-radius: 9999px;');
      expect(virtualCode).toContain('Pill Button');
    });
  });

  describe('Stage 3: Interactive Annotation & WebSocket Flow', () => {
    let bridge: VisualStudioWebSocketBridge;
    let clientWs: WebSocket | null = null;

    afterEach(async () => {
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
      clientWs = null;
      if (bridge?.isListening()) {
        await bridge.stop();
      }
    });

    it('receives Fiber element selection, copilot prompts, and spatial annotations over WebSocket', async () => {
      bridge = new VisualStudioWebSocketBridge();
      const { url } = await bridge.start({ port: 0, host: '127.0.0.1' });

      clientWs = new WebSocket(url);
      try {
        await new Promise<void>((resolve) => {
          clientWs!.onopen = () => resolve();
        });

        // Element selected with Fiber debug source
        const elementPromise = new Promise<ElementSelectedEvent>((resolve) => {
          bridge.once('element_selected', (data) => resolve(data));
        });

        const elementPayload: ElementSelectedEvent = {
          selector: 'button.primary-btn',
          xpath: '/html/body/div/button',
          fiberSource: {
            filePath: 'src/components/PrimaryButton.tsx',
            lineNumber: 16,
            componentName: 'PrimaryButton',
          },
        };

        clientWs.send(JSON.stringify({ type: 'element_selected', payload: elementPayload }));
        const receivedElement = await elementPromise;
        expect(receivedElement.fiberSource?.componentName).toBe('PrimaryButton');
        expect(receivedElement.fiberSource?.lineNumber).toBe(16);

        // Copilot prompt event
        const copilotPromise = new Promise<CopilotPromptEvent>((resolve) => {
          bridge.once('copilot_prompt', (data) => resolve(data));
        });

        const promptPayload: CopilotPromptEvent = {
          prompt: 'Convert button background to use the new semantic accent token',
          activeContext: {
            selector: 'button.primary-btn',
            fiberSource: {
              filePath: 'src/components/PrimaryButton.tsx',
              lineNumber: 16,
              componentName: 'PrimaryButton',
            },
            boundingBox: { x: 100, y: 150, width: 120, height: 40 },
          },
        };

        clientWs.send(JSON.stringify({ type: 'copilot_prompt', ...promptPayload }));
        const receivedPrompt = await copilotPromise;
        expect(receivedPrompt.prompt).toContain('semantic accent token');
        expect(receivedPrompt.activeContext?.boundingBox?.width).toBe(120);
      } finally {
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          clientWs.close();
        }
        clientWs = null;
      }
    }, 15000);
  });

  describe('Stage 4: Layered Assembly & Track Compilation', () => {
    it('clusters notes into strict 4-tier layers and compiles schema-compliant track files', async () => {
      const engine = new LayeredAssemblyEngine();

      const annotations: SpatialAnnotation[] = [
        {
          id: 'note-token',
          viewId: 'view-dashboard',
          type: 'pin',
          geometry: { x: 10, y: 10 },
          author: 'designer',
          comment: 'Surface background color must use semantic variable #token',
          tags: ['token', 'theme'],
          severity: 'blocker',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'note-comp-btn',
          viewId: 'view-dashboard',
          type: 'pin',
          selector: 'button.primary-btn',
          sourceLocation: {
            filePath: 'src/components/PrimaryButton.tsx',
            componentName: 'PrimaryButton',
            lineNumber: 10,
          },
          geometry: { x: 50, y: 50 },
          author: 'engineer',
          comment: 'Button spinner missing when count is updating',
          tags: ['component', 'ui'],
          severity: 'enhancement',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'note-comp-card',
          viewId: 'view-dashboard',
          type: 'pin',
          selector: '.metric-card',
          sourceLocation: {
            filePath: 'src/components/MetricCard.tsx',
            componentName: 'MetricCard',
            lineNumber: 15,
          },
          geometry: { x: 120, y: 120 },
          author: 'engineer',
          comment: 'Metric card title text truncates prematurely',
          tags: ['component', 'card'],
          severity: 'enhancement',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'note-view-dash',
          viewId: 'view-dashboard',
          type: 'bounding_box',
          selector: '.dashboard-grid',
          sourceLocation: {
            filePath: 'src/views/DashboardView.tsx',
            componentName: 'DashboardView',
            lineNumber: 30,
          },
          geometry: { x: 0, y: 0, width: 1024, height: 768 },
          author: 'pm',
          comment: 'Dashboard header row overlaps with metrics grid',
          tags: ['layout', 'view'],
          severity: 'blocker',
          createdAt: new Date().toISOString(),
        },
      ];

      const candidates = await engine.clusterAnnotations(annotations, tempWorkspaceDir);

      expect(candidates.length).toBe(4);

      const tokenTrack = candidates.find((c) => c.layer === 0);
      const buttonTrack = candidates.find((c) => c.affectedComponents.includes('PrimaryButton'));
      const cardTrack = candidates.find((c) => c.affectedComponents.includes('MetricCard'));
      const viewTrack = candidates.find((c) => c.layer === 2);

      expect(tokenTrack).toBeDefined();
      expect(buttonTrack).toBeDefined();
      expect(cardTrack).toBeDefined();
      expect(viewTrack).toBeDefined();

      // Dependencies check
      expect(tokenTrack!.dependsOn).toEqual([]);
      expect(buttonTrack!.dependsOn).toContain(tokenTrack!.trackId);
      expect(cardTrack!.dependsOn).toContain(tokenTrack!.trackId);
      expect(viewTrack!.dependsOn).toContain(tokenTrack!.trackId);
      expect(viewTrack!.dependsOn).toContain(buttonTrack!.trackId);
      expect(viewTrack!.dependsOn).toContain(cardTrack!.trackId);

      // TrackCompiler validation
      const compiler = new TrackCompiler();
      const compiled = compiler.compileToTrack(buttonTrack!);

      // Strict validation of task cards
      const taskBlocks = compiled.planMarkdown
        .split(/(?=-\s*\[\s*\]\s*Task:)/i)
        .filter((b) => b.toLowerCase().includes('task:'));

      expect(taskBlocks.length).toBe(2);
      for (const block of taskBlocks) {
        const card = parseTaskCard(block);
        expect(isParsedTaskCard(card)).toBe(true);
        expect(card.tier).toBeGreaterThanOrEqual(1);
        expect(card.creates.length).toBeGreaterThan(0);
        expect(card.protected.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Stage 5: Task Wave Antichain Verification', () => {
    it('schedules independent tasks across phases into Wave 0 while properly isolating hazards', () => {
      // 1. Test parallel execution without waterfall barriers
      const independentPlanMarkdown = `
## Phase 0: Setup
- [ ] Task: Scaffold Tokens [TIER-2] [AGENT:superconductor-processor] [DOMAIN:theme]
    CREATES: src/theme/tokens.css
    PROTECTED: package.json

## Phase 1: Components
- [ ] Task: Create Avatar Atom [TIER-2] [AGENT:superconductor-processor] [DOMAIN:ui]
    CREATES: src/components/Avatar.tsx
    PROTECTED: package.json

## Phase 2: Utilities
- [ ] Task: Add Color Helper [TIER-1] [AGENT:superconductor-processor] [DOMAIN:utils]
    CREATES: src/utils/color.ts
    PROTECTED: package.json
`;

      const units = TaskWavePlanner.parsePlanWithDependencies(independentPlanMarkdown);
      expect(units).toHaveLength(3);

      const parallelWaves = TaskWavePlanner.planTaskWaves(units);
      // All 3 independent tasks from different phases run concurrently in Wave 0!
      expect(parallelWaves).toHaveLength(1);
      expect(parallelWaves[0]).toHaveLength(3);

      // 2. Test write-read hazard sequencing (Token creation -> Component token protection)
      const hazardPlanMarkdown = `
## Phase 0: Foundations
- [ ] Task: Define Semantic Tokens [TIER-2] [AGENT:superconductor-processor] [DOMAIN:theme]
    CREATES: src/theme/tokens.css
    PROTECTED: package.json

## Phase 1: Shared Components
- [ ] Task: Standardize PrimaryButton [TIER-2] [AGENT:superconductor-processor] [DOMAIN:ui]
    CREATES: src/components/PrimaryButton.tsx
    PROTECTED: src/theme/tokens.css

- [ ] Task: Standardize MetricCard [TIER-2] [AGENT:superconductor-processor] [DOMAIN:ui]
    CREATES: src/components/MetricCard.tsx
    PROTECTED: src/theme/tokens.css

## Phase 2: Downstream Views
- [ ] Task: Wire AnalyticsView [TIER-2] [AGENT:superconductor-processor] [DOMAIN:views]
    CREATES: src/views/AnalyticsView.tsx
    PROTECTED: src/components/PrimaryButton.tsx, src/components/MetricCard.tsx
`;

      const hazardUnits = TaskWavePlanner.parsePlanWithDependencies(hazardPlanMarkdown);
      expect(hazardUnits).toHaveLength(4);

      const hazardWaves = TaskWavePlanner.planTaskWaves(hazardUnits);

      // Wave 0: Semantic Tokens
      expect(hazardWaves[0]).toHaveLength(1);
      expect(hazardWaves[0][0].task).toContain('Semantic Tokens');

      // Wave 1: PrimaryButton and MetricCard run in parallel together!
      expect(hazardWaves[1]).toHaveLength(2);
      const wave1Tasks = hazardWaves[1].map((u) => u.task);
      expect(wave1Tasks).toContain('Standardize PrimaryButton');
      expect(wave1Tasks).toContain('Standardize MetricCard');

      // Wave 2: Downstream AnalyticsView runs only after both components finish
      expect(hazardWaves[2]).toHaveLength(1);
      expect(hazardWaves[2][0].task).toContain('Wire AnalyticsView');
    });
  });
});
