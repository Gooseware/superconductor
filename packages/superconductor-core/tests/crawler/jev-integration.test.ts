import { describe, it, expect, afterEach, vi } from 'vitest';
import { HeadlessCrawlerEngine } from '../../src/crawler/runner.js';
import { JevSnapshotEngine, takeJevSnapshot } from '../../src/crawler/jevSnapshot.js';
import { AffordanceProber } from '../../src/crawler/prober.js';
import { FlowGraphBuilder } from '../../src/crawler/graph.js';
import { JevBrowserAdapter } from '../../src/crawler/jevAdapter.js';

describe('Jev Browser Integration & Semantic DOM Snapshot Engine', () => {
  let engine: HeadlessCrawlerEngine | null = null;

  afterEach(async () => {
    if (engine) {
      await engine.stop();
      engine = null;
    }
  });

  it('takeJevSnapshot calculates accessible names, roles, geometry, and discrete action space', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Jev Semantic Test Page</title>
          <style>
            body { margin: 0; padding: 20px; font-family: sans-serif; }
            .hidden { display: none; }
            .invisible { visibility: hidden; }
            .zero-opacity { opacity: 0; }
            button, a, input, select { display: inline-block; margin: 10px; padding: 8px 16px; }
          </style>
        </head>
        <body>
          <h1 id="main-heading">Control Dashboard</h1>
          
          <!-- Accessible name via text content -->
          <button id="btn-save">Save Settings</button>

          <!-- Accessible name via aria-label -->
          <button id="btn-icon" aria-label="Settings Gear">⚙</button>

          <!-- Accessible name via aria-labelledby -->
          <span id="lbl-info">Documentation Portal</span>
          <a href="/docs" id="link-docs" aria-labelledby="lbl-info">Old Docs</a>

          <!-- Accessible name via <label> -->
          <label for="input-username">User Handle</label>
          <input id="input-username" type="text" placeholder="e.g. gooseware" value="admin" />

          <!-- Combobox (select) -->
          <label for="select-role">Account Role</label>
          <select id="select-role">
            <option value="admin" selected>Administrator</option>
            <option value="viewer">Read Only Viewer</option>
          </select>

          <!-- Tab role -->
          <div role="tab" id="tab-analytics" aria-selected="true">Analytics Overview</div>

          <!-- Dialog overlay -->
          <dialog id="test-dialog" open>
            <h2>Confirmation Modal</h2>
            <button id="btn-confirm-ok">Confirm Action</button>
          </dialog>

          <!-- Hidden elements that must be excluded by visibility checks -->
          <button id="btn-hidden-css" class="hidden">Hidden CSS</button>
          <button id="btn-invisible-css" class="invisible">Invisible CSS</button>
          <button id="btn-zero-opacity" class="zero-opacity">Zero Opacity</button>
          <div aria-hidden="true">
            <button id="btn-aria-hidden">Aria Hidden Button</button>
          </div>
          <div inert>
            <button id="btn-inert">Inert Button</button>
          </div>
        </body>
      </html>
    `;

    await page.setContent(html);

    const snapshot = await takeJevSnapshot(page);

    // Verify snapshot structure
    expect(snapshot.title).toBe('Jev Semantic Test Page');
    expect(snapshot.w).toBe(1280);
    expect(snapshot.h).toBe(800);
    expect(snapshot.text).toContain('Control Dashboard');
    expect(snapshot.marker).toBeDefined();
    expect(snapshot.page_key).toBeDefined();
    expect(snapshot.guards).toBeDefined();
    expect(Array.isArray(snapshot.actions)).toBe(true);

    // Discrete action space ids: e1, e2, etc.
    const actionIds = snapshot.actions.map(a => a.id);
    expect(actionIds).toContain('e1');
    expect(actionIds).toContain('e2');
    expect(actionIds).toContain('wait');

    // Verify accessible name resolution
    const saveBtnAction = snapshot.actions.find(a => a.label.includes('Save Settings'));
    expect(saveBtnAction).toBeDefined();
    expect(saveBtnAction?.role).toBe('button');
    expect(saveBtnAction?.rect?.w).toBeGreaterThan(0);
    expect(saveBtnAction?.rect?.h).toBeGreaterThan(0);

    const iconBtnAction = snapshot.actions.find(a => a.label === 'Settings Gear');
    expect(iconBtnAction).toBeDefined();

    const linkAction = snapshot.actions.find(a => a.label === 'Documentation Portal');
    expect(linkAction).toBeDefined();
    expect(linkAction?.role).toBe('link');

    const usernameAction = snapshot.actions.find(a => a.label === 'User Handle' && a.kind === 'fill');
    expect(usernameAction).toBeDefined();
    expect(usernameAction?.value).toBe('admin');

    const selectAction = snapshot.actions.find(a => a.kind === 'select' && a.value === 'viewer');
    expect(selectAction).toBeDefined();

    const tabAction = snapshot.actions.find(a => a.role === 'tab');
    expect(tabAction).toBeDefined();
    expect(tabAction?.selected).toBe('true');

    // Verify hidden elements were excluded
    const hiddenLabels = snapshot.actions.map(a => a.label);
    expect(hiddenLabels).not.toContain('Hidden CSS');
    expect(hiddenLabels).not.toContain('Invisible CSS');
    expect(hiddenLabels).not.toContain('Zero Opacity');
    expect(hiddenLabels).not.toContain('Aria Hidden Button');
    expect(hiddenLabels).not.toContain('Inert Button');
  });

  it('verifies WeakMap node identity caching and state guards across snapshots', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <button id="persistent-btn">Persistent Action</button>
        </body>
      </html>
    `);

    const snapshot1 = await takeJevSnapshot(page);
    const btn1 = snapshot1.actions.find(a => a.label === 'Persistent Action');
    expect(btn1).toBeDefined();
    expect(btn1?.node).toBeDefined();

    // Take second snapshot without DOM mutation
    const snapshot2 = await takeJevSnapshot(page);
    const btn2 = snapshot2.actions.find(a => a.label === 'Persistent Action');
    expect(btn2).toBeDefined();

    // Node ID must be preserved via WeakMap cache
    expect(btn1?.node).toBe(btn2?.node);

    // Verify window.__jevFast existence in page
    const hasJevCache = await page.evaluate(() => {
      return typeof (window as any).__jevFast === 'object' &&
        (window as any).__jevFast.ids instanceof WeakMap &&
        (window as any).__jevFast.nodes instanceof Map;
    });
    expect(hasJevCache).toBe(true);

    // Verify guards map contains entry for the node
    const nodeKey = btn1!.node!;
    expect(snapshot1.guards[nodeKey]).toBeDefined();
    expect(snapshot1.guards[nodeKey][1]).toBe('button'); // role
    expect(snapshot1.guards[nodeKey][2]).toBe('Persistent Action'); // name
  });

  it('discoverAffordancesWithJev extracts high-fidelity affordances while strictly enforcing read-only guards', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <!-- Safe navigation affordances -->
          <a href="/dashboard" id="nav-dashboard">Dashboard Overview</a>
          <button id="modal-open" aria-haspopup="dialog" data-modal-target="#details-dialog">Open Details</button>
          <button id="drawer-open" data-drawer-target="#sidebar-drawer">Open Sidebar Drawer</button>

          <!-- Destructive buttons (MUST BE EXCLUDED) -->
          <button id="btn-delete" class="danger">Delete Account</button>
          <button id="btn-remove">Remove Project</button>
          <button id="btn-drop">Drop Database</button>
          <button id="btn-logout">Log Out</button>
          <button id="btn-signout">Sign Out</button>

          <!-- Form submit buttons (MUST BE EXCLUDED) -->
          <form action="/api/update" method="POST">
            <input type="text" name="data" value="test" />
            <button type="submit" id="btn-submit">Submit Form</button>
            <input type="submit" id="input-submit" value="Submit Form Input" />
          </form>
        </body>
      </html>
    `;

    await page.setContent(html);

    const prober = new AffordanceProber();
    const affordances = await prober.discoverAffordancesWithJev(page);

    const texts = affordances.map(a => a.text);
    const types = affordances.map(a => a.type);

    // Safe affordances present
    expect(texts).toContain('Dashboard Overview');
    expect(types).toContain('link');

    expect(texts).toContain('Open Details');
    expect(types).toContain('modal_trigger');

    expect(texts).toContain('Open Sidebar Drawer');
    expect(types).toContain('drawer_trigger');

    // Destructive affordances strictly excluded
    expect(texts).not.toContain('Delete Account');
    expect(texts).not.toContain('Remove Project');
    expect(texts).not.toContain('Drop Database');
    expect(texts).not.toContain('Log Out');
    expect(texts).not.toContain('Sign Out');

    // Submit buttons strictly excluded
    expect(texts).not.toContain('Submit Form');
    expect(texts).not.toContain('Submit Form Input');
  });

  it('probeModal verifies Jev page_key and node guards before and after modal trigger and dismisses overlay', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });
    await engine.start();
    const page = await engine.createPage('desktop');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            #dialog-box { display: none; }
            #dialog-box.open { display: block; position: fixed; top: 50px; left: 50px; width: 300px; height: 200px; background: white; border: 1px solid black; }
          </style>
        </head>
        <body>
          <button id="btn-view-details" aria-haspopup="dialog">View Details Modal</button>

          <div id="dialog-box" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <h2 id="dialog-title">Account Details</h2>
            <p>Details content here...</p>
            <button id="btn-close" aria-label="Close">Close</button>
          </div>

          <script>
            const btn = document.getElementById('btn-view-details');
            const dlg = document.getElementById('dialog-box');
            const closeBtn = document.getElementById('btn-close');

            btn.addEventListener('click', () => {
              dlg.classList.add('open');
            });
            closeBtn.addEventListener('click', () => {
              dlg.classList.remove('open');
            });
            document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                dlg.classList.remove('open');
              }
            });
          </script>
        </body>
      </html>
    `;

    await page.setContent(html);

    const prober = new AffordanceProber();
    const affordances = await prober.discoverAffordancesWithJev(page);
    const modalTrigger = affordances.find(a => a.type === 'modal_trigger');
    expect(modalTrigger).toBeDefined();

    const builder = new FlowGraphBuilder();
    const result = await prober.probeModal(page, modalTrigger!, 'route:/details', '/details', builder);

    expect(result).not.toBeNull();
    expect(result?.modalNode.title).toBe('Account Details');
    expect(result?.modalNode.type).toBe('modal');
    expect(result?.transition.triggerType).toBe('modal_trigger');

    // Verify modal overlay was dismissed by Escape key
    const isOverlayOpen = await page.evaluate(() => {
      const el = document.getElementById('dialog-box');
      return el?.classList.contains('open');
    });
    expect(isOverlayOpen).toBe(false);
  });

  it('JevBrowserAdapter executes goal in mock mode and fires step callbacks', async () => {
    const adapter = new JevBrowserAdapter({ mockMode: true });

    const stepsReceived: any[] = [];
    const result = await adapter.executeGoal({
      url: 'http://localhost:3000/login',
      goal: 'log in with test account and navigate to billing',
      onStep: (step) => {
        stepsReceived.push(step);
      },
    });

    expect(result.status).toBe('success');
    expect(result.finalUrl).toContain('billing');
    expect(result.totalActions).toBeGreaterThan(0);
    expect(stepsReceived.length).toBeGreaterThan(0);
    expect(stepsReceived[0]).toHaveProperty('step');
    expect(stepsReceived[0]).toHaveProperty('action');
    expect(stepsReceived[0]).toHaveProperty('operation');
  });

  it('JevBrowserAdapter communicates with MCP jev_browse tool and parses output', async () => {
    const mockMcpClient = {
      callTool: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: `### Jev Ultrafast Execution Result
- **Status**: \`success\`
- **Final URL**: http://localhost:3000/dashboard/billing
- **Elapsed Time**: 1250 ms
- **Total Actions**: 2

**Action Log**:
- Step 1: e1 (click) [latency: 120ms] -> typed: ""
- Step 2: e2 (fill) [latency: 85ms] -> typed: "admin@example.com"

**Observed Interactive Elements**:
- [button] Billing Overview
- [link] Logout

**Observed Page Text**:
Billing Dashboard Current Tier Pro
`,
          },
        ],
      }),
    };

    const adapter = new JevBrowserAdapter({ mcpClient: mockMcpClient });
    const steps: any[] = [];

    const result = await adapter.executeGoal({
      url: 'http://localhost:3000/dashboard',
      goal: 'navigate to billing settings',
      onStep: (s) => steps.push(s),
    });

    expect(mockMcpClient.callTool).toHaveBeenCalledWith('jev_browse', {
      url: 'http://localhost:3000/dashboard',
      goal: 'navigate to billing settings',
    });

    expect(result.status).toBe('success');
    expect(result.finalUrl).toBe('http://localhost:3000/dashboard/billing');
    expect(result.elapsedMs).toBe(1250);
    expect(result.totalActions).toBe(2);
    expect(result.steps.length).toBe(2);
    expect(steps.length).toBe(2);
    expect(steps[1].text).toBe('admin@example.com');
    expect(result.observedElements).toContain('[button] Billing Overview');
    expect(result.pageText).toContain('Billing Dashboard');
  });
});
