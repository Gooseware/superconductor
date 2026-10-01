import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  generateEnvelopeWrapper,
  MockStoryEnvelope,
  serializePropsForCode,
  ASTRYX_DARK_THEME_VARIABLES,
  ASTRYX_LIGHT_THEME_VARIABLES
} from '../../src/visual/mock-story-envelope.js';
import {
  MockScenarioAdapter,
  type MockScenarioType
} from '../../src/visual/mock-scenario-adapter.js';

describe('Autonomous MockStoryEnvelope & MockScenarioAdapter (ADR 0001)', () => {
  describe('MockStoryEnvelope & generateEnvelopeWrapper', () => {
    it('generates an in-memory wrapper for the given component import path', () => {
      const code = generateEnvelopeWrapper('./components/UserCard.tsx');

      expect(code).toContain("import * as TargetModule from \"./components/UserCard.tsx\";");
      expect(code).toContain('export function SuperconductorEnvelope');
      expect(code).toContain('export default SuperconductorEnvelope;');
    });

    it('resolves default export when componentName is omitted or "default"', () => {
      const codeDefault = generateEnvelopeWrapper('./Button.tsx');
      expect(codeDefault).toContain('TargetModule.default ||');

      const codeNamed = generateEnvelopeWrapper('./Button.tsx', { componentName: 'PrimaryButton' });
      expect(codeNamed).toContain('TargetModule["PrimaryButton"] || TargetModule.default');
    });

    it('injects MockRouterProvider with MemoryRouter simulation and active route "/"', () => {
      const code = generateEnvelopeWrapper('./views/Dashboard.tsx');

      expect(code).toContain('export function MockRouterProvider');
      expect(code).toContain('export const MockRouterContext = React.createContext');
      expect(code).toContain('pathname: "/"');
      expect(code).toContain('navigate:');
      expect(code).toContain('location:');
      expect(code).toContain('history:');
    });

    it('injects MockRouterProvider with a customized initialRoute', () => {
      const code = generateEnvelopeWrapper('./views/Settings.tsx', {
        initialRoute: '/settings/profile'
      });

      expect(code).toContain('pathname: "/settings/profile"');
      expect(code).toContain('initialRoute = "/settings/profile"');
    });

    it('injects MockThemeProvider with Astryx Design OS CSS variables', () => {
      const code = generateEnvelopeWrapper('./components/Card.tsx', { theme: 'dark' });

      expect(code).toContain('export function MockThemeProvider');
      expect(code).toContain('export const MockThemeContext');
      expect(code).toContain('data-astryx-theme');
      expect(code).toContain('--astryx-bg');
      expect(code).toContain('--astryx-surface');
      expect(code).toContain('--astryx-primary');
      expect(code).toContain('--astryx-border');
    });

    it('injects MockThemeProvider with light theme Astryx CSS variables when requested', () => {
      const code = generateEnvelopeWrapper('./components/Card.tsx', { theme: 'light' });

      expect(code).toContain('theme: "light"');
      expect(code).toContain(ASTRYX_LIGHT_THEME_VARIABLES['--astryx-bg']);
    });

    it('injects MockQueryProvider stubbing React Query and SWR', () => {
      const code = generateEnvelopeWrapper('./components/DataList.tsx');

      expect(code).toContain('export function MockQueryProvider');
      expect(code).toContain('export const MockQueryContext');
      expect(code).toContain('stubQueryClient');
      expect(code).toContain('getQueryData');
      expect(code).toContain('setQueryData');
      expect(code).toContain('fetchQuery');
      expect(code).toContain('invalidateQueries');
    });

    it('injects ErrorBoundary that intercepts crashes and displays an alert card with retry', () => {
      const code = generateEnvelopeWrapper('./components/CrashProne.tsx');

      expect(code).toContain('export class ErrorBoundary extends React.Component');
      expect(code).toContain('static getDerivedStateFromError(error)');
      expect(code).toContain('componentDidCatch(error, errorInfo)');
      expect(code).toContain('astryx-preview-alert-card');
      expect(code).toContain('Component Render Crash Intercepted');
      expect(code).toContain('handleRetry');
      expect(code).toContain('Retry Render');
    });

    it('handles autoMount to custom containerId or can be disabled', () => {
      const mountedCode = generateEnvelopeWrapper('./Comp.tsx', {
        containerId: 'preview-container'
      });
      expect(mountedCode).toContain('document.getElementById("preview-container")');
      expect(mountedCode).toContain('ReactDOM.createRoot');

      const unmountedCode = generateEnvelopeWrapper('./Comp.tsx', {
        autoMount: false
      });
      expect(unmountedCode).not.toContain('ReactDOM.createRoot');
      expect(unmountedCode).toContain('export default SuperconductorEnvelope;');
    });

    it('supports RTL layout mirroring direction via dir or locale option', () => {
      const rtlCode = generateEnvelopeWrapper('./Comp.tsx', { dir: 'rtl' });
      expect(rtlCode).toContain('dir: "rtl"');

      const arabicCode = generateEnvelopeWrapper('./Comp.tsx', { locale: 'ar' });
      expect(arabicCode).toContain('dir: "rtl"');
    });

    it('integrates with MockScenarioAdapter when scenario option is passed', () => {
      const code = generateEnvelopeWrapper('./Comp.tsx', {
        scenario: 'overflow',
        props: { title: 'Short' }
      });

      expect(code).toContain('Lorem ipsum');
      expect(code).toContain('overflowActive');
    });

    it('MockStoryEnvelope class can generate wrappers and provide Astryx tokens', () => {
      const envelope = new MockStoryEnvelope({ theme: 'dark', initialRoute: '/home' });
      const code = envelope.generateWrapper('./Comp.tsx');
      expect(code).toContain('pathname: "/home"');

      const darkTokens = MockStoryEnvelope.getAstryxTokens('dark');
      expect(darkTokens['--astryx-primary']).toBeDefined();

      const lightTokens = MockStoryEnvelope.getAstryxTokens('light');
      expect(lightTokens['--astryx-primary']).toBeDefined();
    });

    it('serializePropsForCode correctly serializes functions, errors, and primitives', () => {
      const serialized = serializePropsForCode({
        str: 'hello',
        num: 123,
        bool: true,
        fn: () => console.log('test'),
        err: new Error('boom'),
        items: [1, 2]
      });

      expect(serialized).toContain('"str": "hello"');
      expect(serialized).toContain('"num": 123');
      expect(serialized).toContain('"bool": true');
      expect(serialized).toContain('"fn": (() => {})');
      expect(serialized).toContain('new Error("boom")');
      expect(serialized).toContain('"items": [1, 2]');
    });
  });

  describe('MockScenarioAdapter Prop Resolution', () => {
    const adapter = new MockScenarioAdapter();

    it('validates supported scenarios', () => {
      const scenarios = MockScenarioAdapter.getSupportedScenarios();
      expect(scenarios).toContain('synthetic');
      expect(scenarios).toContain('seed');
      expect(scenarios).toContain('loading');
      expect(scenarios).toContain('empty');
      expect(scenarios).toContain('error');
      expect(scenarios).toContain('overflow');
      expect(scenarios).toContain('snapshot');

      expect(MockScenarioAdapter.isSupportedScenario('loading')).toBe(true);
      expect(MockScenarioAdapter.isSupportedScenario('invalid-scenario')).toBe(false);

      expect(() => {
        adapter.resolveProps({}, 'invalid-scenario' as MockScenarioType);
      }).toThrow(/Unsupported scenario/);
    });

    it('handles scenario === "loading" (sets loading states, skeletons, pending promises)', async () => {
      const baseProps = {
        title: 'User Profile',
        isLoading: false,
        isLoaded: true,
        items: ['Task 1', 'Task 2']
      };

      const resolved = adapter.resolveProps(baseProps, 'loading');

      expect(resolved.isLoading).toBe(true);
      expect(resolved.isLoaded).toBe(false);
      expect(resolved.status).toBe('loading');
      expect(resolved.skeleton).toBe(true);
      expect(resolved.hasSkeleton).toBe(true);
      expect(resolved.promise).toBeInstanceOf(Promise);
      expect(resolved.dataPromise).toBeInstanceOf(Promise);
      expect(Array.isArray(resolved.items)).toBe(true);
      expect(resolved.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ __skeleton: true, loading: true })
        ])
      );
    });

    it('handles scenario === "empty" (sets arrays to [], counts to 0, text to "")', () => {
      const baseProps = {
        title: 'Project List',
        count: 42,
        totalItems: 100,
        tags: ['react', 'vite'],
        hasData: true,
        metadata: {
          author: 'Alice',
          views: 999,
          comments: ['Great!']
        }
      };

      const resolved = adapter.resolveProps(baseProps, 'empty');

      expect(resolved.title).toBe('');
      expect(resolved.count).toBe(0);
      expect(resolved.totalItems).toBe(0);
      expect(resolved.tags).toEqual([]);
      expect(resolved.hasData).toBe(false);
      expect(resolved.metadata).toEqual({
        author: '',
        views: 0,
        comments: []
      });
    });

    it('handles scenario === "empty" with default fallbacks when baseProps is empty', () => {
      const resolved = adapter.resolveProps({}, 'empty');
      expect(resolved.items).toEqual([]);
      expect(resolved.count).toBe(0);
      expect(resolved.text).toBe('');
    });

    it('handles scenario === "error" (injects error states and rejection handlers)', async () => {
      const baseProps = {
        title: 'Financial Report',
        isLoading: true
      };

      const resolved = adapter.resolveProps(baseProps, 'error');

      expect(resolved.isError).toBe(true);
      expect(resolved.hasError).toBe(true);
      expect(resolved.error).toBeInstanceOf(Error);
      expect(resolved.errorMessage).toContain('Simulated scenario error');
      expect(resolved.status).toBe('error');
      expect(resolved.isLoading).toBe(false);
      expect(typeof resolved.onRetry).toBe('function');
      expect(typeof resolved.retry).toBe('function');

      // Rejected promise check
      await expect(resolved.dataPromise).rejects.toThrow('Simulated scenario error');
    });

    it('handles scenario === "overflow" (injects extreme length text repeat(20))', () => {
      const baseProps = {
        title: 'Short title',
        description: 'Short desc',
        tags: ['short-tag'],
        count: 5
      };

      const resolved = adapter.resolveProps(baseProps, 'overflow');

      expect(typeof resolved.title).toBe('string');
      expect((resolved.title as string).length).toBeGreaterThan(1500);
      expect((resolved.title as string)).toContain('Lorem ipsum');
      expect((resolved.description as string)).toContain('Lorem ipsum');
      expect(resolved.overflowActive).toBe(true);
      expect(resolved.count).toBe(5); // Non-strings preserved
    });

    it('handles scenario === "overflow" injecting text and title if baseProps has no strings', () => {
      const baseProps = { count: 10, active: true };
      const resolved = adapter.resolveProps(baseProps, 'overflow');

      expect(typeof resolved.text).toBe('string');
      expect((resolved.text as string)).toContain('Lorem ipsum');
      expect(typeof resolved.title).toBe('string');
    });

    it('handles scenario === "seed" from fixture object', () => {
      const baseProps = { name: 'Initial', role: 'guest' };
      const seedFixture = { name: 'Admin Seed', role: 'admin', privileges: ['all'] };

      const adapterWithSeed = new MockScenarioAdapter({ seedFixture });
      const resolved = adapterWithSeed.resolveProps(baseProps, 'seed');

      expect(resolved.name).toBe('Admin Seed');
      expect(resolved.role).toBe('admin');
      expect(resolved.privileges).toEqual(['all']);
      expect(resolved._seedLoaded).toBe(true);
    });

    it('handles scenario === "seed" loaded from JSON file', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-seed-test-'));
      const seedFile = path.join(tmpDir, 'fixture.json');
      fs.writeFileSync(
        seedFile,
        JSON.stringify({ fromFile: true, username: 'seed_tester' }),
        'utf-8'
      );

      try {
        const fileAdapter = new MockScenarioAdapter({ seedFilePath: seedFile, projectRoot: tmpDir });
        const resolved = fileAdapter.resolveProps({ existingProp: 1 }, 'seed');

        expect(resolved.fromFile).toBe(true);
        expect(resolved.username).toBe('seed_tester');
        expect(resolved.existingProp).toBe(1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('throws path traversal error when seed file path escapes project directory (SEC-5)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-seed-test-'));
      try {
        const fileAdapter = new MockScenarioAdapter({
          seedFilePath: '../../etc/passwd',
          projectRoot: tmpDir
        });

        expect(() => {
          fileAdapter.resolveProps({}, 'seed');
        }).toThrow('Seed file path escapes project directory');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('throws path traversal error when absolute seed file path is outside project directory (SEC-5)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-seed-test-'));
      try {
        const fileAdapter = new MockScenarioAdapter({
          seedFilePath: '/etc/shadow',
          projectRoot: tmpDir
        });

        expect(() => {
          fileAdapter.resolveProps({}, 'seed');
        }).toThrow('Seed file path escapes project directory');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles scenario === "synthetic" generating sensible defaults', () => {
      const resolved = adapter.resolveProps({}, 'synthetic');

      expect(resolved.id).toBeDefined();
      expect(resolved.title).toBeDefined();
      expect(resolved.description).toBeDefined();
      expect(Array.isArray(resolved.items)).toBe(true);
      expect(resolved.active).toBe(true);
      expect(resolved.count).toBe(42);
    });

    it('handles scenario === "synthetic" with custom generator function', () => {
      const customAdapter = new MockScenarioAdapter({
        syntheticGenerator: (base) => ({ ...base, customGenerated: true, id: 'custom-999' })
      });

      const resolved = customAdapter.resolveProps({ propA: 'test' }, 'synthetic');
      expect(resolved.propA).toBe('test');
      expect(resolved.customGenerated).toBe(true);
      expect(resolved.id).toBe('custom-999');
    });

    it('handles scenario === "snapshot" (neutralizes functions and freezes props)', () => {
      let clicked = false;
      const baseProps = {
        name: 'Frozen Component',
        onClick: () => {
          clicked = true;
        },
        items: [1, 2]
      };

      const resolved = adapter.resolveProps(baseProps, 'snapshot');

      expect(resolved.readOnly).toBe(true);
      expect(resolved._isSnapshot).toBe(true);
      expect(Object.isFrozen(resolved)).toBe(true);

      // Verify callback is neutralized
      const neutralizedFn = resolved.onClick as () => void;
      neutralizedFn();
      expect(clicked).toBe(false);
    });

    it('static MockScenarioAdapter.resolve helper behaves identically to instance', () => {
      const resolved = MockScenarioAdapter.resolve({ count: 10, name: 'Alice' }, 'empty');
      expect(resolved.count).toBe(0);
      expect(resolved.name).toBe('');
    });
  });
});
