import type { ViteDevServer, Plugin } from 'vite';
import {
  type ProposalPatch,
  type ViewSnapshot,
  type PreviewInstance,
  BaseSurfaceAdapter,
  validateViewSnapshot,
} from './surface-adapter.js';

export interface ViteHarnessOptions {
  port?: number;
  host?: string;
  rootDir?: string;
  open?: boolean;
  logLevel?: 'info' | 'warn' | 'error' | 'silent';
}

export interface VirtualComponentConfig {
  componentPath: string;
  mockProps?: Record<string, unknown>;
  patch?: ProposalPatch;
}

export class VitePreviewHarness {
  private server: ViteDevServer | null = null;
  private simulatedServer: any = null;
  private port: number = 0;
  private host: string = process.env.SUPERCONDUCTOR_HOST || '0.0.0.0';
  private url: string | undefined = undefined;
  private componentConfig: VirtualComponentConfig | null = null;
  private isRunning: boolean = false;

  constructor() {}

  /**
   * Sets or updates the target component to preview in-memory without disk file mutations.
   * Resolves to the virtual entry module specifier (`/@superconductor/entry`).
   */
  setVirtualComponent(
    componentPath: string,
    mockProps?: Record<string, unknown>,
    patch?: ProposalPatch
  ): string {
    this.componentConfig = {
      componentPath,
      mockProps: mockProps || {},
      patch,
    };

    // Invalidate virtual module cache and trigger HMR reload if server is active
    if (this.server) {
      try {
        const mod1 = this.server.moduleGraph.getModuleById('\0virtual:superconductor-preview');
        const mod2 = this.server.moduleGraph.getModuleById('/@superconductor/entry');
        if (mod1) this.server.moduleGraph.invalidateModule(mod1);
        if (mod2) this.server.moduleGraph.invalidateModule(mod2);
        this.server.ws?.send({
          type: 'full-reload',
          path: '*',
        });
      } catch {
        // Module graph invalidation is best-effort
      }
    }

    return '/@superconductor/entry';
  }

