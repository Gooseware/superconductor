import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DEFAULT_CHROMIUM_PATH,
  DEFAULT_VIEWPORTS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_CONCRETE_PER_PARAM,
  resolveCrawlerConfig,
} from '../../src/crawler/config.js';
import {
  parseRouteManifest,
  parseReactRouterManifest,
  parseRemixManifest,
  parseNextJsManifest,
  parseVitePagesManifest,
} from '../../src/crawler/parser.js';
import { inspectAuthInFile } from '../../src/crawler/authInspector.js';

describe('Crawler Config', () => {
  it('exports standard viewport presets', () => {
    expect(DEFAULT_VIEWPORTS).toHaveLength(3);
    const desktop = DEFAULT_VIEWPORTS.find(v => v.name === 'desktop');
    const tablet = DEFAULT_VIEWPORTS.find(v => v.name === 'tablet');
    const mobile = DEFAULT_VIEWPORTS.find(v => v.name === 'mobile');

    expect(desktop).toEqual({
      name: 'desktop',
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    });

    expect(tablet).toEqual({
      name: 'tablet',
      width: 768,
      height: 1024,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    expect(mobile).toEqual({
      name: 'mobile',
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
  });

  it('exports default chromium path and thresholds', () => {
    expect(DEFAULT_CHROMIUM_PATH).toBe('/home/gooseware/.local/bin/chromium');
    expect(DEFAULT_TIMEOUT_MS).toBe(30000);
    expect(DEFAULT_MAX_CONCRETE_PER_PARAM).toBe(2);
  });

  it('resolves crawler config with defaults', () => {
    const config = resolveCrawlerConfig({ projectRoot: '/test/app' });
    expect(config.projectRoot).toBe('/test/app');
    expect(config.viewports).toEqual(DEFAULT_VIEWPORTS);
    expect(config.timeoutMs).toBe(30000);
    expect(config.maxConcretePerParam).toBe(2);
    expect(config.outputDir).toBe('/test/app/.superconductor/crawler');
    expect(config.chromiumPath).toBe('/home/gooseware/.local/bin/chromium');
  });

  it('allows overriding crawler config fields', () => {
    const custom = resolveCrawlerConfig({
      projectRoot: '/test/app',
      timeoutMs: 15000,
      maxConcretePerParam: 5,
      outputDir: '/custom/out',
      chromiumPath: '/usr/bin/google-chrome',
    });
    expect(custom.timeoutMs).toBe(15000);
    expect(custom.maxConcretePerParam).toBe(5);
    expect(custom.outputDir).toBe('/custom/out');
    expect(custom.chromiumPath).toBe('/usr/bin/google-chrome');
  });
});

describe('Auth Inspection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-auth-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects loader auth guards (requireUser, requireAuth, getSession)', () => {
    const testFile = path.join(tmpDir, 'account.tsx');
    fs.writeFileSync(
      testFile,
      `
      import { json } from "@remix-run/node";
      import { requireUser } from "~/services/auth.server";

      export async function loader({ request }) {
        const user = await requireUser(request);
        return json({ user });
      }

      export default function Account() {
        return <div>Account</div>;
      }
    `
    );

    const result = inspectAuthInFile(testFile);
    expect(result.authRequired).toBe(true);
    expect(result.authGuards).toContain('requireUser');
  });

  it('detects JSX auth guards (<ProtectedRoute>, <AuthGuard>)', () => {
    const testFile = path.join(tmpDir, 'dashboard.tsx');
    fs.writeFileSync(
      testFile,
      `
      import React from "react";
      import { ProtectedRoute } from "~/components/ProtectedRoute";

      export default function Dashboard() {
        return (
          <ProtectedRoute>
            <h1>Dashboard</h1>
          </ProtectedRoute>
        );
      }
    `
    );

    const result = inspectAuthInFile(testFile);
    expect(result.authRequired).toBe(true);
    expect(result.authGuards).toContain('ProtectedRoute');
  });

  it('detects auth hooks (useAuth, useSession)', () => {
    const testFile = path.join(tmpDir, 'profile.tsx');
    fs.writeFileSync(
      testFile,
      `
      import { useAuth } from "~/hooks/useAuth";

      export default function Profile() {
        const { user } = useAuth();
        return <div>Hello {user.name}</div>;
      }
    `
    );

    const result = inspectAuthInFile(testFile);
    expect(result.authRequired).toBe(true);
    expect(result.authGuards).toContain('useAuth');
  });

  it('returns authRequired false when no guards are present', () => {
    const testFile = path.join(tmpDir, 'public.tsx');
    fs.writeFileSync(
      testFile,
      `
      export default function PublicPage() {
        return <div>Welcome to public page</div>;
      }
    `
    );

    const result = inspectAuthInFile(testFile);
    expect(result.authRequired).toBe(false);
    expect(result.authGuards).toEqual([]);
  });
});

describe('React Router v7 Manifest Parser', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-rr7-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('parses declarative DSL with index, route, layout, and prefix', async () => {
    const routesContent = `
      import { type RouteConfig, index, route, layout, prefix } from "@react-router/dev/routes";

      export default [
        index("routes/home.tsx"),
        route("about", "routes/about.tsx"),
        layout("routes/layout.tsx", [
          route("dashboard", "routes/dashboard.tsx"),
          route("settings", "routes/settings.tsx"),
        ]),
        ...prefix("concerts", [
          index("routes/concerts/home.tsx"),
          route(":city", "routes/concerts/city.tsx"),
          route("trending", "routes/concerts/trending.tsx"),
        ]),
      ] satisfies RouteConfig;
    `;

    const appDir = path.join(tmpDir, 'app');
    const routesDir = path.join(appDir, 'routes');
    fs.mkdirSync(routesDir, { recursive: true });
    const routesFile = path.join(appDir, 'routes.ts');
    fs.writeFileSync(routesFile, routesContent);

    // Create route files
    fs.writeFileSync(path.join(routesDir, 'home.tsx'), 'export default () => <div>Home</div>;');
    fs.writeFileSync(path.join(routesDir, 'about.tsx'), 'export default () => <div>About</div>;');
    fs.writeFileSync(path.join(routesDir, 'layout.tsx'), 'export default () => <div>Layout</div>;');
    fs.writeFileSync(
      path.join(routesDir, 'dashboard.tsx'),
      `import { useAuth } from "~/auth"; export default () => { useAuth(); return <div>Dash</div>; };`
    );
    fs.writeFileSync(path.join(routesDir, 'settings.tsx'), 'export default () => <div>Settings</div>;');

    const concertsDir = path.join(routesDir, 'concerts');
    fs.mkdirSync(concertsDir, { recursive: true });
    fs.writeFileSync(path.join(concertsDir, 'home.tsx'), 'export default () => <div>Concerts</div>;');
    fs.writeFileSync(path.join(concertsDir, 'city.tsx'), 'export default () => <div>City</div>;');
    fs.writeFileSync(path.join(concertsDir, 'trending.tsx'), 'export default () => <div>Trending</div>;');

    const manifest = await parseReactRouterManifest({
      projectRoot: tmpDir,
      routesFile,
    });

    expect(manifest.length).toBe(7);

    const home = manifest.find(r => r.path === '/');
    expect(home).toBeDefined();
    expect(home!.isIndex).toBe(true);
    expect(home!.filePath).toBe('app/routes/home.tsx');
    expect(home!.authRequired).toBe(false);

    const about = manifest.find(r => r.path === '/about');
    expect(about).toBeDefined();
    expect(about!.isIndex).toBe(false);
    expect(about!.filePath).toBe('app/routes/about.tsx');

    const dashboard = manifest.find(r => r.path === '/dashboard');
    expect(dashboard).toBeDefined();
    expect(dashboard!.layoutFilePath).toBe('app/routes/layout.tsx');
    expect(dashboard!.authRequired).toBe(true);
    expect(dashboard!.authGuards).toContain('useAuth');

    const concertsIndex = manifest.find(r => r.path === '/concerts');
    expect(concertsIndex).toBeDefined();
    expect(concertsIndex!.isIndex).toBe(true);

    const concertCity = manifest.find(r => r.path === '/concerts/:city');
    expect(concertCity).toBeDefined();
    expect(concertCity!.dynamicParams).toEqual(['city']);
  });
});

describe('Remix Flat Routes Manifest Parser', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-remix-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('parses Remix v2 flat route naming conventions', async () => {
    const routesDir = path.join(tmpDir, 'app', 'routes');
    fs.mkdirSync(routesDir, { recursive: true });

    fs.writeFileSync(path.join(routesDir, '_index.tsx'), 'export default () => <div>Index</div>;');
    fs.writeFileSync(path.join(routesDir, 'about.tsx'), 'export default () => <div>About</div>;');
    fs.writeFileSync(
      path.join(routesDir, 'users.$userId.tsx'),
      'export default () => <div>User</div>;'
    );
    fs.writeFileSync(
      path.join(routesDir, 'users.$userId_.edit.tsx'),
      'export default () => <div>User Edit</div>;'
    );
    fs.writeFileSync(
      path.join(routesDir, 'files.$.tsx'),
      'export default () => <div>Files Splat</div>;'
    );
    fs.writeFileSync(
      path.join(routesDir, '_auth.login.tsx'),
      'export default () => <div>Login</div>;'
    );

    const manifest = await parseRemixManifest({ projectRoot: tmpDir });

    expect(manifest.length).toBe(6);

    const indexRoute = manifest.find(r => r.path === '/');
    expect(indexRoute).toBeDefined();
    expect(indexRoute!.isIndex).toBe(true);

    const aboutRoute = manifest.find(r => r.path === '/about');
    expect(aboutRoute).toBeDefined();

    const userRoute = manifest.find(r => r.path === '/users/:userId');
    expect(userRoute).toBeDefined();
    expect(userRoute!.dynamicParams).toEqual(['userId']);

    const userEditRoute = manifest.find(r => r.path === '/users/:userId/edit');
    expect(userEditRoute).toBeDefined();
    expect(userEditRoute!.dynamicParams).toEqual(['userId']);

    const filesRoute = manifest.find(r => r.path === '/files/*');
    expect(filesRoute).toBeDefined();
    expect(filesRoute!.dynamicParams).toEqual(['*']);

    const loginRoute = manifest.find(r => r.path === '/login');
    expect(loginRoute).toBeDefined();
  });
});

