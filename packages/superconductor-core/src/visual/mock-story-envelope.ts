import {
  MockScenarioAdapter,
  type MockScenarioType
} from './mock-scenario-adapter.js';

export interface EnvelopeOptions {
  componentName?: string;
  props?: Record<string, unknown>;
  initialRoute?: string;
  theme?: 'dark' | 'light' | string;
  scenario?: MockScenarioType;
  seedFixture?: Record<string, unknown>;
  seedFilePath?: string;
  projectRoot?: string;
  containerId?: string;
  dir?: 'ltr' | 'rtl';
  locale?: string;
  autoMount?: boolean;
  title?: string;
  customCss?: string;
}

export const ASTRYX_DARK_THEME_VARIABLES: Record<string, string> = {
  '--astryx-bg': 'oklch(0.14 0.01 260)',
  '--astryx-surface': 'oklch(0.19 0.015 260)',
  '--astryx-surface-secondary': 'oklch(0.24 0.015 260)',
  '--astryx-surface-hover': 'oklch(0.28 0.018 260)',
  '--astryx-text': 'oklch(0.95 0.005 260)',
  '--astryx-text-secondary': 'oklch(0.78 0.010 260)',
  '--astryx-text-muted': 'oklch(0.58 0.010 260)',
  '--astryx-border': 'oklch(0.28 0.015 260)',
  '--astryx-border-hover': 'oklch(0.38 0.020 260)',
  '--astryx-primary': 'oklch(0.68 0.20 265)',
  '--astryx-primary-hover': 'oklch(0.74 0.18 265)',
  '--astryx-primary-contrast': 'oklch(0.12 0.01 260)',
  '--astryx-success': 'oklch(0.70 0.16 145)',
  '--astryx-warning': 'oklch(0.80 0.15 75)',
  '--astryx-info': 'oklch(0.72 0.15 300)',
  '--astryx-danger': 'oklch(0.68 0.20 25)',
  '--astryx-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.25)',
  '--astryx-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.35)',
  '--astryx-radius-sm': '4px',
  '--astryx-radius-md': '8px',
  '--astryx-radius-lg': '12px',
  '--astryx-font-family':
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
};

export const ASTRYX_LIGHT_THEME_VARIABLES: Record<string, string> = {
  '--astryx-bg': 'oklch(0.985 0.002 247.8)',
  '--astryx-surface': 'oklch(1.0 0 0)',
  '--astryx-surface-secondary': 'oklch(0.96 0.005 247.8)',
  '--astryx-surface-hover': 'oklch(0.94 0.008 247.8)',
  '--astryx-text': 'oklch(0.25 0.015 247.8)',
  '--astryx-text-secondary': 'oklch(0.40 0.012 247.8)',
  '--astryx-text-muted': 'oklch(0.55 0.010 247.8)',
  '--astryx-border': 'oklch(0.90 0.005 247.8)',
  '--astryx-border-hover': 'oklch(0.78 0.010 247.8)',
  '--astryx-primary': 'oklch(0.55 0.22 265)',
  '--astryx-primary-hover': 'oklch(0.48 0.23 265)',
  '--astryx-primary-contrast': 'oklch(1.0 0 0)',
  '--astryx-success': 'oklch(0.62 0.17 145)',
  '--astryx-warning': 'oklch(0.72 0.16 75)',
  '--astryx-info': 'oklch(0.62 0.17 300)',
  '--astryx-danger': 'oklch(0.58 0.22 25)',
  '--astryx-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.04)',
  '--astryx-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.04)',
  '--astryx-radius-sm': '4px',
  '--astryx-radius-md': '8px',
  '--astryx-radius-lg': '12px',
  '--astryx-font-family':
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
};

export function serializePropsForCode(props: unknown): string {
  if (props === undefined) return 'undefined';
  if (props === null) return 'null';
  if (typeof props === 'function') return '(() => {})';
  if (props instanceof Error) return `new Error(${JSON.stringify(props.message)})`;
  if (props instanceof Promise) return 'new Promise(() => {})';
  if (props instanceof Date) return `new Date(${JSON.stringify(props.toISOString())})`;
  if (
    typeof props === 'string' ||
    typeof props === 'number' ||
    typeof props === 'boolean'
  ) {
    return JSON.stringify(props);
  }
  if (Array.isArray(props)) {
    return `[${props.map(serializePropsForCode).join(', ')}]`;
  }
  if (typeof props === 'object') {
    const entries = Object.entries(props).map(
      ([k, v]) => `${JSON.stringify(k)}: ${serializePropsForCode(v)}`
    );
    return `{ ${entries.join(', ')} }`;
  }
  return JSON.stringify(String(props));
}

