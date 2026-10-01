import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VitePreviewHarness, ViteWebSurfaceAdapter } from '../../src/visual/vite-harness.js';
import type { ProposalPatch, ViewSnapshot } from '../../src/visual/surface-adapter.js';

describe('VitePreviewHarness', () => {
  let harness: VitePreviewHarness;

  beforeEach(() => {
    harness = new VitePreviewHarness();
  });

  afterEach(async () => {
    if (harness.isAlive()) {
      await harness.stop();
    }
  });

  describe('Server Lifecycle', () => {
    it('should have initial offline state', () => {
      expect(harness.isAlive()).toBe(false);
      expect(harness.getUrl()).toBeUndefined();
      expect(harness.getPort()).toBeUndefined();
      expect(harness.getEntryUrl()).toBeUndefined();
      expect(harness.getCurrentComponent()).toBeNull();
    });

    it('should start the dev server and report port & url', async () => {
      const { port, url } = await harness.start({ port: 0, logLevel: 'silent' });

      expect(port).toBeGreaterThan(0);
      expect(url).toBe(`http://127.0.0.1:${port}`);
      expect(harness.isAlive()).toBe(true);
      expect(harness.getUrl()).toBe(url);
      expect(harness.getPort()).toBe(port);
      expect(harness.getHost()).toBe('0.0.0.0');
      expect(harness.getEntryUrl()).toBe(`${url}/@superconductor/entry`);
    });

    it('should support custom host configuration', async () => {
      const { port, url } = await harness.start({ port: 0, host: '127.0.0.1', logLevel: 'silent' });

      expect(port).toBeGreaterThan(0);
      expect(url).toBe(`http://127.0.0.1:${port}`);
      expect(harness.getHost()).toBe('127.0.0.1');
    });

    it('should default to port 4355 and host 0.0.0.0 when options are omitted', async () => {
      const defaultHarness = new VitePreviewHarness();
      try {
        const { port, url } = await defaultHarness.start({ logLevel: 'silent' });
        expect(port).toBe(4355);
        expect(url).toBe('http://127.0.0.1:4355');
        expect(defaultHarness.getHost()).toBe('0.0.0.0');
      } finally {
        await defaultHarness.stop();
      }
    });

    it('should return existing running instance when start is called repeatedly', async () => {
      const first = await harness.start({ port: 0, logLevel: 'silent' });
      const second = await harness.start({ port: 0, logLevel: 'silent' });

      expect(first.port).toBe(second.port);
      expect(first.url).toBe(second.url);
      expect(harness.isAlive()).toBe(true);
    });

    it('should gracefully stop the server and reset state', async () => {
      await harness.start({ port: 0, logLevel: 'silent' });
      expect(harness.isAlive()).toBe(true);

      await harness.stop();

      expect(harness.isAlive()).toBe(false);
      expect(harness.getUrl()).toBeUndefined();
      expect(harness.getPort()).toBeUndefined();
      expect(harness.getEntryUrl()).toBeUndefined();
    });

    it('should not throw if stop is called on an already stopped harness', async () => {
      await expect(harness.stop()).resolves.toBeUndefined();
    });
  });

  describe('Virtual Component Configuration', () => {
    it('should configure virtual component and return entry specifier', () => {
      const entry = harness.setVirtualComponent('/src/components/Card.tsx', { title: 'Test Card' });

      expect(entry).toBe('/@superconductor/entry');
      const current = harness.getCurrentComponent();
      expect(current).not.toBeNull();
      expect(current?.componentPath).toBe('/src/components/Card.tsx');
      expect(current?.mockProps).toEqual({ title: 'Test Card' });
      expect(current?.patch).toBeUndefined();
    });

    it('should update props and proposal patch', () => {
      const patch: ProposalPatch = {
        id: 'patch-card-border',
        title: 'Add subtle border ring',
        targetFilePath: '/src/components/Card.tsx',
        cssDelta: '.card { border: 1px solid rgba(255,255,255,0.1); }',
        injectedProps: { variant: 'elevated' },
      };

      harness.setVirtualComponent(
        '/src/components/Card.tsx',
        { title: 'Base Card', count: 1 },
        patch
      );

      const current = harness.getCurrentComponent();
      expect(current?.componentPath).toBe('/src/components/Card.tsx');
      expect(current?.mockProps).toEqual({ title: 'Base Card', count: 1 });
      expect(current?.patch).toEqual(patch);
    });
  });

  describe('Virtual Module Generation', () => {
    it('should generate virtual entry code with Error Boundary and default component', () => {
      harness.setVirtualComponent('/src/components/Badge.tsx', { label: 'Active', color: 'green' });
      const code = harness.getVirtualModuleContent();

      expect(code).toContain('import TargetComponent from "/src/components/Badge.tsx";');
      expect(code).toContain('export class SuperconductorErrorBoundary');
      expect(code).toContain('getDerivedStateFromError');
      expect(code).toContain('componentDidCatch');
      expect(code).toContain('Superconductor Render Error');
      expect(code).toContain('baseProps = {"label":"Active","color":"green"}');
      expect(code).toContain('export { SuperconductorErrorBoundary');
      expect(code).toContain('export default Component;');
    });

    it('should inject CSS delta into style tag when patch has cssDelta', () => {
      const patch: ProposalPatch = {
        id: 'p-css-1',
        title: 'Apply brand colors',
        targetFilePath: '/src/Badge.tsx',
        cssDelta: '.badge { background: #6366f1; color: #ffffff; }',
      };

      harness.setVirtualComponent('/src/Badge.tsx', {}, patch);
      const code = harness.getVirtualModuleContent();

      expect(code).toContain('superconductor-patch-css');
      expect(code).toContain('.badge { background: #6366f1; color: #ffffff; }');
    });

    it('should handle JSX replacement proposal when specified in patch', () => {
      const patch: ProposalPatch = {
        id: 'p-jsx-1',
        title: 'Replace badge with pill icon',
        targetFilePath: '/src/Badge.tsx',
        jsxReplacement: '() => React.createElement("span", { className: "pill" }, "Patched")',
      };

      harness.setVirtualComponent('/src/Badge.tsx', {}, patch);
      const code = harness.getVirtualModuleContent();

      expect(code).toContain('Proposal Patch: p-jsx-1 - Replace badge with pill icon');
      expect(code).toContain('const JsxReplacement = () => React.createElement("span", { className: "pill" }, "Patched");');
      expect(code).toContain('export const Component = JsxReplacement;');
    });

    it('should sanitize newlines and comment escapes in proposal patch metadata (SEC-3)', () => {
      const patch: ProposalPatch = {
        id: 'patch-1\nconsole.log("hacked-id");\n//',
        title: 'title */\nconsole.log("hacked-title");\n/*',
        targetFilePath: '/src/Badge.tsx',
        jsxReplacement: '() => React.createElement("div", null, "Safe")',
      };

      harness.setVirtualComponent('/src/Badge.tsx', {}, patch);
      const code = harness.getVirtualModuleContent();

      // Ensure newlines are stripped and */ is escaped
      expect(code).toContain('/* Proposal Patch: patch-1 console.log("hacked-id"); // - title * / console.log("hacked-title"); /* */');
      expect(code).not.toContain('\nconsole.log("hacked-id");');
      expect(code).not.toContain('\nconsole.log("hacked-title");');
      expect(code).not.toContain('title */');
    });

    it('should merge mockProps and patch injectedProps', () => {
      const patch: ProposalPatch = {
        id: 'p-props-1',
        title: 'Override disabled state',
        targetFilePath: '/src/Button.tsx',
        injectedProps: { disabled: true, 'aria-label': 'Submitting form...' },
      };

      harness.setVirtualComponent('/src/Button.tsx', { variant: 'solid', disabled: false }, patch);
      const code = harness.getVirtualModuleContent();

      expect(code).toContain('baseProps = {"variant":"solid","disabled":false}');
      expect(code).toContain('patchProps = {"disabled":true,"aria-label":"Submitting form..."}');
      expect(code).toContain('export const props = { ...baseProps, ...patchProps };');
    });

    it('should generate fallback placeholder when no componentPath is set', () => {
      const code = harness.getVirtualModuleContent();

      expect(code).toContain('No component specified for preview.');
      expect(code).toContain('export class SuperconductorErrorBoundary');
    });
  });

  describe('In-Memory HTTP Delivery', () => {
    it('should serve HTML index page with entry module script', async () => {
      const { url } = await harness.start({ port: 0, logLevel: 'silent' });
      const res = await fetch(url);

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<div id="root"></div>');
      expect(html).toContain('<script type="module" src="/@superconductor/entry"></script>');
    });

    it('should serve synthetic virtual module via /@superconductor/entry without disk writes', async () => {
      harness.setVirtualComponent('/test/MockView.tsx', { count: 99 });
      const { url } = await harness.start({ port: 0, logLevel: 'silent' });

      const res = await fetch(`${url}/@superconductor/entry`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('javascript');

      const body = await res.text();
      expect(body).toContain('SuperconductorErrorBoundary');
      expect(body).toContain('count');
      expect(body).toContain('99');
    });
  });

  describe('ViteWebSurfaceAdapter Lifecycle (ADV-2)', () => {
    let adapter: ViteWebSurfaceAdapter;
    const dummyView: ViewSnapshot = {
      id: 'view-test',
      title: 'Test View',
      sourceType: 'web_component',
      filePath: '/src/views/TestView.tsx',
    };

    beforeEach(() => {
      adapter = new ViteWebSurfaceAdapter();
      adapter.registerView(dummyView);
    });

    afterEach(async () => {
      if (adapter.getHarness().isAlive()) {
        await adapter.getHarness().stop();
      }
    });

    it('should start harness and track active mounts when preview is mounted', async () => {
      expect(adapter.getActiveMounts()).toBe(0);
      expect(adapter.getHarness().isAlive()).toBe(false);

      const preview = await adapter.mountPreview('view-test');
      expect(adapter.getActiveMounts()).toBe(1);
      expect(adapter.getHarness().isAlive()).toBe(true);
      expect(preview.viewId).toBe('view-test');
      expect(preview.url).toContain('/@superconductor/entry');

      await preview.destroy();
      expect(adapter.getActiveMounts()).toBe(0);
      expect(adapter.getHarness().isAlive()).toBe(false);
    });

    it('should only stop harness when all active preview instances are destroyed', async () => {
      const preview1 = await adapter.mountPreview('view-test');
      const preview2 = await adapter.mountPreview('view-test');

      expect(adapter.getActiveMounts()).toBe(2);
      expect(adapter.getHarness().isAlive()).toBe(true);

      // Destroy first instance - harness should remain running
      await preview1.destroy();
      expect(adapter.getActiveMounts()).toBe(1);
      expect(adapter.getHarness().isAlive()).toBe(true);

      // Destroy second instance - harness should now stop
      await preview2.destroy();
      expect(adapter.getActiveMounts()).toBe(0);
      expect(adapter.getHarness().isAlive()).toBe(false);
    });

    it('should be idempotent if destroy is called multiple times on the same instance', async () => {
      const preview1 = await adapter.mountPreview('view-test');
      const preview2 = await adapter.mountPreview('view-test');

      expect(adapter.getActiveMounts()).toBe(2);

      await preview1.destroy();
      await preview1.destroy(); // duplicate call
      expect(adapter.getActiveMounts()).toBe(1);
      expect(adapter.getHarness().isAlive()).toBe(true);

      await preview2.destroy();
      expect(adapter.getActiveMounts()).toBe(0);
      expect(adapter.getHarness().isAlive()).toBe(false);
    });
  });
});
