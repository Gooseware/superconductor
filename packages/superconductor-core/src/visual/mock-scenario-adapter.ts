import * as fs from 'fs';
import * as path from 'path';

export type MockScenarioType =
  | 'synthetic'
  | 'seed'
  | 'loading'
  | 'empty'
  | 'error'
  | 'overflow'
  | 'snapshot';

export interface MockScenarioAdapterOptions {
  seedFixture?: Record<string, unknown>;
  seedFilePath?: string;
  projectRoot?: string;
  syntheticGenerator?: (baseProps: Record<string, unknown>) => Record<string, unknown>;
  overflowMultiplier?: number;
}

export class MockScenarioAdapter {
  static readonly SUPPORTED_SCENARIOS: readonly MockScenarioType[] = [
    'synthetic',
    'seed',
    'loading',
    'empty',
    'error',
    'overflow',
    'snapshot'
  ] as const;

  private static readonly LOREM_BASE =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';

  constructor(private options: MockScenarioAdapterOptions = {}) {}

  static isSupportedScenario(scenario: unknown): scenario is MockScenarioType {
    return (
      typeof scenario === 'string' &&
      MockScenarioAdapter.SUPPORTED_SCENARIOS.includes(scenario as MockScenarioType)
    );
  }

  static getSupportedScenarios(): readonly MockScenarioType[] {
    return MockScenarioAdapter.SUPPORTED_SCENARIOS;
  }

  static resolve(
    baseProps: Record<string, unknown>,
    scenario: MockScenarioType,
    options?: MockScenarioAdapterOptions
  ): Record<string, unknown> {
    return new MockScenarioAdapter(options).resolveProps(baseProps, scenario);
  }

  setSeedFixture(fixture: Record<string, unknown>): this {
    this.options.seedFixture = fixture;
    return this;
  }

  loadSeedFromFile(filePath: string, projectRoot?: string): this {
    this.options.seedFilePath = filePath;
    if (projectRoot) {
      this.options.projectRoot = projectRoot;
    }
    return this;
  }

  setProjectRoot(projectRoot: string): this {
    this.options.projectRoot = projectRoot;
    return this;
  }

  resolveProps(
    baseProps: Record<string, unknown> = {},
    scenario: MockScenarioType,
    overrideOptions?: MockScenarioAdapterOptions
  ): Record<string, unknown> {
    if (overrideOptions) {
      this.options = { ...this.options, ...overrideOptions };
    }

    switch (scenario) {
      case 'loading':
        return this.resolveLoading(baseProps);
      case 'empty':
        return this.resolveEmpty(baseProps);
      case 'error':
        return this.resolveError(baseProps);
      case 'overflow':
        return this.resolveOverflow(baseProps);
      case 'seed':
        return this.resolveSeed(baseProps);
      case 'synthetic':
        return this.resolveSynthetic(baseProps);
      case 'snapshot':
        return this.resolveSnapshot(baseProps);
      default:
        throw new Error(
          `[MockScenarioAdapter] Unsupported scenario "${scenario}". Supported scenarios: ${MockScenarioAdapter.SUPPORTED_SCENARIOS.join(', ')}`
        );
    }
  }

  private resolveLoading(baseProps: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...baseProps };

    let hasLoadingFlag = false;
    const loadingKeyPatterns = /^(is)?loading$/i;
    const pendingKeyPatterns = /^(is)?pending$/i;
    const busyKeyPatterns = /^busy$/i;
    const loadedKeyPatterns = /^(is)?loaded$/i;
    const readyKeyPatterns = /^(is)?ready$/i;

    for (const key of Object.keys(result)) {
      if (
        loadingKeyPatterns.test(key) ||
        pendingKeyPatterns.test(key) ||
        busyKeyPatterns.test(key)
      ) {
        result[key] = true;
        hasLoadingFlag = true;
      } else if (loadedKeyPatterns.test(key) || readyKeyPatterns.test(key)) {
        result[key] = false;
      }
    }

    if (!hasLoadingFlag) {
      result.isLoading = true;
    }

    // Sets loading states, skeletons, or pending promises
    result.status = 'loading';
    result.skeleton = true;
    result.hasSkeleton = true;
    result.promise = new Promise(() => {});
    result.dataPromise = new Promise(() => {});

