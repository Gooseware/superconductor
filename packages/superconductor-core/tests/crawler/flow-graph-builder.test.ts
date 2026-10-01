import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FlowGraphBuilder,
  FlowGraphCycleError,
  AffordanceProber,
  HeadlessCrawlerEngine,
  type FlowNode,
  type FlowTransition,
  type UserFlowGraph,
} from '../../src/crawler/index.js';

describe('FlowGraphBuilder', () => {
  let builder: FlowGraphBuilder;

  beforeEach(() => {
    builder = new FlowGraphBuilder();
  });

  describe('Node & Transition Management', () => {
    it('creates graph and manages route, modal, and drawer nodes', () => {
      const routeNode: FlowNode = {
        id: 'route:/dashboard',
        type: 'route',
        path: '/dashboard',
        title: 'Dashboard Screen',
        sourceFilePath: 'src/routes/dashboard.tsx',
        authRequired: true,
        screenshots: { desktop: 'data:image/webp;base64,route-shot' },
      };

      const modalNode: FlowNode = {
        id: 'modal:/dashboard:User Profile',
        type: 'modal',
        path: '/dashboard',
        title: 'User Profile',
        sourceFilePath: 'src/components/ProfileModal.tsx',
        authRequired: true,
        screenshots: { desktop: 'data:image/webp;base64,modal-shot' },
      };

      const drawerNode: FlowNode = {
        id: 'drawer:/dashboard:Navigation Menu',
        type: 'drawer',
        path: '/dashboard',
        title: 'Navigation Menu',
        sourceFilePath: 'src/components/NavDrawer.tsx',
        authRequired: false,
        screenshots: { desktop: 'data:image/webp;base64,drawer-shot' },
      };

      builder.addNode(routeNode);
      builder.addNode(modalNode);
      builder.addNode(drawerNode);

      expect(builder.getNodes()).toHaveLength(3);
      expect(builder.getNode('route:/dashboard')).toEqual(routeNode);
      expect(builder.getNode('modal:/dashboard:User Profile')).toEqual(modalNode);
      expect(builder.getNode('drawer:/dashboard:Navigation Menu')).toEqual(drawerNode);
      expect(builder.getRootNodeId()).toBe('route:/dashboard');
    });

    it('manages directed transitions and filters by source or target', () => {
      const nodeA: FlowNode = {
        id: 'route:/home',
        type: 'route',
        path: '/',
        title: 'Home',
        sourceFilePath: 'src/routes/home.tsx',
        authRequired: false,
        screenshots: {},
      };
      const nodeB: FlowNode = {
        id: 'route:/pricing',
        type: 'route',
        path: '/pricing',
        title: 'Pricing',
        sourceFilePath: 'src/routes/pricing.tsx',
        authRequired: false,
        screenshots: {},
      };
      const modal: FlowNode = {
        id: 'modal:/home:Contact Us',
        type: 'modal',
        path: '/',
        title: 'Contact Us',
        sourceFilePath: '',
        authRequired: false,
        screenshots: {},
      };

      builder.addNode(nodeA);
      builder.addNode(nodeB);
      builder.addNode(modal);

      const t1: FlowTransition = {
        id: 't-home-pricing',
        sourceNodeId: 'route:/home',
        targetNodeId: 'route:/pricing',
        triggerType: 'link',
        triggerText: 'View Pricing',
        triggerSelector: 'a[href="/pricing"]',
      };
      const t2: FlowTransition = {
        id: 't-home-modal',
        sourceNodeId: 'route:/home',
        targetNodeId: 'modal:/home:Contact Us',
        triggerType: 'modal_trigger',
        triggerText: 'Contact',
        triggerSelector: 'button#contact-btn',
      };

      builder.addTransition(t1);
      builder.addTransition(t2);

      expect(builder.getTransitions()).toHaveLength(2);
      expect(builder.getTransitionsFrom('route:/home')).toHaveLength(2);
      expect(builder.getTransitionsFrom('route:/pricing')).toHaveLength(0);
      expect(builder.getTransitionsTo('route:/pricing')).toHaveLength(1);
      expect(builder.getTransitionsTo('route:/pricing')[0].id).toBe('t-home-pricing');
    });

    it('deduplicates identical transitions cleanly', () => {
      builder.addNode({
        id: 'A',
        type: 'route',
        path: '/a',
        title: 'A',
        sourceFilePath: '',
        authRequired: false,
        screenshots: {},
      });
      builder.addNode({
        id: 'B',
        type: 'route',
        path: '/b',
        title: 'B',
        sourceFilePath: '',
        authRequired: false,
        screenshots: {},
      });

      const transition: FlowTransition = {
        id: 'edge-1',
        sourceNodeId: 'A',
        targetNodeId: 'B',
        triggerType: 'link',
        triggerText: 'Go to B',
        triggerSelector: '#b-link',
      };

      builder.addTransition(transition);
      builder.addTransition(transition);

      expect(builder.getTransitions()).toHaveLength(1);
    });
  });

  describe('Topological Sorting (Kahn\'s Algorithm) & Layout Ranks', () => {
    it('sorts a linear chain assigning ascending ranks (0, 1, 2)', () => {
      builder.addNode({ id: 'A', type: 'route', path: '/a', title: 'A', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'B', type: 'route', path: '/b', title: 'B', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'C', type: 'route', path: '/c', title: 'C', sourceFilePath: '', authRequired: false, screenshots: {} });

      builder.addTransition({ id: 't1', sourceNodeId: 'A', targetNodeId: 'B', triggerType: 'link', triggerText: 'to B', triggerSelector: '' });
      builder.addTransition({ id: 't2', sourceNodeId: 'B', targetNodeId: 'C', triggerType: 'link', triggerText: 'to C', triggerSelector: '' });

      const sorted = builder.topologicalSort();
      expect(sorted.map(s => s.id)).toEqual(['A', 'B', 'C']);
      expect(sorted.map(s => s.rank)).toEqual([0, 1, 2]);

      const waves = builder.getWaves();
      expect(waves).toHaveLength(3);
      expect(waves[0].map(n => n.id)).toEqual(['A']);
      expect(waves[1].map(n => n.id)).toEqual(['B']);
      expect(waves[2].map(n => n.id)).toEqual(['C']);

      const rankedMap = builder.getRankedNodes();
      expect(rankedMap.get('A')).toBe(0);
      expect(rankedMap.get('B')).toBe(1);
      expect(rankedMap.get('C')).toBe(2);
    });

    it('correctly handles diamond DAG topologies with concurrent branches', () => {
      // A -> B, A -> C, B -> D, C -> D
      builder.addNode({ id: 'A', type: 'route', path: '/a', title: 'A', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'B', type: 'route', path: '/b', title: 'B', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'C', type: 'route', path: '/c', title: 'C', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'D', type: 'route', path: '/d', title: 'D', sourceFilePath: '', authRequired: false, screenshots: {} });

      builder.addTransition({ id: 't1', sourceNodeId: 'A', targetNodeId: 'B', triggerType: 'link', triggerText: '', triggerSelector: '' });
      builder.addTransition({ id: 't2', sourceNodeId: 'A', targetNodeId: 'C', triggerType: 'link', triggerText: '', triggerSelector: '' });
      builder.addTransition({ id: 't3', sourceNodeId: 'B', targetNodeId: 'D', triggerType: 'link', triggerText: '', triggerSelector: '' });
      builder.addTransition({ id: 't4', sourceNodeId: 'C', targetNodeId: 'D', triggerType: 'link', triggerText: '', triggerSelector: '' });

      const sorted = builder.topologicalSort();
      expect(sorted[0].id).toBe('A');
      expect(sorted[0].rank).toBe(0);

      // B and C are rank 1
      const rank1 = sorted.filter(n => n.rank === 1).map(n => n.id).sort();
      expect(rank1).toEqual(['B', 'C']);

      // D is rank 2
      const rank2 = sorted.filter(n => n.rank === 2).map(n => n.id);
      expect(rank2).toEqual(['D']);
    });

    it('enforces longest-path rank bounds for asymmetrical DAG branches', () => {
      // A -> B -> C -> D, and direct edge A -> D
      builder.addNode({ id: 'A', type: 'route', path: '/a', title: 'A', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'B', type: 'route', path: '/b', title: 'B', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'C', type: 'route', path: '/c', title: 'C', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'D', type: 'route', path: '/d', title: 'D', sourceFilePath: '', authRequired: false, screenshots: {} });

      builder.addTransition({ id: 't1', sourceNodeId: 'A', targetNodeId: 'B', triggerType: 'link', triggerText: '', triggerSelector: '' });
      builder.addTransition({ id: 't2', sourceNodeId: 'B', targetNodeId: 'C', triggerType: 'link', triggerText: '', triggerSelector: '' });
      builder.addTransition({ id: 't3', sourceNodeId: 'C', targetNodeId: 'D', triggerType: 'link', triggerText: '', triggerSelector: '' });
      builder.addTransition({ id: 't4', sourceNodeId: 'A', targetNodeId: 'D', triggerType: 'link', triggerText: '', triggerSelector: '' });

      const rankedMap = builder.getRankedNodes();
      expect(rankedMap.get('A')).toBe(0);
      expect(rankedMap.get('B')).toBe(1);
      expect(rankedMap.get('C')).toBe(2);
      expect(rankedMap.get('D')).toBe(3); // Rank must be 3 because of path A -> B -> C -> D
    });
  });

  describe('Topological Cycle Detection', () => {
    it('detects cycles in graph and throws FlowGraphCycleError by default', () => {
      builder.addNode({ id: 'A', type: 'route', path: '/a', title: 'A', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'B', type: 'route', path: '/b', title: 'B', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'C', type: 'route', path: '/c', title: 'C', sourceFilePath: '', authRequired: false, screenshots: {} });

      // Cycle: A -> B -> C -> A
      builder.addTransition({ id: 't1', sourceNodeId: 'A', targetNodeId: 'B', triggerType: 'link', triggerText: '', triggerSelector: '' });
      builder.addTransition({ id: 't2', sourceNodeId: 'B', targetNodeId: 'C', triggerType: 'link', triggerText: '', triggerSelector: '' });
      builder.addTransition({ id: 't3', sourceNodeId: 'C', targetNodeId: 'A', triggerType: 'link', triggerText: '', triggerSelector: '' });

      expect(builder.hasCycles()).toBe(true);
      expect(builder.hasCycle()).toBe(true);

      const cycle = builder.detectCycle();
      expect(cycle).toBeDefined();
      expect(cycle).toContain('A');
      expect(cycle).toContain('B');
      expect(cycle).toContain('C');

      expect(() => builder.topologicalSort()).toThrow(FlowGraphCycleError);
    });

    it('breaks cycles when breakCycles: true is specified to enable layout ranking', () => {
      builder.addNode({ id: 'Home', type: 'route', path: '/', title: 'Home', sourceFilePath: '', authRequired: false, screenshots: {} });
      builder.addNode({ id: 'About', type: 'route', path: '/about', title: 'About', sourceFilePath: '', authRequired: false, screenshots: {} });

      // Circular link between Home and About
      builder.addTransition({ id: 't1', sourceNodeId: 'Home', targetNodeId: 'About', triggerType: 'link', triggerText: 'About', triggerSelector: '' });
      builder.addTransition({ id: 't2', sourceNodeId: 'About', targetNodeId: 'Home', triggerType: 'link', triggerText: 'Back to Home', triggerSelector: '' });

      expect(builder.hasCycles()).toBe(true);

      const sorted = builder.topologicalSort({ breakCycles: true });
      expect(sorted).toHaveLength(2);
      expect(sorted[0].id).toBe('Home');
      expect(sorted[0].rank).toBe(0);
      expect(sorted[1].id).toBe('About');
      expect(sorted[1].rank).toBe(1);
    });
  });

  describe('Graph Serialization & Deserialization', () => {
    it('serializes to canonical UserFlowGraph JSON and restores faithfully', () => {
      const graphData: UserFlowGraph = {
        rootNodeId: 'route:/app',
        nodes: [
          {
            id: 'route:/app',
            type: 'route',
            path: '/app',
            title: 'App Main',
            sourceFilePath: 'src/app.tsx',
            authRequired: true,
            screenshots: { desktop: 'app-shot' },
          },
          {
            id: 'modal:/app:Settings',
            type: 'modal',
            path: '/app',
            title: 'Settings',
            sourceFilePath: '',
            authRequired: true,
            screenshots: { desktop: 'settings-shot' },
          },
        ],
        transitions: [
          {
            id: 't-app-modal',
            sourceNodeId: 'route:/app',
            targetNodeId: 'modal:/app:Settings',
            triggerType: 'modal_trigger',
            triggerText: 'Open Settings',
            triggerSelector: 'button#open-settings',
          },
        ],
      };

      const restored = FlowGraphBuilder.fromJSON(graphData);
      expect(restored.getRootNodeId()).toBe('route:/app');
      expect(restored.getNodes()).toHaveLength(2);
      expect(restored.getTransitions()).toHaveLength(1);
      expect(restored.getNode('modal:/app:Settings')?.title).toBe('Settings');

      const reSerialized = restored.toJSON();
      expect(reSerialized).toEqual(graphData);
    });
  });
});