export function generateEnvelopeWrapper(
  componentImportPath: string,
  options: EnvelopeOptions = {}
): string {
  const normalizedImportPath = componentImportPath.replace(/\\/g, '/');
  const componentName = options.componentName?.trim();
  const initialRoute = options.initialRoute || '/';
  const theme = options.theme || 'dark';
  const containerId = options.containerId || 'root';
  const dir =
    options.dir ||
    (options.locale === 'ar' || options.locale === 'he' ? 'rtl' : 'ltr');
  const autoMount = options.autoMount !== false;
  const scenario = options.scenario;

  const resolvedProps = scenario
    ? MockScenarioAdapter.resolve(options.props || {}, scenario, {
        seedFixture: options.seedFixture,
        seedFilePath: options.seedFilePath,
        projectRoot: options.projectRoot
      })
    : options.props || {};

  const serializedProps = serializePropsForCode(resolvedProps);

  const componentResolution =
    componentName && componentName !== 'default'
      ? `TargetModule[${JSON.stringify(componentName)}] || TargetModule.default || TargetModule;`
      : `TargetModule.default || (TargetModule && TargetModule[Object.keys(TargetModule)[0]]) || TargetModule;`;

  return `// @superconductor/core - Autonomous MockStoryEnvelope Preview Harness
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as TargetModule from ${JSON.stringify(normalizedImportPath)};

// ----------------------------------------------------
// Target Component Resolution
// ----------------------------------------------------
const ComponentToRender = ${componentResolution};

// ----------------------------------------------------
// 1. MockRouterProvider (MemoryRouter Simulation)
// ----------------------------------------------------
export const MockRouterContext = React.createContext({
  pathname: ${JSON.stringify(initialRoute)},
  search: '',
  hash: '',
  params: {},
  navigate: () => {},
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  location: { pathname: ${JSON.stringify(initialRoute)}, search: '', hash: '', state: null },
  history: { push: () => {}, replace: () => {}, back: () => {}, forward: () => {} }
});

export function MockRouterProvider({ initialRoute = ${JSON.stringify(initialRoute)}, children }) {
  const [currentPath, setCurrentPath] = React.useState(initialRoute);

  const routerValue = React.useMemo(() => {
    const location = { pathname: currentPath, search: '', hash: '', state: null };
    const navigateFn = (to) => setCurrentPath(typeof to === 'string' ? to : (to?.pathname || '/'));
    return {
      pathname: currentPath,
      search: '',
      hash: '',
      params: {},
      navigate: navigateFn,
      push: navigateFn,
      replace: navigateFn,
      back: () => {},
      forward: () => {},
      location,
      history: {
        push: navigateFn,
        replace: navigateFn,
        back: () => {},
        forward: () => {}
      }
    };
  }, [currentPath]);

  return React.createElement(MockRouterContext.Provider, { value: routerValue }, children);
}

export function useMockRouter() {
  return React.useContext(MockRouterContext);
}

// ----------------------------------------------------
// 2. MockThemeProvider (Design OS Astryx CSS Variables)
// ----------------------------------------------------
export const ASTRYX_THEME_VARIABLES = {
  dark: ${JSON.stringify(ASTRYX_DARK_THEME_VARIABLES, null, 2)},
  light: ${JSON.stringify(ASTRYX_LIGHT_THEME_VARIABLES, null, 2)}
};

export const MockThemeContext = React.createContext({
  theme: ${JSON.stringify(theme)},
  dir: ${JSON.stringify(dir)},
  tokens: ASTRYX_THEME_VARIABLES[${JSON.stringify(theme)}] || ASTRYX_THEME_VARIABLES.dark,
  setTheme: () => {}
});

export function MockThemeProvider({
  theme = ${JSON.stringify(theme)},
  dir = ${JSON.stringify(dir)},
  children
}) {
  const [activeTheme, setActiveTheme] = React.useState(theme);
  const tokens = ASTRYX_THEME_VARIABLES[activeTheme] || ASTRYX_THEME_VARIABLES.dark;

  const themeContextValue = React.useMemo(() => ({
    theme: activeTheme,
    dir,
    tokens,
    setTheme: setActiveTheme
  }), [activeTheme, dir, tokens]);

  const containerStyle = React.useMemo(() => ({
    minHeight: '100%',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--astryx-font-family, -apple-system, sans-serif)',
    color: 'var(--astryx-text)',
    backgroundColor: 'var(--astryx-bg)',
    ...tokens
  }), [tokens]);

  return React.createElement(
    MockThemeContext.Provider,
    { value: themeContextValue },
    React.createElement(
      'div',
      {
        id: 'superconductor-mock-theme-root',
        'data-astryx-theme': activeTheme,
        dir: dir,
        style: containerStyle
      },
      children
    )
  );
}

export function useMockTheme() {
  return React.useContext(MockThemeContext);
}

// ----------------------------------------------------
// 3. MockQueryProvider (React Query & SWR Stub)
// ----------------------------------------------------
const stubQueryClient = {
  defaultQueryObserverOptions: () => ({}),
  getQueryData: () => undefined,
  setQueryData: () => {},
  fetchQuery: () => Promise.resolve(null),
  prefetchQuery: () => Promise.resolve(),
  invalidateQueries: () => Promise.resolve(),
  resetQueries: () => Promise.resolve(),
  removeQueries: () => {},
  cancelQueries: () => Promise.resolve(),
  isFetching: () => 0,
  isMutating: () => 0,
  mount: () => () => {},
  subscribe: () => () => {},
  clear: () => {}
};

export const MockQueryContext = React.createContext({
  client: stubQueryClient,
  queryCache: {},
  mutate: () => Promise.resolve()
});

export function MockQueryProvider({ client = stubQueryClient, children }) {
  const value = React.useMemo(() => ({
    client,
    queryCache: {},
    mutate: () => Promise.resolve()
  }), [client]);

  return React.createElement(MockQueryContext.Provider, { value }, children);
}

export function useMockQuery() {
  return React.useContext(MockQueryContext);
}

// ----------------------------------------------------
// 4. ErrorBoundary (Intercepts Crashes with Preview Alert)
// ----------------------------------------------------
export class ErrorBoundary extends React.Component {
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
      console.error('[MockStoryEnvelope] Preview Component Render Crash Intercepted:', error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const error = this.state.error;
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack || this.state.errorInfo?.componentStack || '';

      return React.createElement(
        'div',
        {
          className: 'astryx-preview-alert-card',
          role: 'alert',
          style: {
            margin: '20px',
            padding: '24px',
            backgroundColor: 'var(--astryx-surface, #1e1e2e)',
            border: '1px solid var(--astryx-danger, #ef4444)',
            borderRadius: 'var(--astryx-radius-md, 8px)',
            color: 'var(--astryx-text, #ffffff)',
            boxShadow: 'var(--astryx-shadow-md, 0 4px 12px rgba(0,0,0,0.35))',
            fontFamily: 'var(--astryx-font-family, sans-serif)'
          }
        },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            React.createElement('span', { style: { fontSize: '20px' } }, '⚠️'),
            React.createElement(
              'h3',
              { style: { margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--astryx-danger, #ef4444)' } },
              'Component Render Crash Intercepted'
            )
          ),
          React.createElement(
            'span',
            {
              style: {
                fontSize: '11px',
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--astryx-danger, #ef4444)',
                fontWeight: 600,
                letterSpacing: '0.05em'
              }
            },
            'ErrorBoundary'
          )
        ),
        React.createElement(
          'p',
          { style: { margin: '0 0 12px 0', fontSize: '13px', color: 'var(--astryx-text-secondary, #cccccc)', lineHeight: 1.5 } },
          'A runtime crash occurred inside the component preview. The visual studio harness caught this crash gracefully.'
        ),
        React.createElement(
          'div',
          {
            style: {
              padding: '12px',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '16px'
            }
          },
          React.createElement(
            'div',
            { style: { fontWeight: 600, fontSize: '13px', color: '#ff8888', marginBottom: '6px' } },
            errorMessage
          ),
          errorStack ? React.createElement(
            'pre',
            {
              style: {
                margin: 0,
                fontSize: '11px',
                color: '#999999',
                overflowX: 'auto',
                maxHeight: '200px',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap'
              }
            },
            errorStack
          ) : null
        ),
        React.createElement(
          'button',
          {
            onClick: this.handleRetry,
            style: {
              padding: '6px 14px',
              backgroundColor: 'var(--astryx-primary, #6366f1)',
              color: 'var(--astryx-primary-contrast, #ffffff)',
              border: 'none',
              borderRadius: 'var(--astryx-radius-sm, 4px)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer'
            }
          },
          'Retry Render'
        )
      );
    }
    return this.props.children;
  }
}

// ----------------------------------------------------
// 5. Envelope Root Component
// ----------------------------------------------------
export function SuperconductorEnvelope(props) {
  const baseResolvedProps = ${serializedProps};
  const activeProps = { ...baseResolvedProps, ...(props?.overrideProps || {}) };

  return React.createElement(
    ErrorBoundary,
    null,
    React.createElement(
      MockThemeProvider,
      { theme: ${JSON.stringify(theme)}, dir: ${JSON.stringify(dir)} },
      React.createElement(
        MockRouterProvider,
        { initialRoute: ${JSON.stringify(initialRoute)} },
        React.createElement(
          MockQueryProvider,
          null,
          React.createElement(ComponentToRender, activeProps)
        )
      )
    )
  );
}

${
  autoMount
    ? `
// ----------------------------------------------------
// 6. Automatic Mount to DOM Container
// ----------------------------------------------------
if (typeof document !== 'undefined') {
  const container = document.getElementById(${JSON.stringify(containerId)});
  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(SuperconductorEnvelope));
  }
}
`
    : ''
}

export default SuperconductorEnvelope;
`;
}

export class MockStoryEnvelope {
  constructor(private defaultOptions: EnvelopeOptions = {}) {}

  generateWrapper(
    componentImportPath: string,
    options?: EnvelopeOptions
  ): string {
    return generateEnvelopeWrapper(componentImportPath, {
      ...this.defaultOptions,
      ...options
    });
  }

  static getAstryxTokens(
    theme: 'light' | 'dark' | string = 'dark'
  ): Record<string, string> {
    return theme === 'light'
      ? ASTRYX_LIGHT_THEME_VARIABLES
      : ASTRYX_DARK_THEME_VARIABLES;
  }
}