    if (Array.isArray(result.items)) {
      result.items = [
        { id: 'skeleton-1', __skeleton: true, title: 'Loading...', loading: true },
        { id: 'skeleton-2', __skeleton: true, title: 'Loading...', loading: true },
        { id: 'skeleton-3', __skeleton: true, title: 'Loading...', loading: true }
      ];
    }

    return result;
  }

  private resolveEmpty(baseProps: Record<string, unknown>): Record<string, unknown> {
    const emptyClone = (val: unknown, keyName = ''): unknown => {
      if (Array.isArray(val)) {
        return [];
      }
      if (typeof val === 'number') {
        return 0;
      }
      if (typeof val === 'string') {
        return '';
      }
      if (typeof val === 'boolean') {
        if (/empty$/i.test(keyName)) return true;
        if (/^(has|show|is)/i.test(keyName)) return false;
        return val;
      }
      if (
        val !== null &&
        typeof val === 'object' &&
        !(val instanceof Promise) &&
        !(val instanceof Error)
      ) {
        const nestedObj = val as Record<string, unknown>;
        const emptied: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(nestedObj)) {
          emptied[k] = emptyClone(v, k);
        }
        return emptied;
      }
      return val;
    };

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(baseProps)) {
      result[key] = emptyClone(value, key);
    }

    // Default empty keys if baseProps was empty
    if (Object.keys(baseProps).length === 0) {
      result.items = [];
      result.count = 0;
      result.text = '';
    }

    if ('isEmpty' in baseProps || 'empty' in baseProps) {
      if ('isEmpty' in baseProps) result.isEmpty = true;
      if ('empty' in baseProps) result.empty = true;
    }
    if ('hasData' in baseProps) result.hasData = false;
    if ('hasItems' in baseProps) result.hasItems = false;

    return result;
  }

  private resolveError(baseProps: Record<string, unknown>): Record<string, unknown> {
    const simulatedError = new Error('Simulated scenario error: Component failed to load data');
    const rejectedPromise = Promise.reject(simulatedError);
    // Prevent unhandled promise rejection in Node / vitest
    rejectedPromise.catch(() => {});

    const result: Record<string, unknown> = {
      ...baseProps,
      isError: true,
      hasError: true,
      error: simulatedError,
      errorMessage: simulatedError.message,
      errorCode: 'ERR_SCENARIO_SIMULATED',
      status: 'error',
      dataPromise: rejectedPromise,
      promise: rejectedPromise,
      onRetry: () => {},
      retry: () => {}
    };

    if ('isLoading' in result) result.isLoading = false;
    if ('loading' in result) result.loading = false;
    if ('isLoaded' in result) result.isLoaded = false;

    return result;
  }

  private resolveOverflow(baseProps: Record<string, unknown>): Record<string, unknown> {
    const repeatCount = this.options.overflowMultiplier ?? 20;
    const extremeText = MockScenarioAdapter.LOREM_BASE.repeat(repeatCount);

    const overflowClone = (val: unknown, keyName = ''): unknown => {
      if (typeof val === 'string') {
        return extremeText;
      }
      if (Array.isArray(val)) {
        if (val.length === 0) {
          return [extremeText, extremeText];
        }
        return val.map((item, idx) => overflowClone(item, `${keyName}[${idx}]`));
      }
      if (
        val !== null &&
        typeof val === 'object' &&
        !(val instanceof Promise) &&
        !(val instanceof Error)
      ) {
        const nestedObj = val as Record<string, unknown>;
        const overflowed: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(nestedObj)) {
          overflowed[k] = overflowClone(v, k);
        }
        return overflowed;
      }
      return val;
    };

    const result: Record<string, unknown> = {};
    let hasStringProp = false;

    for (const [key, value] of Object.entries(baseProps)) {
      if (typeof value === 'string') {
        hasStringProp = true;
      }
      result[key] = overflowClone(value, key);
    }

    if (!hasStringProp) {
      result.text = extremeText;
      result.title = extremeText;
      result.description = extremeText;
    }

    result.overflowActive = true;
    return result;
  }

  private resolveSeed(baseProps: Record<string, unknown>): Record<string, unknown> {
    let seedData: Record<string, unknown> = {};

    if (this.options.seedFixture) {
      seedData = { ...this.options.seedFixture };
    } else if (this.options.seedFilePath) {
      const projectRoot = path.resolve(this.options.projectRoot || process.cwd());
      const resolvedPath = path.resolve(projectRoot, this.options.seedFilePath);
      if (!resolvedPath.startsWith(projectRoot + path.sep)) {
        throw new Error('Seed file path escapes project directory');
      }

      try {
        if (fs.existsSync(resolvedPath)) {
          const raw = fs.readFileSync(resolvedPath, 'utf-8');
          seedData = JSON.parse(raw);
        }
      } catch (err) {
        console.warn(
          `[MockScenarioAdapter] Failed to load seed fixture from ${this.options.seedFilePath}:`,
          err
        );
      }
    }

    return {
      ...baseProps,
      ...seedData,
      _seedLoaded: true
    };
  }

  private resolveSynthetic(baseProps: Record<string, unknown>): Record<string, unknown> {
    if (this.options.syntheticGenerator) {
      return this.options.syntheticGenerator(baseProps);
    }

    const synthesizeValue = (key: string, existingVal: unknown): unknown => {
      if (existingVal !== undefined && existingVal !== null) {
        return existingVal;
      }

      const lower = key.toLowerCase();
      if (lower === 'id' || lower.endsWith('id')) {
        return `synth-${key}-101`;
      }
      if (lower.includes('email')) {
        return 'preview.user@superconductor.test';
      }
      if (lower.includes('name')) {
        return 'Alex Rivera';
      }
      if (lower.includes('title')) {
        return 'Synthetic Component Preview';
      }
      if (lower.includes('description') || lower.includes('bio') || lower.includes('content')) {
        return 'Synthetic preview description demonstrating component rendering in Astryx studio.';
      }
      if (lower.includes('url') || lower.includes('href') || lower.includes('link')) {
        return 'https://superconductor.test/preview';
      }
      if (lower.includes('avatar') || lower.includes('image') || lower.includes('src')) {
        return 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80';
      }
      if (
        lower.includes('count') ||
        lower.includes('total') ||
        lower.includes('amount') ||
        lower.includes('price')
      ) {
        return 42;
      }
      if (lower.startsWith('is') || lower.startsWith('has') || lower.startsWith('show')) {
        return true;
      }
      if (lower.includes('items') || lower.includes('list') || lower.includes('data')) {
        return [
          { id: 'synth-item-1', label: 'Item 1', active: true },
          { id: 'synth-item-2', label: 'Item 2', active: false }
        ];
      }
      if (lower.includes('date') || lower.includes('time')) {
        return '2026-10-01T12:00:00.000Z';
      }
      return `Synthetic ${key}`;
    };

    const result: Record<string, unknown> = { ...baseProps };

    if (Object.keys(result).length === 0) {
      return {
        id: 'synth-preview-001',
        title: 'Synthetic Preview Component',
        description: 'Auto-synthesized visual test fixture for isolated component preview.',
        items: [
          { id: '1', title: 'Synthetic Task 1', completed: false },
          { id: '2', title: 'Synthetic Task 2', completed: true }
        ],
        active: true,
        count: 42
      };
    }

    for (const [key, val] of Object.entries(result)) {
      result[key] = synthesizeValue(key, val);
    }

    return result;
  }

  private resolveSnapshot(baseProps: Record<string, unknown>): Record<string, unknown> {
    const cloneAndNeutralize = (val: unknown): unknown => {
      if (typeof val === 'function') {
        return () => {};
      }
      if (Array.isArray(val)) {
        return Object.freeze(val.map(cloneAndNeutralize));
      }
      if (
        val !== null &&
        typeof val === 'object' &&
        !(val instanceof Promise) &&
        !(val instanceof Error)
      ) {
        const copy: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          copy[k] = cloneAndNeutralize(v);
        }
        return Object.freeze(copy);
      }
      return val;
    };

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(baseProps)) {
      result[key] = cloneAndNeutralize(value);
    }

    result.readOnly = true;
    result._isSnapshot = true;

    return Object.freeze(result);
  }
}