describe('Next.js App Router Manifest Parser', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-nextjs-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('parses Next.js App Router directory tree with route groups, dynamic params, and layout inheritance', async () => {
    const appDir = path.join(tmpDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    // Root page
    fs.writeFileSync(path.join(appDir, 'page.tsx'), 'export default () => <div>Root</div>;');
    fs.writeFileSync(path.join(appDir, 'layout.tsx'), 'export default () => <div>Root Layout</div>;');

    // About
    const aboutDir = path.join(appDir, 'about');
    fs.mkdirSync(aboutDir);
    fs.writeFileSync(path.join(aboutDir, 'page.tsx'), 'export default () => <div>About</div>;');

    // Route Group (marketing)/pricing
    const pricingDir = path.join(appDir, '(marketing)', 'pricing');
    fs.mkdirSync(pricingDir, { recursive: true });
    fs.writeFileSync(path.join(pricingDir, 'page.tsx'), 'export default () => <div>Pricing</div>;');

    // Nested Layout in dashboard
    const dashDir = path.join(appDir, 'dashboard');
    fs.mkdirSync(dashDir);
    fs.writeFileSync(path.join(dashDir, 'layout.tsx'), 'export default () => <div>Dashboard Layout</div>;');
    const analyticsDir = path.join(dashDir, 'analytics');
    fs.mkdirSync(analyticsDir);
    fs.writeFileSync(path.join(analyticsDir, 'page.tsx'), 'export default () => <div>Analytics</div>;');

    // Dynamic Route [id]
    const blogDir = path.join(appDir, 'blog', '[id]');
    fs.mkdirSync(blogDir, { recursive: true });
    fs.writeFileSync(path.join(blogDir, 'page.tsx'), 'export default () => <div>Blog Post</div>;');

    // Catch-all [...slug]
    const docsDir = path.join(appDir, 'docs', '[...slug]');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'page.tsx'), 'export default () => <div>Docs</div>;');

    const manifest = await parseNextJsManifest({ projectRoot: tmpDir });

    expect(manifest.length).toBe(6);

    const rootRoute = manifest.find(r => r.path === '/');
    expect(rootRoute).toBeDefined();
    expect(rootRoute!.isIndex).toBe(true);

    const aboutRoute = manifest.find(r => r.path === '/about');
    expect(aboutRoute).toBeDefined();

    const pricingRoute = manifest.find(r => r.path === '/pricing');
    expect(pricingRoute).toBeDefined();

    const analyticsRoute = manifest.find(r => r.path === '/dashboard/analytics');
    expect(analyticsRoute).toBeDefined();
    expect(analyticsRoute!.layoutFilePath).toBe('app/dashboard/layout.tsx');

    const blogRoute = manifest.find(r => r.path === '/blog/:id');
    expect(blogRoute).toBeDefined();
    expect(blogRoute!.dynamicParams).toEqual(['id']);

    const docsRoute = manifest.find(r => r.path === '/docs/*');
    expect(docsRoute).toBeDefined();
    expect(docsRoute!.dynamicParams).toEqual(['slug']);
  });
});