describe('AffordanceProber', () => {
  let engine: HeadlessCrawlerEngine | null = null;
  let prober: AffordanceProber;

  beforeEach(() => {
    prober = new AffordanceProber();
  });

  afterEach(async () => {
    if (engine) {
      await engine.stop();
      engine = null;
    }
  });

  it('blocks destructive network mutations (POST, PUT, DELETE, PATCH) and tracks blocked calls', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    await prober.attachNetworkInterceptor(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Mutation Test</title></head>
        <body><h1>Mutation Test Page</h1></body>
      </html>
    `);

    // Test non-GET requests are rejected/aborted
    const results = await page.evaluate(async () => {
      const outcomes: Record<string, string> = {};

      const testMethod = async (method: string) => {
        try {
          await fetch(`http://localhost:9999/api/resource`, { method });
          outcomes[method] = 'success';
        } catch {
          outcomes[method] = 'blocked';
        }
      };

      await testMethod('POST');
      await testMethod('PUT');
      await testMethod('DELETE');
      await testMethod('PATCH');

      return outcomes;
    });

    expect(results.POST).toBe('blocked');
    expect(results.PUT).toBe('blocked');
    expect(results.DELETE).toBe('blocked');
    expect(results.PATCH).toBe('blocked');

    const blocked = prober.getBlockedMutations();
    expect(blocked).toHaveLength(4);
    expect(blocked.map(b => b.method)).toEqual(['POST', 'PUT', 'DELETE', 'PATCH']);
  });

  it('attachNetworkInterceptor aborts cloud metadata and external domains to prevent SSRF', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    const proberInstance = new AffordanceProber();
    await proberInstance.attachNetworkInterceptor(page, 'http://localhost:3000');

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>SSRF Test</title></head>
        <body><h1>SSRF Interception Test</h1></body>
      </html>
    `);

    const results = await page.evaluate(async () => {
      const outcomes: Record<string, string> = {};

      const testUrl = async (key: string, url: string) => {
        try {
          await fetch(url);
          outcomes[key] = 'success';
        } catch {
          outcomes[key] = 'blocked';
        }
      };

      await testUrl('metadataIp', 'http://169.254.169.254/latest/meta-data');
      await testUrl('metadataDomain', 'http://metadata.google.internal/computeMetadata/v1/');
      await testUrl('externalDomain', 'http://external-evil.com/leak');

      return outcomes;
    });

    expect(results.metadataIp).toBe('blocked');
    expect(results.metadataDomain).toBe('blocked');
    expect(results.externalDomain).toBe('blocked');
  });

  it('probeRoute delegates to discoverAffordancesWithJev by default', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Jev Route Probe</title></head>
        <body>
          <a href="/about">About Us</a>
          <a href="/contact">Contact</a>
        </body>
      </html>
    `);

    const proberInstance = new AffordanceProber();
    const jevSpy = vi.spyOn(proberInstance, 'discoverAffordancesWithJev');

    const builder = new FlowGraphBuilder();
    const result = await proberInstance.probeRoute(page, '/test', builder);

    expect(jevSpy).toHaveBeenCalled();
    expect(result.affordances.length).toBeGreaterThan(0);
  }, 15000);

  it('discovers safe affordances and strictly excludes forms, submit buttons, and destructive keywords', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Affordances Test</title></head>
        <body>
          <nav>
            <!-- Safe Internal Links -->
            <a href="/dashboard" id="dash-link">Dashboard</a>
            <a href="/settings/profile" id="profile-link">Profile</a>

            <!-- Excluded: External Links -->
            <a href="https://external-service.com/help" id="ext-link">Help</a>
            <a href="#" id="hash-link">Hash Link</a>

            <!-- Safe Modal Triggers -->
            <button data-state="closed" id="open-settings" aria-haspopup="dialog">Preferences</button>
            <button aria-haspopup="dialog" data-modal-target="edit-profile-modal" id="open-modal">Edit Profile</button>

            <!-- Safe Drawer Trigger -->
            <button data-drawer-target="nav-drawer" aria-controls="nav-drawer" id="open-drawer">Side Menu</button>
          </nav>

          <!-- STRICT EXCLUSIONS: Forms, Submits & Destructive Keywords -->
          <form action="/submit" method="POST">
            <button type="submit" id="btn-submit">Submit Form</button>
            <button id="btn-implicit-submit">Save Settings</button>
          </form>

          <button id="btn-delete" class="btn-danger">Delete Project</button>
          <button id="btn-remove" aria-label="Remove member">X</button>
          <button id="btn-drop" data-action="drop">Drop Database</button>
          <a href="/logout" id="link-logout">Logout</a>
          <a href="/sign-out" id="link-signout">Sign Out</a>
        </body>
      </html>
    `;

    await page.setContent(html);

    const affordances = await prober.discoverAffordances(page);

    // 1. Verify safe links discovered
    const linkAffordances = affordances.filter(a => a.type === 'link');
    const linkTargets = linkAffordances.map(a => a.target);
    expect(linkTargets).toContain('/dashboard');
    expect(linkTargets).toContain('/settings/profile');
    expect(linkTargets).not.toContain('https://external-service.com/help');
    expect(linkTargets).not.toContain('/logout');
    expect(linkTargets).not.toContain('/sign-out');

    // 2. Verify safe modal triggers discovered
    const modalTriggers = affordances.filter(a => a.type === 'modal_trigger');
    expect(modalTriggers.some(m => m.selector.includes('open-settings') || m.text.includes('Preferences'))).toBe(true);
    expect(modalTriggers.some(m => m.selector.includes('open-modal') || m.text.includes('Edit Profile'))).toBe(true);

    // 3. Verify safe drawer triggers discovered
    const drawerTriggers = affordances.filter(a => a.type === 'drawer_trigger');
    expect(drawerTriggers.some(d => d.selector.includes('open-drawer') || d.text.includes('Side Menu'))).toBe(true);

    // 4. Verify STRICT EXCLUSIONS: No submits, no destructive keywords
    for (const a of affordances) {
      expect(a.text.toLowerCase()).not.toContain('delete');
      expect(a.text.toLowerCase()).not.toContain('remove');
      expect(a.text.toLowerCase()).not.toContain('drop');
      expect(a.text.toLowerCase()).not.toContain('logout');
      expect(a.text.toLowerCase()).not.toContain('sign out');
      expect(a.text.toLowerCase()).not.toContain('submit');
      expect(a.selector).not.toContain('btn-submit');
      expect(a.selector).not.toContain('btn-implicit-submit');
      expect(a.selector).not.toContain('btn-delete');
    }
  });

  it('executes safe modal probing protocol: captures screenshot, records node & transition, and restores base state via Escape', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Modal Probing Test</title>
          <style>
            #test-modal {
              display: none;
              position: fixed;
              top: 50px;
              left: 50px;
              width: 300px;
              background: white;
              border: 1px solid black;
              padding: 20px;
            }
            #test-modal[data-state="open"] {
              display: block;
            }
          </style>
        </head>
        <body>
          <h1>App Dashboard</h1>
          <button id="modal-btn" aria-haspopup="dialog" data-state="closed">Edit Profile</button>

          <div id="test-modal" role="dialog" data-state="closed">
            <h2 id="modal-heading">Edit Profile Settings</h2>
            <p>Modify your user profile settings here.</p>
            <button id="close-btn" aria-label="Close">Close</button>
          </div>

          <script>
            const btn = document.getElementById('modal-btn');
            const modal = document.getElementById('test-modal');
            const closeBtn = document.getElementById('close-btn');

            btn.addEventListener('click', () => {
              modal.style.display = 'block';
              modal.setAttribute('data-state', 'open');
            });

            document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                modal.style.display = 'none';
                modal.setAttribute('data-state', 'closed');
              }
            });

            closeBtn.addEventListener('click', () => {
              modal.style.display = 'none';
              modal.setAttribute('data-state', 'closed');
            });
          </script>
        </body>
      </html>
    `;

    await page.setContent(html);

    const graphBuilder = new FlowGraphBuilder();
    const baseNode: FlowNode = {
      id: 'route:/dashboard',
      type: 'route',
      path: '/dashboard',
      title: 'App Dashboard',
      sourceFilePath: 'src/routes/dashboard.tsx',
      authRequired: true,
      screenshots: {},
    };
    graphBuilder.addNode(baseNode);

    const affordances = await prober.discoverAffordances(page);
    const modalTrigger = affordances.find(a => a.type === 'modal_trigger');
    expect(modalTrigger).toBeDefined();

    // Probe the modal
    const result = await prober.probeModal(
      page,
      modalTrigger!,
      'route:/dashboard',
      '/dashboard',
      graphBuilder
    );

    expect(result).not.toBeNull();
    const { modalNode, transition } = result!;

    // Modal node verification
    expect(modalNode.id).toBe('modal:/dashboard:Edit Profile Settings');
    expect(modalNode.type).toBe('modal');
    expect(modalNode.title).toBe('Edit Profile Settings');
    expect(modalNode.path).toBe('/dashboard');
    expect(modalNode.screenshots.desktop).toBeDefined();

    // Transition verification
    expect(transition.sourceNodeId).toBe('route:/dashboard');
    expect(transition.targetNodeId).toBe(modalNode.id);
    expect(transition.triggerType).toBe('modal_trigger');
    expect(transition.triggerText).toBe('Edit Profile');

    // Graph updated
    expect(graphBuilder.getNode(modalNode.id)).toBeDefined();
    expect(graphBuilder.getTransitionsFrom('route:/dashboard')).toHaveLength(1);

    // Escape backtracking restored base state: modal should be hidden again
    const modalDisplay = await page.$eval('#test-modal', el => window.getComputedStyle(el).display);
    expect(modalDisplay).toBe('none');
  });

  it('falls back to clicking [aria-label="Close"] if Escape does not dismiss modal', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    // Modal that only closes on close button click, does not implement Escape handler
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <button id="modal-btn" aria-haspopup="dialog" data-state="closed">Open Modal</button>

          <div id="stubborn-modal" role="dialog" style="display: none;" data-state="closed">
            <h3>Strict Modal</h3>
            <button id="close-btn" aria-label="Close">Dismiss</button>
          </div>

          <script>
            const btn = document.getElementById('modal-btn');
            const modal = document.getElementById('stubborn-modal');
            const closeBtn = document.getElementById('close-btn');

            btn.addEventListener('click', () => {
              modal.style.display = 'block';
              modal.setAttribute('data-state', 'open');
            });

            closeBtn.addEventListener('click', () => {
              modal.style.display = 'none';
              modal.setAttribute('data-state', 'closed');
            });
          </script>
        </body>
      </html>
    `;

    await page.setContent(html);

    const graphBuilder = new FlowGraphBuilder();
    const affordances = await prober.discoverAffordances(page);
    const trigger = affordances.find(a => a.type === 'modal_trigger')!;

    const result = await prober.probeModal(page, trigger, 'route:/test', '/test', graphBuilder);
    expect(result).not.toBeNull();

    // Modal should be closed via dismiss button fallback
    const isVisible = await page.$eval('#stubborn-modal', el => el.getAttribute('data-state') === 'open');
    expect(isVisible).toBe(false);
  });
});
