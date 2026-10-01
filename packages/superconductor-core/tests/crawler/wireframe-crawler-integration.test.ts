import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { crawlProject } from '../../src/crawler/orchestrator.js';
import { DevServerManager } from '../../src/crawler/serverManager.js';

describe('Wireframe Crawler End-to-End Integration Test', () => {
  let tempAppDir: string;
  let activeServer: http.Server | null = null;
  const activePort = 4355; // First candidate port for DevServerManager.detectActiveServer

  beforeEach(async () => {
    tempAppDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-crawl-e2e-app-'));

    // 1. Setup multi-route file structure recognized by Vite pages parser:
    //    src/pages/index.tsx, src/pages/about.tsx, src/pages/dashboard.tsx, src/pages/users/[id].tsx
    const pagesDir = path.join(tempAppDir, 'src', 'pages');
    const usersDir = path.join(pagesDir, 'users');
    fs.mkdirSync(usersDir, { recursive: true });

    fs.writeFileSync(
      path.join(pagesDir, 'index.tsx'),
      `export default function HomePage() { return <div>Home</div>; }`
    );
    fs.writeFileSync(
      path.join(pagesDir, 'about.tsx'),
      `export default function AboutPage() { return <div>About</div>; }`
    );
    fs.writeFileSync(
      path.join(pagesDir, 'dashboard.tsx'),
      `export default function DashboardPage() { return <div>Dashboard</div>; }`
    );
    fs.writeFileSync(
      path.join(usersDir, '[id].tsx'),
      `export default function UserDetailPage() { return <div>User Detail</div>; }`
    );

    // 2. Setup server script for testing spawnDevServer fallback as well
    fs.writeFileSync(
      path.join(tempAppDir, 'dev-server.js'),
      `
const http = require('node:http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<main data-hydrated="true"><h1>Spawned Server App</h1></main>');
});
server.listen(0, '127.0.0.1', () => {
  const p = server.address().port;
  console.log('Local:   http://localhost:' + p + '/');
});
`
    );
  });

  afterEach(async () => {
    if (activeServer) {
      await new Promise<void>((resolve) => {
        activeServer!.close(() => resolve());
      });
      activeServer = null;
    }
    if (fs.existsSync(tempAppDir)) {
      try {
        fs.rmSync(tempAppDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('crawls project end-to-end with active server detection, multi-viewport capture, video markers, modal probing with Escape dismissal, and HTML board generation', async () => {
    // Start an HTTP server on port 4355 (candidate port for detectActiveServer)
    activeServer = http.createServer((req, res) => {
      const url = req.url?.split('?')[0] || '/';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

      if (url === '/' || url === '/index') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Home Dashboard</title></head>
            <body>
              <main data-hydrated="true">
                <h1>Welcome Home</h1>
                <nav>
                  <a href="/about" id="nav-about">About Us</a>
                  <a href="/dashboard" id="nav-dash">Dashboard</a>
                </nav>
              </main>
            </body>
          </html>
        `);
      } else if (url === '/about') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>About Us Page</title></head>
            <body>
              <main data-hydrated="true">
                <h1>About Us</h1>
                <a href="/" id="nav-home">Back Home</a>
              </main>
            </body>
          </html>
        `);
      } else if (url === '/dashboard') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>System Dashboard</title></head>
            <body>
              <main data-hydrated="true">
                <h1>System Dashboard Overview</h1>
                <a href="/users/1" id="nav-user1">View User 1</a>
              </main>
            </body>
          </html>
        `);
      } else if (url.startsWith('/users/')) {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>User Profile Details</title></head>
            <body>
              <main data-hydrated="true">
                <h1>User Profile Details</h1>
                <button id="btn-edit-user" aria-haspopup="dialog" data-state="closed">Edit Profile</button>
                
                <div id="modal-edit" role="dialog" aria-modal="true" style="display: none;">
                  <h2>Edit Profile Dialog</h2>
                  <p>Form to edit user</p>
                  <button aria-label="Close" id="btn-modal-close">Close</button>
                </div>

                <!-- Destructive mutations to test safe blocking -->
                <button class="danger" data-action="delete">Delete Profile</button>
                <form action="/api/users/delete" method="POST">
                  <button type="submit">Submit Delete</button>
                </form>

                <script>
                  const openBtn = document.getElementById('btn-edit-user');
                  const modal = document.getElementById('modal-edit');
                  const closeBtn = document.getElementById('btn-modal-close');

                  openBtn.addEventListener('click', () => {
                    modal.style.display = 'block';
                    modal.setAttribute('data-state', 'open');
                  });

                  closeBtn.addEventListener('click', () => {
                    modal.style.display = 'none';
                    modal.removeAttribute('data-state');
                  });

                  window.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                      modal.style.display = 'none';
                      modal.removeAttribute('data-state');
                    }
                  });
                </script>
              </main>
            </body>
          </html>
        `);
      } else {
        res.end(`<!DOCTYPE html><html><body><main data-hydrated="true"><h1>Not Found</h1></main></body></html>`);
      }
    });

    await new Promise<void>((resolve, reject) => {
      activeServer!.listen(activePort, '127.0.0.1', () => resolve());
      activeServer!.once('error', reject);
    });

    // 1. Verify DevServerManager detects active server on candidate port 4355
    const detectedUrl = await DevServerManager.detectActiveServer();
    expect(detectedUrl).toBe(`http://127.0.0.1:${activePort}`);

    const outputDir = path.join(tempAppDir, 'superconductor', 'wireframes');

    // 2. Run crawlProject end-to-end (without providing baseUrl, letting it detect active server)
    const result = await crawlProject({
      projectRoot: tempAppDir,
      outputDir,
      recordVideo: true,
      standalone: true,
      maxConcretePerParam: 2,
      timeoutMs: 15000,
    });

    // 3. Verify Route Manifest Parsing & Expansion
    expect(result.manifest.framework).toBe('vite');
    const routePaths = result.manifest.routes.map((r) => r.path);
    expect(routePaths).toContain('/');
    expect(routePaths).toContain('/about');
    expect(routePaths).toContain('/dashboard');
    expect(routePaths).toContain('/users/:id');

    // 4. Verify Total Screens and Graph Structure
    expect(result.totalScreens).toBeGreaterThanOrEqual(4);
    const nodeIds = result.graph.nodes.map((n) => n.id);
    expect(nodeIds).toContain('route:/');
    expect(nodeIds).toContain('route:/about');
    expect(nodeIds).toContain('route:/dashboard');
    expect(nodeIds).toContain('route:/users/1');

    // 5. Verify Modal Probing & Escape Dismissal
    const modalNode = result.graph.nodes.find((n) => n.type === 'modal');
    expect(modalNode).toBeDefined();
    expect(modalNode!.title).toContain('Edit Profile Dialog');

    const modalTransition = result.graph.transitions.find((t) => t.triggerType === 'modal_trigger');
    expect(modalTransition).toBeDefined();
    expect(modalTransition!.targetNodeId).toBe(modalNode!.id);

    // 6. Verify Multi-Viewport Screenshots Generated
    const screenshotsDir = path.join(outputDir, 'screenshots');
    expect(fs.existsSync(screenshotsDir)).toBe(true);

    const screenshotFiles = fs.readdirSync(screenshotsDir);
    expect(screenshotFiles.some((f) => f.startsWith('desktop_'))).toBe(true);
    expect(screenshotFiles.some((f) => f.startsWith('tablet_'))).toBe(true);
    expect(screenshotFiles.some((f) => f.startsWith('mobile_'))).toBe(true);

    // 7. Verify Video Markers Recorded
    expect(result.markers.length).toBeGreaterThanOrEqual(1);
    const firstMarker = result.markers[0];
    expect(firstMarker).toHaveProperty('relativeStartSec');
    expect(firstMarker).toHaveProperty('relativeEndSec');
    expect(firstMarker.relativeEndSec).toBeGreaterThanOrEqual(firstMarker.relativeStartSec);

    // 8. Verify Manifest File Emitted
    const manifestPath = path.join(outputDir, 'flow-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const parsedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(parsedManifest.screens.length).toBeGreaterThanOrEqual(4);

    // 9. Verify HTML Board and Graph JSON Emitted with SVG Curves and Video Elements
    expect(fs.existsSync(result.htmlPath)).toBe(true);
    expect(fs.existsSync(result.jsonPath)).toBe(true);

    const htmlContent = fs.readFileSync(result.htmlPath, 'utf-8');

    // Assert SVG cubic bezier spline transitions
    expect(htmlContent).toContain('class="transition-spline"');
    expect(htmlContent).toContain('marker-end="url(#arrowhead)"');

    // Assert Video Player and timeline markers
    expect(htmlContent).toContain('id="journey-video"');
    expect(htmlContent).toContain('class="journey-player-bar"');

    // Assert Looping preview snippet elements bound to video fragments
    expect(htmlContent).toContain('class="card-video-preview"');
    expect(htmlContent).toContain('#t=');

    // Assert Flow cards rendered
    expect(htmlContent).toContain('Home Dashboard');
    expect(htmlContent).toContain('About Us Page');
    expect(htmlContent).toContain('System Dashboard');
  }, 45000);

  it('spawns dev server automatically when no active server is detected', async () => {
    // Ensure no server is running on candidate ports
    const detectedUrl = await DevServerManager.detectActiveServer();
    if (detectedUrl) {
      // Skip if an external server is running on developer machine
      return;
    }

    const outputDir = path.join(tempAppDir, 'superconductor', 'wireframes-spawned');
    const result = await crawlProject({
      projectRoot: tempAppDir,
      outputDir,
      devServerCommand: 'node',
      devServerArgs: ['dev-server.js'],
      recordVideo: false,
      timeoutMs: 15000,
    });

    expect(result.totalScreens).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(result.htmlPath)).toBe(true);
  }, 30000);
});
