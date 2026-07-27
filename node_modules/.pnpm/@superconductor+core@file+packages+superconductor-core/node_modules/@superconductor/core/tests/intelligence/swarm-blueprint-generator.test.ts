import { test, expect, describe, vi } from 'vitest';
import { SwarmBlueprintGenerator } from '../../src/intelligence/swarm-blueprint-generator.js';
import { IntelligenceSnapshotReader } from '../../src/intelligence/snapshot-reader.js';

describe('SwarmBlueprintGenerator', () => {
  const planMarkdown = `
## Phase 1 Setup
- [ ] Task: Init repository [TIER-3]
- [ ] Task: Install dependencies
## Phase 2 Implementation
- [ ] Task: Build core
- [ ] Task: Build CLI [TIER-2]
  `;

  test('generate() with a minimal 2-phase plan returns SwarmBlueprint', () => {
    const blueprint = SwarmBlueprintGenerator.generate(planMarkdown);
    expect(blueprint.waves.waves.length).toBeGreaterThan(0);
    expect(blueprint.budget.totalTokens).toBeGreaterThanOrEqual(0);
    expect(blueprint.oracleCadence).toBeGreaterThan(0);
    expect(blueprint.repoContextSource).toBe('heuristic');
  });

  test('formatBlueprintSection() returns formatted markdown header and wave table', () => {
    const blueprint = SwarmBlueprintGenerator.generate(planMarkdown);
    const formatted = SwarmBlueprintGenerator.formatBlueprintSection(blueprint);
    expect(formatted).toContain('## Swarm Blueprint');
    expect(formatted).toContain('**Mode:** pipeline');
    expect(formatted).toContain('### Wave Schedule');
    expect(formatted).toContain('| Wave | Tasks | Models | Est. Tokens | Est. Duration |');
  });

  test('annotatePlan() replaces and appends TCS dynamically', () => {
    const blueprint = SwarmBlueprintGenerator.generate(planMarkdown);
    const annotated = SwarmBlueprintGenerator.annotatePlan(planMarkdown, blueprint);
    
    // Original line: "- [ ] Task: Init repository [TIER-3]"
    expect(annotated).toMatch(/- \[ \] Task: Init repository \[TIER-3:TCS=\d+\]/);
    
    // Original line: "- [ ] Task: Install dependencies" -> should append
    expect(annotated).toMatch(/- \[ \] Task: Install dependencies \[TIER-\d+:TCS=\d+\]/);
  });

  test('generate() with empty plan does not throw', () => {
    const blueprint = SwarmBlueprintGenerator.generate('');
    expect(blueprint.waves.waves.length).toBe(0);
    expect(blueprint.oracleCadence).toBe(1);
    expect(blueprint.avgTCS).toBe(0);
  });
  test('suggests Adapters as technical debt when token economics are favorable based on dependency surface size', () => {
    const smallPlan = `
## Phase 1
- [ ] Task: Small task [TIER-1]
    `;
    
    // Simulate a small dependency surface size (< 50)
    const mockRepoContext = {
      hotspotMap: new Map(),
      testGapMap: new Map(),
      sastFindings: new Map(),
      driftState: 'NONE' as const,
      driftBanner: '',
      dependencySurfaceMap: new Map([['src/a.ts', 10], ['src/b.ts', 20]])
    };
    
    const spy = vi.spyOn(IntelligenceSnapshotReader, 'load').mockReturnValue(mockRepoContext);

    const blueprint = SwarmBlueprintGenerator.generate(smallPlan, { outputDir: '/tmp/dummy' });
    expect(blueprint.adapterSuggestions).toBeDefined();
    expect(blueprint.adapterSuggestions!.length).toBeGreaterThan(0);
    expect(blueprint.adapterSuggestions![0].isTechDebt).toBe(true);
    expect(blueprint.adapterSuggestions![0].name).toContain('Adapter');
    
    spy.mockRestore();
  });

  test('does not suggest Adapters when dependency surface size is large', () => {
    const plan = `
## Phase 1
- [ ] Task: another task [TIER-4]
    `;

    // Simulate a large dependency surface size (>= 50)
    const mockRepoContext = {
      hotspotMap: new Map(),
      testGapMap: new Map(),
      sastFindings: new Map(),
      driftState: 'NONE' as const,
      driftBanner: '',
      dependencySurfaceMap: new Map([['src/a.ts', 60], ['src/b.ts', 80]])
    };
    
    const spy = vi.spyOn(IntelligenceSnapshotReader, 'load').mockReturnValue(mockRepoContext);

    const blueprint = SwarmBlueprintGenerator.generate(plan, { outputDir: '/tmp/dummy' });
    expect(blueprint.adapterSuggestions).toBeDefined();
    expect(blueprint.adapterSuggestions!.length).toBe(0);
    
    spy.mockRestore();
  });
});
