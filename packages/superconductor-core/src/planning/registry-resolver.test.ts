import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ComponentRegistryResolver,
  ComponentCandidate,
} from './registry-resolver.js';

describe('ComponentRegistryResolver', () => {
  let tempDir: string;
  let mockToonPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-resolver-test-'));
    mockToonPath = path.join(tempDir, '06_api_surface.toon');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Instantiation & Configuration', () => {
    it('initializes with default options', () => {
      const resolver = new ComponentRegistryResolver();
      expect(resolver).toBeInstanceOf(ComponentRegistryResolver);
    });

    it('accepts custom configuration options', () => {
      const resolver = new ComponentRegistryResolver({
        projectRoot: '/custom/root',
        minScoreThreshold: 10,
        defaultToonPath: '/custom/toon',
      });
      expect(resolver).toBeInstanceOf(ComponentRegistryResolver);
    });
  });

  describe('resolveCandidateComponents - Registry Items', () => {
    const mockRegistryItems = [
      {
        id: 'registry:button-primary',
        name: 'Button (Primary)',
        family: 'button',
        variant: 'primary',
        intent_tags: ['action', 'submit', 'form'],
        description: 'Primary action button for form submissions',
        source_id: 'registry',
        type: 'component',
        complexity: 'atom',
        vetted: 1,
      },
      {
        id: 'registry:button-ghost',
        name: 'Button (Ghost)',
        family: 'button',
        variant: 'ghost',
        intent_tags: ['secondary', 'subtle'],
        description: 'Subtle ghost button for secondary actions',
        source_id: 'registry',
        type: 'component',
        complexity: 'atom',
        vetted: 0,
      },
      {
        id: 'registry:card-metric',
        name: 'Metric Card',
        family: 'card',
        variant: 'metric',
        intent_tags: JSON.stringify(['dashboard', 'analytics', 'stats']),
        description: 'Dashboard metric card displaying KPIs',
        source_id: 'registry',
        type: 'component',
        complexity: 'molecule',
        vetted: 1,
      },
      {
        id: 'registry:block-auth-login',
        name: 'AuthLoginBlock',
        family: 'block',
        variant: 'auth-login',
        tags: ['auth', 'login', 'oauth', 'form'],
        description: 'Authentication login block with social providers',
        type: 'block',
        complexity: 'organism',
        vetted: 1,
      },
      {
        id: 'registry:table-data',
        name: 'Data Table',
        family: 'table',
        variant: 'data',
        intent_tags: ['grid', 'rows', 'tabular'],
        description: 'Data grid with sorting and pagination',
        type: 'component',
        complexity: 'organism',
        vetted: 0,
      },
    ];

    it('returns empty array when description is empty or only whitespace', async () => {
      const resolver = new ComponentRegistryResolver();
      const results1 = await resolver.resolveCandidateComponents('', {
        registryItems: mockRegistryItems,
        includeLocalSymbols: false,
      });
      expect(results1).toEqual([]);

      const results2 = await resolver.resolveCandidateComponents('   \n\t  ', {
        registryItems: mockRegistryItems,
        includeLocalSymbols: false,
      });
      expect(results2).toEqual([]);
    });

    it('resolves and scores component candidates matching family and intent tags', async () => {
      const resolver = new ComponentRegistryResolver();
      const results = await resolver.resolveCandidateComponents('need a primary button for form submission', {
        registryItems: mockRegistryItems,
        includeLocalSymbols: false,
      });

      expect(results.length).toBeGreaterThan(0);
      const top = results[0];
      expect(top.id).toBe('registry:button-primary');
      expect(top.family).toBe('button');
      expect(top.variant).toBe('primary');
      expect(top.vetted).toBe(true);
      expect(top.score).toBeGreaterThan(50);
      expect(top.matchReasons).toBeDefined();
      expect(top.matchReasons!.some(r => r.includes('family match'))).toBe(true);
    });

    it('gives score boost to vetted components over unvetted components', async () => {
      const resolver = new ComponentRegistryResolver();
      // Both match "button", but button-primary is vetted (vetted=1) while button-ghost is not (vetted=0)
      const results = await resolver.resolveCandidateComponents('button', {
        registryItems: mockRegistryItems,
        includeLocalSymbols: false,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].id).toBe('registry:button-primary');
      expect(results[0].score).toBeGreaterThan(results[1].score);
      expect(results[0].matchReasons).toContain('vetted priority boost');
    });

    it('resolves opinion blocks with source: block', async () => {
      const resolver = new ComponentRegistryResolver();
      const results = await resolver.resolveCandidateComponents('user auth login block with oauth', {
        registryItems: mockRegistryItems,
        includeLocalSymbols: false,
      });

      const loginBlock = results.find(c => c.id === 'registry:block-auth-login');
      expect(loginBlock).toBeDefined();
      expect(loginBlock!.source).toBe('block');
      expect(loginBlock!.tags).toContain('oauth');
      expect(loginBlock!.matchReasons!.some(r => r.includes('block type match') || r.includes('tag match'))).toBe(true);
    });

    it('parses JSON stringified intent_tags correctly', async () => {
      const resolver = new ComponentRegistryResolver();
      const results = await resolver.resolveCandidateComponents('analytics dashboard KPI card', {
        registryItems: mockRegistryItems,
        includeLocalSymbols: false,
      });

      const card = results.find(c => c.id === 'registry:card-metric');
      expect(card).toBeDefined();
      expect(card!.tags).toContain('analytics');
      expect(card!.tags).toContain('dashboard');
    });

    it('filters out components that do not match search query', async () => {
      const resolver = new ComponentRegistryResolver();
      const results = await resolver.resolveCandidateComponents('button', {
        registryItems: mockRegistryItems,
        includeLocalSymbols: false,
      });

      const tableMatch = results.find(c => c.id === 'registry:table-data');
      expect(tableMatch).toBeUndefined();
    });

    it('respects limit and minScore options', async () => {
      const resolver = new ComponentRegistryResolver();
      const results = await resolver.resolveCandidateComponents('button card auth table', {
        registryItems: mockRegistryItems,
        includeLocalSymbols: false,
        limit: 2,
      });

      expect(results.length).toBe(2);
    });
  });

  describe('resolveCandidateComponents - Local Symbols from 06_api_surface.toon', () => {
    it('parses symbols from 06_api_surface.toon and matches classes/interfaces', async () => {
      const sampleToon = [
        JSON.stringify({
          _type: 'tag',
          name: 'AstryxCard',
          path: '/app/packages/ui/AstryxCard.tsx',
          kind: 'class',
          pattern: '/^export class AstryxCard {$/',
        }),
        JSON.stringify({
          _type: 'tag',
          name: 'AstryxButton',
          path: '/app/packages/ui/AstryxButton.tsx',
          kind: 'function',
          pattern: '/^export function AstryxButton() {$/',
        }),
        JSON.stringify({
          _type: 'tag',
          name: 'AstryxThemeProvider',
          path: '/app/packages/ui/theme.tsx',
          kind: 'class',
          pattern: '/^export class AstryxThemeProvider {$/',
        }),
        JSON.stringify({
          _type: 'tag',
          name: 'UnrelatedSymbol',
          path: '/app/packages/core/unrelated.ts',
          kind: 'variable',
          pattern: '/^const UnrelatedSymbol = 1;$/',
        }),
      ].join('\n');

      fs.writeFileSync(mockToonPath, sampleToon);

      const resolver = new ComponentRegistryResolver({ projectRoot: tempDir });
      const results = await resolver.resolveCandidateComponents('Astryx Card and theme layout', {
        apiSurfaceToonPath: mockToonPath,
        includeRegistryItems: false,
      });

      expect(results.length).toBeGreaterThan(0);
      const card = results.find(c => c.name === 'AstryxCard');
      expect(card).toBeDefined();
      expect(card!.source).toBe('local');
      expect(card!.path).toBe('/app/packages/ui/AstryxCard.tsx');
      expect(card!.kind).toBe('class');
      expect(card!.matchReasons!.some(r => r.includes('AstryxCard'))).toBe(true);

      const theme = results.find(c => c.name === 'AstryxThemeProvider');
      expect(theme).toBeDefined();

      const unrelated = results.find(c => c.name === 'UnrelatedSymbol');
      expect(unrelated).toBeUndefined();
    });

    it('penalizes test files so production components rank higher', async () => {
      const sampleToon = [
        JSON.stringify({
          _type: 'tag',
          name: 'DAGResolver',
          path: '/app/packages/core/dag-resolver.ts',
          kind: 'class',
        }),
        JSON.stringify({
          _type: 'tag',
          name: 'DAGResolver',
          path: '/app/packages/core/__tests__/dag-resolver.test.ts',
          kind: 'class',
        }),
      ].join('\n');

      fs.writeFileSync(mockToonPath, sampleToon);

      const resolver = new ComponentRegistryResolver({ projectRoot: tempDir });
      const results = await resolver.resolveCandidateComponents('DAGResolver', {
        apiSurfaceToonPath: mockToonPath,
        includeRegistryItems: false,
      });

      expect(results.length).toBe(2);
      expect(results[0].path).toBe('/app/packages/core/dag-resolver.ts');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('gracefully handles missing toon file without throwing', async () => {
      const resolver = new ComponentRegistryResolver({ projectRoot: tempDir });
      const results = await resolver.resolveCandidateComponents('Button', {
        apiSurfaceToonPath: path.join(tempDir, 'non_existent.toon'),
        includeRegistryItems: false,
      });

      expect(results).toEqual([]);
    });

    it('gracefully skips invalid JSON lines in toon file', async () => {
      const malformedToon = [
        'invalid non-json line',
        JSON.stringify({
          _type: 'tag',
          name: 'ValidComponent',
          path: '/app/src/Valid.tsx',
          kind: 'class',
        }),
        '{ bad json }',
      ].join('\n');

      fs.writeFileSync(mockToonPath, malformedToon);

      const resolver = new ComponentRegistryResolver({ projectRoot: tempDir });
      const results = await resolver.resolveCandidateComponents('ValidComponent', {
        apiSurfaceToonPath: mockToonPath,
        includeRegistryItems: false,
      });

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('ValidComponent');
    });

    it('rejects custom toon path that does not end in .toon (REV-2)', async () => {
      const resolver = new ComponentRegistryResolver({ projectRoot: tempDir });
      await expect(
        resolver.resolveCandidateComponents('Button', {
          apiSurfaceToonPath: path.join(tempDir, 'invalid_extension.json'),
        })
      ).rejects.toThrow(/must end with \.toon/);
    });

    it('rejects custom toon path attempting directory traversal outside projectRoot (REV-2)', async () => {
      const resolver = new ComponentRegistryResolver({ projectRoot: tempDir });
      await expect(
        resolver.resolveCandidateComponents('Button', {
          apiSurfaceToonPath: '../outside_project.toon',
        })
      ).rejects.toThrow(/Directory traversal detected/);

      await expect(
        resolver.resolveCandidateComponents('Button', {
          apiSurfaceToonPath: '/etc/passwd.toon',
        })
      ).rejects.toThrow(/Directory traversal detected/);
    });
  });

  describe('Combined Resolution (Local Symbols + Registry Items)', () => {
    it('combines candidates and ranks them consistently by score', async () => {
      const sampleToon = [
        JSON.stringify({
          _type: 'tag',
          name: 'AstryxButton',
          path: '/app/packages/ui/AstryxButton.tsx',
          kind: 'class',
        }),
      ].join('\n');
      fs.writeFileSync(mockToonPath, sampleToon);

      const registryItems = [
        {
          id: 'registry:button-vetted',
          name: 'VettedButton',
          family: 'button',
          vetted: 1,
          description: 'A vetted registry button component',
        },
      ];

      const resolver = new ComponentRegistryResolver({ projectRoot: tempDir });
      const results = await resolver.resolveCandidateComponents('button component', {
        apiSurfaceToonPath: mockToonPath,
        registryItems,
      });

      expect(results.length).toBe(2);
      const sources = results.map(r => r.source);
      expect(sources).toContain('local');
      expect(sources).toContain('registry');
    });
  });

  describe('suggestReusesForTask', () => {
    const availableComponents: ComponentCandidate[] = [
      {
        id: 'AstryxThemeProvider',
        name: 'AstryxThemeProvider',
        source: 'local',
        path: 'packages/superconductor-ui/src/theme/ThemeProvider.tsx',
        score: 95,
        family: 'theme',
        tags: ['theme', 'astryx', 'provider'],
      },
      {
        id: 'AstryxLayout',
        name: 'AstryxLayout',
        source: 'local',
        path: 'packages/superconductor-ui/src/layout/Layout.tsx',
        score: 90,
        family: 'layout',
        tags: ['layout', 'astryx', 'shell'],
      },
      {
        id: 'AstryxCard',
        name: 'AstryxCard',
        source: 'local',
        path: 'packages/superconductor-ui/src/components/Card.tsx',
        score: 85,
        family: 'card',
        tags: ['card', 'astryx', 'ui'],
      },
      {
        id: 'AstryxCheckbox',
        name: 'AstryxCheckbox',
        source: 'local',
        path: 'packages/superconductor-ui/src/components/Checkbox.tsx',
        score: 80,
        family: 'checkbox',
        tags: ['checkbox', 'astryx', 'input'],
      },
      {
        id: 'AstryxButton',
        name: 'AstryxButton',
        source: 'local',
        path: 'packages/superconductor-ui/src/components/Button.tsx',
        score: 88,
        family: 'button',
        tags: ['button', 'astryx', 'input'],
      },
      {
        id: 'registry:block-auth-login',
        name: 'AuthLoginBlock',
        source: 'block',
        score: 75,
        family: 'block',
        tags: ['auth', 'login'],
      },
      {
        id: 'registry_list_blocks',
        name: 'registry_list_blocks',
        source: 'registry',
        score: 100,
        family: 'tool',
      },
    ];

    it('returns empty array when task description is empty or components list is empty', () => {
      const resolver = new ComponentRegistryResolver();
      expect(resolver.suggestReusesForTask('', availableComponents)).toEqual([]);
      expect(resolver.suggestReusesForTask('Build layout', [])).toEqual([]);
    });

    it('recommends AstryxThemeProvider and AstryxLayout when referenced in task description', () => {
      const resolver = new ComponentRegistryResolver();
      const task = 'Scaffold Astryx Report Frontend with AstryxThemeProvider and AstryxLayout';
      const recommendations = resolver.suggestReusesForTask(task, availableComponents);

      expect(recommendations).toContain('AstryxThemeProvider');
      expect(recommendations).toContain('AstryxLayout');
      expect(recommendations).not.toContain('registry:block-auth-login');
    });

    it('recommends AstryxCard, AstryxCheckbox, and AstryxButton for visualization task', () => {
      const resolver = new ComponentRegistryResolver();
      const task = 'Implement Candidate Visualization using AstryxCard, AstryxCheckbox, and AstryxButton';
      const recommendations = resolver.suggestReusesForTask(task, availableComponents);

      expect(recommendations).toContain('AstryxCard');
      expect(recommendations).toContain('AstryxCheckbox');
      expect(recommendations).toContain('AstryxButton');
      expect(recommendations).not.toContain('registry:block-auth-login');
    });

    it('recommends registry_list_blocks when task description mentions it', () => {
      const resolver = new ComponentRegistryResolver();
      const task = 'Hook registry_recommend and registry_list_blocks into planner';
      const recommendations = resolver.suggestReusesForTask(task, availableComponents);

      expect(recommendations).toContain('registry_list_blocks');
    });

    it('recommends component by family and tag keywords when specific name is not verbatim', () => {
      const resolver = new ComponentRegistryResolver();
      const task = 'Add user authentication login form block';
      const recommendations = resolver.suggestReusesForTask(task, availableComponents);

      expect(recommendations).toContain('registry:block-auth-login');
    });

    it('supports preferPath: true option to return file paths instead of IDs', () => {
      const resolver = new ComponentRegistryResolver();
      const task = 'Scaffold Astryx Report Frontend with AstryxThemeProvider';
      const recommendations = resolver.suggestReusesForTask(task, availableComponents, {
        preferPath: true,
      });

      expect(recommendations).toContain('packages/superconductor-ui/src/theme/ThemeProvider.tsx');
    });

    it('supports format: path and format: name options', () => {
      const resolver = new ComponentRegistryResolver();
      const task = 'Scaffold Astryx Report Frontend with AstryxThemeProvider';

      const pathResult = resolver.suggestReusesForTask(task, availableComponents, { format: 'path' });
      expect(pathResult).toContain('packages/superconductor-ui/src/theme/ThemeProvider.tsx');

      const nameResult = resolver.suggestReusesForTask(task, availableComponents, { format: 'name' });
      expect(nameResult).toContain('AstryxThemeProvider');
    });

    it('returns empty array when task is unrelated to any available component', () => {
      const resolver = new ComponentRegistryResolver();
      const task = 'Configure database replication in PostgreSQL cluster';
      const recommendations = resolver.suggestReusesForTask(task, availableComponents);

      expect(recommendations).toEqual([]);
    });

    it('respects limit option', () => {
      const resolver = new ComponentRegistryResolver();
      const task = 'Implement UI with AstryxCard, AstryxButton, AstryxCheckbox, AstryxLayout';
      const recommendations = resolver.suggestReusesForTask(task, availableComponents, { limit: 2 });

      expect(recommendations.length).toBe(2);
    });
  });

  describe('Integration with Real Workspace 06_api_surface.toon', () => {
    it('queries symbols from the actual intelligence snapshot if present', async () => {
      const realToonPath = path.resolve(
        process.cwd(),
        '../../superconductor/intelligence/06_api_surface.toon'
      );

      // If running from packages/superconductor-core, resolve relative to extension root
      const candidatePaths = [
        realToonPath,
        path.resolve(process.cwd(), 'superconductor/intelligence/06_api_surface.toon'),
        path.resolve(__dirname, '../../../../superconductor/intelligence/06_api_surface.toon'),
      ];

      const existingPath = candidatePaths.find(p => fs.existsSync(p));
      if (!existingPath) {
        // Skip if not in full repo environment
        return;
      }

      const workspaceRoot = path.dirname(path.dirname(path.dirname(existingPath)));
      const resolver = new ComponentRegistryResolver({ projectRoot: workspaceRoot });
      const results = await resolver.resolveCandidateComponents('DAGResolver dependency resolution', {
        apiSurfaceToonPath: existingPath,
        includeRegistryItems: false,
      });

      expect(results.length).toBeGreaterThan(0);
      const dagMatch = results.find(c => c.name === 'DAGResolver');
      expect(dagMatch).toBeDefined();
      expect(dagMatch!.source).toBe('local');
    });
  });
});
