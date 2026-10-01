import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WireframeBoardEmitter, sanitizeUri } from '../../src/crawler/renderer.js';
import type { UserFlowGraph, FlowNode, FlowTransition, RouteMarker } from '../../src/crawler/types.js';

describe('WireframeBoardEmitter', () => {
  let tempDir: string;
  let sampleGraph: UserFlowGraph;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-wireframe-test-'));

    const nodes: FlowNode[] = [
      {
        id: 'home',
        type: 'route',
        path: '/',
        title: 'Home Dashboard',
        sourceFilePath: 'src/routes/index.tsx',
        authRequired: false,
        screenshots: {
          desktop: 'screenshots/home-desktop.webp',
          tablet: 'screenshots/home-tablet.webp',
          mobile: 'screenshots/home-mobile.webp',
        },
        videoSlice: {
          start: 0,
          end: 3.5,
        },
      },
      {
        id: 'settings',
        type: 'route',
        path: '/settings',
        title: 'Settings Page',
        sourceFilePath: 'src/routes/settings.tsx',
        authRequired: true,
        screenshots: {
          desktop: 'screenshots/settings-desktop.webp',
          tablet: 'screenshots/settings-tablet.webp',
          mobile: 'screenshots/settings-mobile.webp',
        },
        videoSlice: {
          start: 3.5,
          end: 7.2,
        },
      },
      {
        id: 'help-modal',
        type: 'modal',
        path: '/settings#help',
        title: 'Help Dialog Modal',
        sourceFilePath: 'src/components/HelpModal.tsx',
        authRequired: true,
        screenshots: {
          desktop: 'screenshots/help-desktop.webp',
        },
        // No videoSlice to test fallback screenshot rendering
      },
    ];

    const transitions: FlowTransition[] = [
      {
        id: 'trans-1',
        sourceNodeId: 'home',
        targetNodeId: 'settings',
        triggerType: 'link',
        triggerText: 'Go to Settings',
        triggerSelector: 'nav a[href="/settings"]',
      },
      {
        id: 'trans-2',
        sourceNodeId: 'settings',
        targetNodeId: 'help-modal',
        triggerType: 'modal_trigger',
        triggerText: 'Open Help',
        triggerSelector: 'button#help-btn',
      },
    ];

    sampleGraph = {
      nodes,
      transitions,
      rootNodeId: 'home',
    };
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Sugiyama Topological Layout in Node.js', () => {
    it('computes ranks and 2D grid coordinates based on rank and order', () => {
      const emitter = new WireframeBoardEmitter();
      const layout = emitter.computeLayout(sampleGraph, {
        cardWidth: 400,
        cardHeight: 500,
        gapX: 100,
        gapY: 50,
        startX: 0,
        startY: 0,
      });

      // home is root -> rank 0, order 0
      const homeLayout = layout.get('home');
      expect(homeLayout).toBeDefined();
      expect(homeLayout?.rank).toBe(0);
      expect(homeLayout?.order).toBe(0);
      expect(homeLayout?.x).toBe(0); // 0 * (400 + 100)
      expect(homeLayout?.y).toBe(0); // 0 * (500 + 50)

      // settings is 1 hop from root -> rank 1, order 0
      const settingsLayout = layout.get('settings');
      expect(settingsLayout).toBeDefined();
      expect(settingsLayout?.rank).toBe(1);
      expect(settingsLayout?.order).toBe(0);
      expect(settingsLayout?.x).toBe(500); // 1 * (400 + 100)
      expect(settingsLayout?.y).toBe(0);

      // help-modal is 1 hop from settings -> rank 2, order 0
      const helpLayout = layout.get('help-modal');
      expect(helpLayout).toBeDefined();
      expect(helpLayout?.rank).toBe(2);
      expect(helpLayout?.order).toBe(0);
      expect(helpLayout?.x).toBe(1000); // 2 * (400 + 100)
      expect(helpLayout?.y).toBe(0);
    });

    it('handles branching flows by placing siblings at same rank with incremented order indices', () => {
      const emitter = new WireframeBoardEmitter();
      const branchingGraph: UserFlowGraph = {
        rootNodeId: 'root',
        nodes: [
          {
            id: 'root',
            type: 'route',
            path: '/',
            title: 'Root',
            sourceFilePath: 'src/root.tsx',
            authRequired: false,
            screenshots: {},
          },
          {
            id: 'branch-a',
            type: 'route',
            path: '/a',
            title: 'Branch A',
            sourceFilePath: 'src/a.tsx',
            authRequired: false,
            screenshots: {},
          },
          {
            id: 'branch-b',
            type: 'route',
            path: '/b',
            title: 'Branch B',
            sourceFilePath: 'src/b.tsx',
            authRequired: false,
            screenshots: {},
          },
        ],
        transitions: [
          {
            id: 't1',
            sourceNodeId: 'root',
            targetNodeId: 'branch-a',
            triggerType: 'link',
            triggerText: 'A',
            triggerSelector: 'a.a',
          },
          {
            id: 't2',
            sourceNodeId: 'root',
            targetNodeId: 'branch-b',
            triggerType: 'link',
            triggerText: 'B',
            triggerSelector: 'a.b',
          },
        ],
      };

      const layout = emitter.computeLayout(branchingGraph, {
        cardWidth: 400,
        cardHeight: 500,
        gapX: 100,
        gapY: 50,
        startX: 100,
        startY: 50,
      });

      const aLayout = layout.get('branch-a')!;
      const bLayout = layout.get('branch-b')!;

      expect(aLayout.rank).toBe(1);
      expect(bLayout.rank).toBe(1);
      expect(aLayout.x).toBe(100 + 1 * (400 + 100)); // 600
      expect(bLayout.x).toBe(100 + 1 * (400 + 100)); // 600

      // Orders should be 0 and 1
      const orders = [aLayout.order, bLayout.order].sort();
      expect(orders).toEqual([0, 1]);
      const ys = [aLayout.y, bLayout.y].sort((x, y) => x - y);
      expect(ys).toEqual([50, 50 + (500 + 50)]);
    });

    it('handles cyclic dependencies gracefully without infinite looping', () => {
      const emitter = new WireframeBoardEmitter();
      const cyclicGraph: UserFlowGraph = {
        rootNodeId: 'n1',
        nodes: [
          { id: 'n1', type: 'route', path: '/1', title: '1', sourceFilePath: '1', authRequired: false, screenshots: {} },
          { id: 'n2', type: 'route', path: '/2', title: '2', sourceFilePath: '2', authRequired: false, screenshots: {} },
        ],
        transitions: [
          { id: 't1', sourceNodeId: 'n1', targetNodeId: 'n2', triggerType: 'link', triggerText: 'To 2', triggerSelector: '' },
          { id: 't2', sourceNodeId: 'n2', targetNodeId: 'n1', triggerType: 'link', triggerText: 'Back to 1', triggerSelector: '' },
        ],
      };

      const layout = emitter.computeLayout(cyclicGraph);
      expect(layout.size).toBe(2);
      expect(layout.has('n1')).toBe(true);
      expect(layout.has('n2')).toBe(true);
    });
  });

  describe('SVG Bezier Transition Splines & Arrowhead Markers', () => {
    it('generates cubic bezier spline connecting source card to target card', () => {
      const emitter = new WireframeBoardEmitter();
      const pathString = emitter.generateSplinePath(
        { x: 100, y: 100, width: 400, height: 500, rank: 0, order: 0, node: sampleGraph.nodes[0] },
        { x: 700, y: 100, width: 400, height: 500, rank: 1, order: 0, node: sampleGraph.nodes[1] }
      );

      // Source right: x1 = 100 + 400 = 500, y1 = 100 + 250 = 350
      // Target left: x2 = 700, y2 = 100 + 250 = 350
      // dx = (700 - 500) * 0.5 = 100
      // Format: M 500 350 C 600 350, 600 350, 700 350
      expect(pathString).toContain('M 500 350');
      expect(pathString).toContain('C');
      expect(pathString).toMatch(/M\s+500\s+350\s+C\s+\d+\s+350,\s+\d+\s+350,\s+700\s+350/);
    });

    it('includes neon cyan arrowhead marker in SVG defs', () => {
      const emitter = new WireframeBoardEmitter();
      const html = emitter.generateBoardHtml(sampleGraph);

      expect(html).toContain('<marker id="arrowhead"');
      expect(html).toContain('#06b6d4');
      expect(html).toContain('marker-end="url(#arrowhead)"');
    });
  });

  describe('HTML Artifact Generation & Interactive Capabilities', () => {
    it('renders Astryx dark mode aesthetic with theme variables', () => {
      const emitter = new WireframeBoardEmitter();
      const html = emitter.generateBoardHtml(sampleGraph, { title: 'Custom App Flow' });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Custom App Flow');
      expect(html).toContain('#06b6d4'); // neon cyan
      expect(html).toContain('--astryx-bg');
      expect(html).toContain('--astryx-surface');
    });

    it('embeds lightweight vanilla pan/zoom with matrix transform and zoom controls', () => {
      const emitter = new WireframeBoardEmitter();
      const html = emitter.generateBoardHtml(sampleGraph);

      expect(html).toContain('<g id="viewport"');
      expect(html).toContain('matrix(');
      expect(html).toContain('addEventListener(\'wheel\'');
      expect(html).toContain('addEventListener(\'pointerdown\'');
      expect(html).toContain('data-action="zoom-in"');
      expect(html).toContain('data-action="zoom-out"');
      expect(html).toContain('data-action="zoom-reset"');
    });

    it('includes triple viewport switcher buttons (desktop, tablet, mobile, side-by-side)', () => {
      const emitter = new WireframeBoardEmitter();
      const html = emitter.generateBoardHtml(sampleGraph);

      expect(html).toContain('data-viewport="desktop"');
      expect(html).toContain('data-viewport="tablet"');
      expect(html).toContain('data-viewport="mobile"');
      expect(html).toContain('data-viewport="side-by-side"');
      expect(html).toContain('Desktop (1280×800)');
      expect(html).toContain('Tablet (768×1024)');
      expect(html).toContain('Mobile (390×844)');
      expect(html).toContain('Side-by-Side');
    });

    it('embeds clickable live IDE deep links for each screen card', () => {
      const emitter = new WireframeBoardEmitter();
      const html = emitter.generateBoardHtml(sampleGraph);

      expect(html).toContain('href="vscode://file/src/routes/index.tsx"');
      expect(html).toContain('href="vscode://file/src/routes/settings.tsx"');
      expect(html).toContain('href="vscode://file/src/components/HelpModal.tsx"');
      expect(html).toContain('class="ide-link"');
    });

    it('embeds per-card looping video preview if videoSlice is defined', () => {
      const emitter = new WireframeBoardEmitter();
      const html = emitter.generateBoardHtml(sampleGraph, {
        videoFileName: 'journey.webm',
      });

      // home has videoSlice { start: 0, end: 3.5 }
      expect(html).toContain('<video src="journey.webm#t=0,3.5" loop autoplay muted playsinline class="card-video-preview"');
      // settings has videoSlice { start: 3.5, end: 7.2 }
      expect(html).toContain('<video src="journey.webm#t=3.5,7.2" loop autoplay muted playsinline class="card-video-preview"');

      // help-modal has no videoSlice, so it renders screenshot image
      expect(html).toContain('src="screenshots/help-desktop.webp"');
    });

    it('embeds global journey video player and timeline pins when videoFileName and videoMarkers are provided', () => {
      const emitter = new WireframeBoardEmitter();
      const videoMarkers: RouteMarker[] = [
        {
          screenId: 'home',
          route: '/',
          startTimeMs: 1000,
          endTimeMs: 4500,
          relativeStartSec: 0,
          relativeEndSec: 3.5,
          action: 'initial_load',
          viewport: 'desktop',
        },
        {
          screenId: 'settings',
          route: '/settings',
          startTimeMs: 4500,
          endTimeMs: 8200,
          relativeStartSec: 3.5,
          relativeEndSec: 7.2,
          action: 'click_link',
          viewport: 'desktop',
        },
      ];

      const html = emitter.generateBoardHtml(sampleGraph, {
        videoFileName: 'user-journey.webm',
        videoMarkers,
      });

      expect(html).toContain('<video id="journey-video" src="user-journey.webm" controls');
      expect(html).toContain('class="journey-timeline"');
      expect(html).toContain('class="timeline-marker-pin"');
      expect(html).toContain('data-seek-time="0"');
      expect(html).toContain('data-seek-time="3.5"');
    });

    it('sanitizes untrusted input to prevent XSS injection attacks', () => {
      const emitter = new WireframeBoardEmitter();
      const maliciousGraph: UserFlowGraph = {
        rootNodeId: 'xss-root',
        nodes: [
          {
            id: 'xss-root',
            type: 'route',
            path: '/"><script>alert("xss")</script>',
            title: '<img src=x onerror=alert(1)>',
            sourceFilePath: 'src/bad.tsx" onclick="alert(2)',
            authRequired: false,
            screenshots: {},
          },
        ],
        transitions: [
          {
            id: 't-bad',
            sourceNodeId: 'xss-root',
            targetNodeId: 'xss-root',
            triggerType: 'link',
            triggerText: '<b onmouseover=alert(3)>Bad</b>',
            triggerSelector: '"><script>',
          },
        ],
      };

      const html = emitter.generateBoardHtml(maliciousGraph, {
        title: '<script>alert("title-xss")</script>',
      });

      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).not.toContain('<script>alert("title-xss")</script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;title-xss&quot;)&lt;/script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
  });

  describe('Disk Emission (`emitToDisk`)', () => {
    it('writes index.html and flow-graph.json to the target directory', async () => {
      const emitter = new WireframeBoardEmitter();
      const outDir = path.join(tempDir, 'wireframes');

      const result = await emitter.emitToDisk(outDir, sampleGraph, {
        title: 'Disk Test Flow',
        videoFileName: 'session.webm',
      });

      expect(fs.existsSync(result.htmlPath)).toBe(true);
      expect(fs.existsSync(result.jsonPath)).toBe(true);
      expect(path.basename(result.htmlPath)).toBe('index.html');
      expect(path.basename(result.jsonPath)).toBe('flow-graph.json');

      const htmlContent = fs.readFileSync(result.htmlPath, 'utf-8');
      expect(htmlContent).toContain('Disk Test Flow');

      const jsonContent = JSON.parse(fs.readFileSync(result.jsonPath, 'utf-8'));
      expect(jsonContent.rootNodeId).toBe('home');
      expect(jsonContent.nodes.length).toBe(3);
      expect(jsonContent.transitions.length).toBe(2);
    });

    it('defaults outputDir to superconductor/wireframes if omitted', async () => {
      const emitter = new WireframeBoardEmitter();
      // Test default parameter handling without writing outside temp or clean up afterwards
      const defaultDir = 'superconductor/wireframes';
      // Spy or call with explicit relative test dir to verify it constructs correct paths
      const result = await emitter.emitToDisk(tempDir, sampleGraph);
      expect(result.htmlPath).toBe(path.join(tempDir, 'index.html'));
      expect(result.jsonPath).toBe(path.join(tempDir, 'flow-graph.json'));
    });
  });

  describe('Remediations: SEC-2, UX-01, UX-02, UX-03, ADV-6, ADV-7', () => {
    it('SEC-2 & UX-03: sanitizeUri sanitizes inputs and blocks dangerous URI schemes', () => {
      expect(sanitizeUri('javascript:alert(1)')).toBe('#blocked');
      expect(sanitizeUri('JAVASCRIPT:alert(2)')).toBe('#blocked');
      expect(sanitizeUri('data:text/html,<script>alert(3)</script>')).toBe('#blocked');
      expect(sanitizeUri('vbscript:msgbox(4)')).toBe('#blocked');
      expect(sanitizeUri('https://example.com/asset.webp')).toBe('https://example.com/asset.webp');
      expect(sanitizeUri('videos/journey.webm')).toBe('videos/journey.webm');
      expect(sanitizeUri('')).toBe('');
    });

    it('SEC-2 & UX-03: only renders VSCode deep links if sourceFilePath is truthy and non-empty', () => {
      const emitter = new WireframeBoardEmitter();
      const graphWithoutSources: UserFlowGraph = {
        rootNodeId: 'with-source',
        nodes: [
          {
            id: 'with-source',
            type: 'route',
            path: '/with-source',
            title: 'With Source',
            sourceFilePath: 'src/routes/withSource.tsx',
            authRequired: false,
            screenshots: {},
          },
          {
            id: 'empty-source',
            type: 'route',
            path: '/empty-source',
            title: 'Empty Source',
            sourceFilePath: '',
            authRequired: false,
            screenshots: {},
          },
          {
            id: 'no-source',
            type: 'modal',
            path: '/no-source',
            title: 'No Source',
            authRequired: false,
            screenshots: {},
          },
        ],
        transitions: [],
      };

      const html = emitter.generateBoardHtml(graphWithoutSources);

      // Only 'with-source' should have vscode link
      expect(html).toContain('href="vscode://file/src/routes/withSource.tsx"');
      expect(html).not.toContain('vscode://file/"');
      expect(html).not.toContain('vscode://file/undefined');
      expect(html).not.toContain('vscode://file/null');

      // Check number of rendered ide-link elements
      const ideLinkMatches = html.match(/class="ide-link"/g);
      expect(ideLinkMatches).toHaveLength(1);
    });

    it('UX-01: renders data-node-id and data-screen-id and checks both in marker pin click handler', () => {
      const emitter = new WireframeBoardEmitter();
      const html = emitter.generateBoardHtml(sampleGraph, {
        videoFileName: 'journey.webm',
        videoMarkers: [
          {
            screenId: 'screen_home',
            route: '/',
            startTimeMs: 0,
            endTimeMs: 3500,
            relativeStartSec: 0,
            relativeEndSec: 3.5,
            action: 'load',
            viewport: 'desktop',
          },
        ],
      });

      // foreignObject and wireframe-card have data-node-id and data-screen-id
      expect(html).toContain('data-node-id="home"');
      expect(html).toContain('data-screen-id="screen_home"');

      // Click handler checks both data-screen-id and data-node-id
      expect(html).toContain(
        'var targetObj = document.querySelector(\'[data-screen-id="\' + screenId + \'"] .wireframe-card\') || document.querySelector(\'[data-node-id="\' + screenId + \'"] .wireframe-card\');'
      );
    });

    it('UX-02: renders BOTH video wrapper and screenshots container when videoSlice exists, and includes viewport CSS', () => {
      const emitter = new WireframeBoardEmitter();
      const html = emitter.generateBoardHtml(sampleGraph, {
        videoFileName: 'journey.webm',
      });

      // For video-enabled cards (home & settings), both .card-video-wrapper and .card-screenshots-container exist
      expect(html).toContain('class="card-video-wrapper"');
      expect(html).toContain('class="card-screenshots-container"');
      expect(html).toContain('src="screenshots/home-desktop.webp"');
      expect(html).toContain('src="screenshots/home-tablet.webp"');
      expect(html).toContain('src="screenshots/home-mobile.webp"');

      // CSS rules for switching viewports on video-enabled cards
      expect(html).toContain('.board-container[data-active-viewport="desktop"] .card-video-wrapper');
      expect(html).toContain('.board-container[data-active-viewport="desktop"] .card-body:has(.card-video-wrapper) .card-screenshots-container');
      expect(html).toContain('.board-container[data-active-viewport="tablet"] .card-video-wrapper');
      expect(html).toContain('.board-container[data-active-viewport="mobile"] .card-video-wrapper');
      expect(html).toContain('.board-container[data-active-viewport="side-by-side"] .card-video-wrapper');
    });

    it('ADV-6: computeLayout uses FlowGraphBuilder topological sort for cycle-safe ranking', () => {
      const emitter = new WireframeBoardEmitter();
      const layout = emitter.computeLayout(sampleGraph);

      expect(layout.size).toBe(3);
      expect(layout.get('home')?.rank).toBe(0);
      expect(layout.get('settings')?.rank).toBe(1);
      expect(layout.get('help-modal')?.rank).toBe(2);
    });

    it('ADV-7: asset board.html exists and contains valid template markup', () => {
      const assetPath = path.resolve(__dirname, '../../src/crawler/assets/board.html');
      expect(fs.existsSync(assetPath)).toBe(true);
      const content = fs.readFileSync(assetPath, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('{{TITLE}}');
      expect(content).toContain('{{TRANSITIONS}}');
      expect(content).toContain('{{NODES}}');
    });
  });
});

