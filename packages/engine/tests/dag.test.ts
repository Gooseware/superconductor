import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { parseYamlDag } from '../src/dag/parser';

describe('YAML DAG Parser and Validator', () => {
  it('should parse a valid multi-node YAML DAG into TaskGraph', () => {
    const yamlContent = fs.readFileSync(path.resolve(__dirname, 'fixtures/sample-dag.yaml'), 'utf-8');
    const result = parseYamlDag(yamlContent);

    expect(result.success).toBe(true);
    if (!result.success) return; // For TS narrowing

    const { graph } = result;
    expect(graph.nodes['root']).toBeDefined();
    expect(graph.nodes['root'].role).toBe('architect');
    expect(graph.nodes['root'].tier).toBe(1);
    expect(graph.nodes['root'].prompt).toContain('Initialize Setup');
    expect(graph.nodes['root'].prompt).toContain('Sets up the project context');
    expect(graph.nodes['root'].contextFiles).toEqual(['package.json']);
    expect(graph.nodes['root'].dependsOn).toEqual([]);

    expect(graph.nodes['integration'].dependsOn).toEqual(['api_routes', 'ui_components']);
    expect(graph.nodes['e2e_tests'].dependsOn).toEqual(['integration']);
    
    // Check edges are populated
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'root', to: 'backend_setup' },
        { from: 'root', to: 'frontend_setup' },
        { from: 'backend_setup', to: 'db_schema' },
        { from: 'db_schema', to: 'api_routes' },
        { from: 'frontend_setup', to: 'ui_components' },
        { from: 'api_routes', to: 'integration' },
        { from: 'ui_components', to: 'integration' },
        { from: 'integration', to: 'e2e_tests' },
      ])
    );
  });

  it('should reject YAML with cyclic dependencies', () => {
    const yaml = `
tasks:
  - id: A
    name: Task A
    description: A
    role: architect
    tier: 1
    dependencies: [C]
  - id: B
    name: Task B
    description: B
    role: architect
    tier: 1
    dependencies: [A]
  - id: C
    name: Task C
    description: C
    role: architect
    tier: 1
    dependencies: [B]
`;
    const result = parseYamlDag(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.message.includes('cycle'))).toBe(true);
    }
  });

  it('should reject YAML with missing dependency references', () => {
    const yaml = `
tasks:
  - id: A
    name: Task A
    description: A
    role: architect
    tier: 1
    dependencies: [MISSING]
`;
    const result = parseYamlDag(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.message.includes('MISSING'))).toBe(true);
    }
  });

  it('should reject YAML with orphan nodes (no path to root)', () => {
    const yaml = `
tasks:
  - id: root
    name: Root
    description: Root
    role: architect
    tier: 1
  - id: orphan1
    name: Orphan 1
    description: Orphan
    role: architect
    tier: 2
    dependencies: [orphan2]
  - id: orphan2
    name: Orphan 2
    description: Orphan
    role: architect
    tier: 2
    dependencies: []
`;
    const result = parseYamlDag(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.message.includes('orphan'))).toBe(true);
    }
  });

  it('should emit structured validation errors with line numbers', () => {
    const yaml = `tasks:
  - id: A
    role: invalid_role
    tier: 5`;
    const result = parseYamlDag(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Validate that the error structure includes line numbers
      expect(result.errors[0]).toHaveProperty('line');
      expect(result.errors[0]).toHaveProperty('column');
      expect(result.errors[0]).toHaveProperty('message');
    }
  });
});