describe('Vite File-Based Routes Parser', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-vite-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('parses Vite file-based routes in src/pages', async () => {
    const pagesDir = path.join(tmpDir, 'src', 'pages');
    fs.mkdirSync(pagesDir, { recursive: true });

    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export default () => <div>Index</div>;');
    fs.writeFileSync(path.join(pagesDir, 'about.tsx'), 'export default () => <div>About</div>;');

    const usersDir = path.join(pagesDir, 'users');
    fs.mkdirSync(usersDir);
    fs.writeFileSync(path.join(usersDir, '[id].tsx'), 'export default () => <div>User</div>;');

    const blogDir = path.join(pagesDir, 'blog');
    fs.mkdirSync(blogDir);
    fs.writeFileSync(path.join(blogDir, 'index.tsx'), 'export default () => <div>Blog Home</div>;');
    fs.writeFileSync(path.join(blogDir, '[slug].tsx'), 'export default () => <div>Blog Article</div>;');

    const manifest = await parseVitePagesManifest({ projectRoot: tmpDir });

    expect(manifest.length).toBe(5);

    const rootRoute = manifest.find(r => r.path === '/');
    expect(rootRoute).toBeDefined();
    expect(rootRoute!.isIndex).toBe(true);

    const aboutRoute = manifest.find(r => r.path === '/about');
    expect(aboutRoute).toBeDefined();

    const userRoute = manifest.find(r => r.path === '/users/:id');
    expect(userRoute).toBeDefined();
    expect(userRoute!.dynamicParams).toEqual(['id']);

    const blogHomeRoute = manifest.find(r => r.path === '/blog');
    expect(blogHomeRoute).toBeDefined();
    expect(blogHomeRoute!.isIndex).toBe(true);

    const blogArticleRoute = manifest.find(r => r.path === '/blog/:slug');
    expect(blogArticleRoute).toBeDefined();
    expect(blogArticleRoute!.dynamicParams).toEqual(['slug']);
  });
});

describe('Unified parseRouteManifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-unified-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('auto-detects Next.js and returns canonical RouteManifest', async () => {
    const appDir = path.join(tmpDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'page.tsx'), 'export default () => <div>Next Home</div>;');

    const result = await parseRouteManifest({ projectRoot: tmpDir });
    expect(result.framework).toBe('nextjs');
    expect(result.routes.length).toBe(1);
    expect(result.routes[0].path).toBe('/');
  });

  it('auto-detects React Router v7 routes file', async () => {
    const appDir = path.join(tmpDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'routes.ts'),
      `import { index } from "@react-router/dev/routes"; export default [index("routes/home.tsx")];`
    );
    fs.mkdirSync(path.join(appDir, 'routes'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'routes', 'home.tsx'), 'export default () => <div />;');

    const result = await parseRouteManifest({ projectRoot: tmpDir });
    expect(result.framework).toBe('react-router');
    expect(result.routes.length).toBe(1);
    expect(result.routes[0].path).toBe('/');
  });
});
