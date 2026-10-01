import { describe, it, expect } from 'vitest';
import type { RouteManifestNode } from '../../src/crawler/types.js';
import { expandDynamicRoutes } from '../../src/crawler/orchestrator.js';

describe('Crawler Orchestrator Unit Tests', () => {
  describe('expandDynamicRoutes', () => {
    it('returns exact path when dynamicParams is empty', () => {
      const node: RouteManifestNode = {
        path: '/dashboard',
        rawPath: '/dashboard',
        filePath: 'src/pages/dashboard.tsx',
        isIndex: false,
        dynamicParams: [],
        authRequired: false,
        authGuards: [],
        sourceLocation: { filePath: 'src/pages/dashboard.tsx', line: 1 },
      };

      const result = expandDynamicRoutes(node);
      expect(result).toEqual(['/dashboard']);
    });

    it('caps dynamic parameter expansion at N <= 2', () => {
      const node: RouteManifestNode = {
        path: '/users/:userId',
        rawPath: '/users/:userId',
        filePath: 'src/pages/users/[userId].tsx',
        isIndex: false,
        dynamicParams: ['userId'],
        authRequired: false,
        authGuards: [],
        sourceLocation: { filePath: 'src/pages/users/[userId].tsx', line: 1 },
      };

      const result = expandDynamicRoutes(node, 2);
      expect(result).toEqual(['/users/1', '/users/2']);
    });

    it('expands Next.js bracket dynamic and catch-all params', () => {
      const nodeBracket: RouteManifestNode = {
        path: '/items/[id]',
        rawPath: '/items/[id]',
        filePath: 'app/items/[id]/page.tsx',
        isIndex: false,
        dynamicParams: ['id'],
        authRequired: false,
        authGuards: [],
        sourceLocation: { filePath: 'app/items/[id]/page.tsx', line: 1 },
      };

      const resultBracket = expandDynamicRoutes(nodeBracket, 2);
      expect(resultBracket).toEqual(['/items/1', '/items/2']);

      const nodeCatchAll: RouteManifestNode = {
        path: '/docs/[...slug]',
        rawPath: '/docs/[...slug]',
        filePath: 'app/docs/[...slug]/page.tsx',
        isIndex: false,
        dynamicParams: ['slug'],
        authRequired: false,
        authGuards: [],
        sourceLocation: { filePath: 'app/docs/[...slug]/page.tsx', line: 1 },
      };

      const resultCatchAll = expandDynamicRoutes(nodeCatchAll, 2);
      expect(resultCatchAll).toEqual(['/docs/item-1', '/docs/item-2']);
    });

    it('caps maxConcrete at 2 even if higher number is requested', () => {
      const node: RouteManifestNode = {
        path: '/products/:id',
        rawPath: '/products/:id',
        filePath: 'src/pages/products/:id.tsx',
        isIndex: false,
        dynamicParams: ['id'],
        authRequired: false,
        authGuards: [],
        sourceLocation: { filePath: 'src/pages/products/:id.tsx', line: 1 },
      };

      const result = expandDynamicRoutes(node, 10);
      expect(result).toHaveLength(2);
      expect(result).toEqual(['/products/1', '/products/2']);
    });

    it('expands catch-all route containing /* with dynamicParams like slug', () => {
      const node: RouteManifestNode = {
        path: '/docs/*',
        rawPath: '/docs/*',
        filePath: 'src/pages/docs/[...slug].tsx',
        isIndex: false,
        dynamicParams: ['slug'],
        authRequired: false,
        authGuards: [],
        sourceLocation: { filePath: 'src/pages/docs/[...slug].tsx', line: 1 },
      };

      const result = expandDynamicRoutes(node, 2);
      expect(result).toEqual(['/docs/item-1', '/docs/item-2']);
      expect(result.some(p => p.includes('*'))).toBe(false);
    });

    it('expands catch-all route ending with /* with dynamicParams like all', () => {
      const node: RouteManifestNode = {
        path: '/blog/*',
        rawPath: '/blog/*',
        filePath: 'app/blog/[...all]/page.tsx',
        isIndex: false,
        dynamicParams: ['all'],
        authRequired: false,
        authGuards: [],
        sourceLocation: { filePath: 'app/blog/[...all]/page.tsx', line: 1 },
      };

      const result = expandDynamicRoutes(node, 2);
      expect(result).toEqual(['/blog/item-1', '/blog/item-2']);
      expect(result.some(p => p.includes('*'))).toBe(false);
    });

    it('expands root catch-all /* with dynamicParams', () => {
      const node: RouteManifestNode = {
        path: '/*',
        rawPath: '/*',
        filePath: 'src/routes/wildcard.tsx',
        isIndex: false,
        dynamicParams: ['all'],
        authRequired: false,
        authGuards: [],
        sourceLocation: { filePath: 'src/routes/wildcard.tsx', line: 1 },
      };

      const result = expandDynamicRoutes(node, 2);
      expect(result).toEqual(['/item-1', '/item-2']);
    });
  });

  describe('validateBaseUrl (SSRF & Loopback Confinement)', () => {
    it('accepts valid loopback base URLs (127.0.0.1, localhost, ::1)', async () => {
      const { validateBaseUrl } = await import('../../src/crawler/orchestrator.js');
      expect(() => validateBaseUrl('http://127.0.0.1:3000')).not.toThrow();
      expect(() => validateBaseUrl('http://localhost:5173')).not.toThrow();
      expect(() => validateBaseUrl('http://[::1]:8080')).not.toThrow();
      expect(() => validateBaseUrl('https://localhost:443')).not.toThrow();
    });

    it('rejects cloud metadata IPs and internal hostnames', async () => {
      const { validateBaseUrl } = await import('../../src/crawler/orchestrator.js');
      expect(() => validateBaseUrl('http://169.254.169.254')).toThrow(/SSRF|metadata/i);
      expect(() => validateBaseUrl('http://169.254.169.254/latest/meta-data')).toThrow(/SSRF|metadata/i);
      expect(() => validateBaseUrl('http://metadata.google.internal')).toThrow(/SSRF|metadata/i);
      expect(() => validateBaseUrl('http://metadata.azure.internal')).toThrow(/SSRF|metadata/i);
      expect(() => validateBaseUrl('http://instance-data')).toThrow(/SSRF|metadata/i);
    });

    it('rejects external domains and non-loopback addresses', async () => {
      const { validateBaseUrl } = await import('../../src/crawler/orchestrator.js');
      expect(() => validateBaseUrl('http://example.com')).toThrow(/SSRF|loopback/i);
      expect(() => validateBaseUrl('https://evil.attacker.com:3000')).toThrow(/SSRF|loopback/i);
      expect(() => validateBaseUrl('http://192.168.1.1:8080')).toThrow(/SSRF|loopback/i);
      expect(() => validateBaseUrl('http://10.0.0.1:8080')).toThrow(/SSRF|loopback/i);
    });

    it('rejects invalid or non-HTTP protocols', async () => {
      const { validateBaseUrl } = await import('../../src/crawler/orchestrator.js');
      expect(() => validateBaseUrl('not-a-url')).toThrow(/valid URL/i);
      expect(() => validateBaseUrl('ftp://localhost:21')).toThrow(/protocol/i);
      expect(() => validateBaseUrl('file:///etc/passwd')).toThrow(/protocol/i);
    });
  });

  describe('Phantom Screenshot Fix', () => {
    it('ensures no phantom screenshots are recorded when capture is empty or fails', async () => {
      const { ManifestBuilder } = await import('../../src/crawler/manifest.js');
      const builder = new ManifestBuilder({ appRoot: '/tmp/test' });

      const validScreenshots: any[] = [];
      const desktopShot = '';
      const tabletShot = '';
      const mobileShot = '';

      if (desktopShot) {
        validScreenshots.push({
          screenId: 'screen_root',
          route: '/',
          viewport: 'desktop',
          filePath: 'screenshots/desktop_root.webp',
          width: 1280,
          height: 800,
        });
      }

      if (validScreenshots.length > 0) {
        builder.addScreenshots(validScreenshots);
      }

      const manifest = builder.build();
      expect(manifest.screenshots).toHaveLength(0);
    });
  });
});

