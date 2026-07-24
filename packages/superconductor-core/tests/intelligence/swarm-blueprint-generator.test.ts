import { test, expect, describe } from 'vitest';
import { SwarmBlueprintGenerator } from '../../src/intelligence/swarm-blueprint-generator.js';

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
});