  /**
   * Starts the Vite preview development server programmatically.
   */
  async start(options?: ViteHarnessOptions): Promise<{ port: number; url: string }> {
    if (this.isRunning && (this.server || this.simulatedServer)) {
      return { port: this.port, url: this.url! };
    }

    const host = options?.host ?? (process.env.SUPERCONDUCTOR_HOST || '0.0.0.0');
    this.host = host;
    const requestedPort = options?.port !== undefined ? options.port : 4355;
    const rootDir = options?.rootDir || process.cwd();
    const open = options?.open ?? false;
    const logLevel = options?.logLevel ?? 'warn';

    let vite: typeof import('vite') | null = null;
    try {
      vite = await import('vite');
    } catch {
      vite = null;
    }

    if (vite && typeof vite.createServer === 'function') {
      const self = this;
      const virtualPlugin: Plugin = {
        name: 'virtual:superconductor-preview',
        enforce: 'pre',
        async resolveId(id, importer) {
          if (
            id === '/@superconductor/entry' ||
            id === 'virtual:superconductor-preview' ||
            id === '/virtual:superconductor-preview'
          ) {
            return '\0virtual:superconductor-preview';
          }
          if (
            id === 'react' ||
            id === 'react-dom' ||
            id === 'react-dom/client' ||
            id === 'react/jsx-runtime'
          ) {
            try {
              const resolved = await this.resolve(id, importer, { skipSelf: true });
              if (resolved) return resolved;
            } catch {
              // fallback
            }
            return '\0virtual:' + id;
          }
          if (self.componentConfig?.componentPath) {
            const comp = self.componentConfig.componentPath;
            if (
              id === comp ||
              id === comp.replace(/^\//, '') ||
              id.endsWith(comp) ||
              id.replace(/\\/g, '/').endsWith(comp.replace(/^\//, ''))
            ) {
              try {
                const resolved = await this.resolve(id, importer, { skipSelf: true });
                if (resolved) return resolved;
              } catch {
                // not found on disk
              }
              return '\0virtual:target-component';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0virtual:superconductor-preview') {
            return self.getVirtualModuleContent();
          }
          if (id === '\0virtual:target-component') {
            return `import React from 'react';
export default function VirtualComponent(props) {
  return React.createElement(
    'div',
    {
      'data-testid': 'virtual-component-preview',
      style: {
        padding: '24px',
        backgroundColor: '#18181b',
        color: '#f4f4f5',
        borderRadius: '8px',
        border: '1px solid #27272a',
        fontFamily: 'system-ui, sans-serif'
      }
    },
    React.createElement('h3', { style: { marginTop: 0 } }, 'Virtual Component Preview'),
    React.createElement('p', null, 'Target: ' + ${JSON.stringify(self.componentConfig?.componentPath || '')}),
    React.createElement('pre', { style: { fontSize: '12px', background: '#09090b', padding: '12px', borderRadius: '4px' } },
      JSON.stringify(props, null, 2)
    )
  );
};`;
          }
          if (id === '\0virtual:react' || id === '\0virtual:react/jsx-runtime') {
            return self.getReactShim();
          }
          if (id === '\0virtual:react-dom' || id === '\0virtual:react-dom/client') {
            return self.getReactDOMShim();
          }
          return null;
        },
        configureServer(devServer) {
          devServer.middlewares.use((req, res, next) => {
            const cleanUrl = req.url?.split('?')[0];
            if (cleanUrl === '/' || cleanUrl === '/index.html') {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.statusCode = 200;
              res.end(self.getIndexHtml());
              return;
            }
            next();
          });
        },
      };

      const server = await vite.createServer({
        root: rootDir,
        configFile: false,
        logLevel,
        server: {
          host,
          port: requestedPort,
          strictPort: false,
          open,
          hmr: true,
        },
        plugins: [virtualPlugin],
        optimizeDeps: {
          include: [],
        },
      });

      await server.listen();
      this.server = server;

      const address = server.httpServer?.address();
      const actualPort =
        typeof address === 'object' && address !== null ? address.port : requestedPort || 4355;

      this.port = actualPort;
      const clientHost = (host === '0.0.0.0' || host === '::') ? '127.0.0.1' : host;
      this.url = `http://${clientHost}:${actualPort}`;
      this.isRunning = true;

      return { port: this.port, url: this.url };
    } else {
      // Fallback simulated HTTP server when Vite is not available as peer
      const http = await import('http');
      const self = this;

      const simulatedServer = http.createServer((req, res) => {
        const cleanUrl = req.url?.split('?')[0];
        if (cleanUrl === '/' || cleanUrl === '/index.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(self.getIndexHtml());
          return;
        }
        if (
          cleanUrl === '/@superconductor/entry' ||
          cleanUrl === '/virtual:superconductor-preview'
        ) {
          res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
          res.end(self.getVirtualModuleContent());
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      await new Promise<void>((resolve, reject) => {
        simulatedServer.listen(requestedPort, host, () => resolve());
        simulatedServer.on('error', reject);
      });

      this.simulatedServer = simulatedServer;
      const address = simulatedServer.address();
      const actualPort =
        typeof address === 'object' && address !== null ? address.port : requestedPort || 4355;

      this.port = actualPort;
      const clientHost = (host === '0.0.0.0' || host === '::') ? '127.0.0.1' : host;
      this.url = `http://${clientHost}:${actualPort}`;
      this.isRunning = true;

      return { port: this.port, url: this.url };
    }
  }

  /**
   * Stops the preview development server.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.server) {
      await this.server.close();
      this.server = null;
    }

    if (this.simulatedServer) {
      await new Promise<void>((resolve) => this.simulatedServer.close(() => resolve()));
      this.simulatedServer = null;
    }

    this.isRunning = false;
    this.url = undefined;
    this.port = 0;
  }

  /**
   * Returns whether the server is currently alive and listening.
   */
  isAlive(): boolean {
    return this.isRunning;
  }

  /**
   * Returns the running server base URL (e.g., http://localhost:5173) or undefined.
   */
  getUrl(): string | undefined {
    return this.url;
  }

  /**
   * Returns the active port number or undefined.
   */
  getPort(): number | undefined {
    return this.isRunning ? this.port : undefined;
  }

  /**
   * Returns the bound host address or undefined.
   */
  getHost(): string | undefined {
    return this.isRunning ? this.host : undefined;
  }

  /**
   * Returns the full URL to the virtual entry module if alive.
   */
  getEntryUrl(): string | undefined {
    return this.url ? `${this.url}/@superconductor/entry` : undefined;
  }

  /**
   * Returns the currently configured component and patch metadata.
   */
  getCurrentComponent(): VirtualComponentConfig | null {
    return this.componentConfig;
  }

  /**
   * Generates the synthetic virtual entry module code containing the Error Boundary wrapper,
   * CSS delta injection, JSX replacement proposal, and props bindings.
   */
  getVirtualModuleContent(): string {
    const config = this.componentConfig;
    const componentImport = config?.componentPath
      ? `import TargetComponent from ${JSON.stringify(config.componentPath)};`
      : `const TargetComponent = () => React.createElement('div', { style: { padding: '24px', fontFamily: 'system-ui, sans-serif' } }, 'No component specified for preview.');`;

    const baseProps = JSON.stringify(config?.mockProps || {});
    const patchProps = JSON.stringify(config?.patch?.injectedProps || {});
    const cssDelta = config?.patch?.cssDelta ? JSON.stringify(config.patch.cssDelta) : 'null';

    const safePatchId = (config?.patch?.id || '').replace(/[\r\n]/g, ' ').replace(/\*\//g, '* /');
    const safePatchTitle = (config?.patch?.title || '').replace(/[\r\n]/g, ' ').replace(/\*\//g, '* /');

    return `// In-Memory Virtual Preview Entry Module generated by Superconductor VitePreviewHarness
import React from 'react';
import * as ReactDOM from 'react-dom/client';
${componentImport}

// Superconductor Error Boundary Wrapper
export class SuperconductorErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    if (typeof console !== 'undefined' && console.error) {
      console.error('[Superconductor ErrorBoundary caught error]:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return React.createElement(
        'div',
        {
          className: 'superconductor-error-boundary',
          style: {
            padding: '24px',
            color: '#ef4444',
            backgroundColor: '#09090b',
            border: '1px solid #7f1d1d',
            borderRadius: '8px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            margin: '16px',
            lineHeight: 1.5,
          }
        },
        React.createElement('h3', { style: { margin: '0 0 8px 0', color: '#f87171' } }, 'Superconductor Render Error'),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '13px', margin: 0 } },
          String(this.state.error?.stack || this.state.error?.message || this.state.error)
        )
      );
    }
    return this.props.children;
  }
}

// Injected props & proposal patch merging
const baseProps = ${baseProps};
const patchProps = ${patchProps};
export const props = { ...baseProps, ...patchProps };

// Injected CSS Delta
if (typeof document !== 'undefined') {
  let styleEl = document.getElementById('superconductor-patch-css');
  const cssContent = ${cssDelta};
  if (cssContent) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'superconductor-patch-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = cssContent;
  } else if (styleEl) {
    styleEl.remove();
  }
}

// Target component resolution or JSX replacement proposal
${
  config?.patch?.jsxReplacement
    ? `/* Proposal Patch: ${safePatchId} - ${safePatchTitle} */
const JsxReplacement = ${config.patch.jsxReplacement};
export const Component = JsxReplacement;`
    : `export const Component = (TargetComponent && TargetComponent.default) ? TargetComponent.default : TargetComponent;`
}

// Mount into DOM safely
if (typeof document !== 'undefined') {
  let rootElement = document.getElementById('root');
  if (!rootElement) {
    rootElement = document.createElement('div');
    rootElement.id = 'root';
    document.body.appendChild(rootElement);
  }

  const appElement = React.createElement(
    SuperconductorErrorBoundary,
    null,
    React.createElement(Component, props)
  );

  if (ReactDOM && ReactDOM.createRoot) {
    if (!window.__superconductor_root__) {
      window.__superconductor_root__ = ReactDOM.createRoot(rootElement);
    }
    window.__superconductor_root__.render(appElement);
  } else if (ReactDOM && ReactDOM.render) {
    ReactDOM.render(appElement, rootElement);
  }
}

export { SuperconductorErrorBoundary };
export default Component;
`;
  }

  /**
   * Returns standard index HTML mounting the virtual entry module.
   */
  getIndexHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Superconductor Visual Preview</title>
    <style>
      body, html { margin: 0; padding: 0; min-height: 100%; font-family: system-ui, -apple-system, sans-serif; background-color: #09090b; color: #f4f4f5; }
      #root { min-height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/@superconductor/entry"></script>
  </body>
</html>`;
  }

  private getReactShim(): string {
    return `export const createElement = (type, props, ...children) => {
  const flatChildren = children.flat ? children.flat(Infinity) : children;
  const finalProps = { ...(props || {}) };
  if (flatChildren.length > 0) {
    finalProps.children = flatChildren.length === 1 ? flatChildren[0] : flatChildren;
  }
  return { type, props: finalProps, key: props?.key, ref: props?.ref };
};
export class Component {
  constructor(props) {
    this.props = props || {};
    this.state = {};
  }
  setState(updater, callback) {
    if (typeof updater === 'function') {
      this.state = { ...this.state, ...updater(this.state, this.props) };
    } else {
      this.state = { ...this.state, ...updater };
    }
    if (callback) callback();
  }
  render() { return null; }
}
export const Fragment = ({ children }) => children;
export const useState = (initial) => [initial, () => {}];
export const useEffect = () => {};
export const useMemo = (fn) => fn();
export const useCallback = (fn) => fn;
export const useRef = (initial) => ({ current: initial });
export const createContext = (defaultValue) => ({
  Provider: ({ children }) => children,
  Consumer: ({ children }) => children(defaultValue)
});
export default { createElement, Component, Fragment, useState, useEffect, useMemo, useCallback, useRef, createContext };`;
  }

  private getReactDOMShim(): string {
    return `export const createRoot = (container) => ({
  render: (node) => {
    if (container && typeof document !== 'undefined') {
      container.setAttribute('data-rendered', 'true');
    }
  },
  unmount: () => {}
});
export const render = (node, container) => {
  if (container && typeof document !== 'undefined') {
    container.setAttribute('data-rendered', 'true');
  }
};
export default { createRoot, render };`;
  }
}

/**
 * SurfaceAdapter implementation backed by VitePreviewHarness (per ADR 0004 & AC-1).
 */
export class ViteWebSurfaceAdapter extends BaseSurfaceAdapter {
  readonly name = 'vite_web';
  private harness: VitePreviewHarness;
  private projectRoot: string = '';
  private views: Map<string, ViewSnapshot> = new Map();
  private activeMounts = 0;

  constructor(harness?: VitePreviewHarness) {
    super();
    this.harness = harness || new VitePreviewHarness();
  }

  getHarness(): VitePreviewHarness {
    return this.harness;
  }

  getActiveMounts(): number {
    return this.activeMounts;
  }

  async detect(projectRoot: string): Promise<boolean> {
    this.projectRoot = projectRoot;
    try {
      const fs = await import('fs');
      const path = await import('path');
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        return true;
      }
    } catch {
      // fallback
    }
    return false;
  }

  registerView(view: ViewSnapshot): void {
    validateViewSnapshot(view);
    this.views.set(view.id, view);
  }

  async discoverViews(_projectRoot: string): Promise<ViewSnapshot[]> {
    return Array.from(this.views.values());
  }

  async mountPreview(viewId: string, _container?: HTMLElement): Promise<PreviewInstance> {
    const view = this.views.get(viewId);
    if (!view) {
      throw new Error(`View '${viewId}' not found in ViteWebSurfaceAdapter`);
    }

    if (!this.harness.isAlive()) {
      await this.harness.start({ rootDir: this.projectRoot });
    }

    this.activeMounts++;

    const entryPath = this.harness.setVirtualComponent(view.filePath);
    const serverUrl = this.harness.getUrl() || '';
    const fullUrl = `${serverUrl}${entryPath}`;

    let destroyed = false;
    return {
      viewId,
      url: fullUrl,
      destroy: async () => {
        if (destroyed) return;
        destroyed = true;
        this.activeMounts = Math.max(0, this.activeMounts - 1);
        if (this.activeMounts === 0) {
          await this.harness.stop();
        }
      },
    };
  }
}
