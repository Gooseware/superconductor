import { describe, it, expect } from 'vitest';
import {
  parseTaskCard,
  parsePlanTasksWithMetadata,
  extractListField,
  extractStringField,
} from './parser.js';
import {
  TaskMetadataSchema,
  ParsedTaskCardSchema,
  isTaskMetadata,
  isParsedTaskCard,
} from './task-schema.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Task Metadata Schema & Type Guards', () => {
  it('validates minimal task metadata and populates defaults', () => {
    const parsed = TaskMetadataSchema.parse({
      task: 'Build schema validator',
    });
    expect(parsed.task).toBe('Build schema validator');
    expect(parsed.tier).toBe(1);
    expect(parsed.agent).toBe('superconductor-processor');
    expect(parsed.domain).toBe('default');
    expect(parsed.phase).toBe(0);
    expect(parsed.creates).toEqual([]);
    expect(parsed.protected).toEqual([]);
    expect(parsed.reuses).toEqual([]);
    expect(parsed.invariantAfter).toBeUndefined();
  });

  it('validates full task metadata including reuses array', () => {
    const input = {
      task: 'Implement REUSES Metadata Tag',
      tier: 2,
      agent: 'superconductor-processor',
      domain: 'planning',
      phase: 1,
      creates: ['packages/superconductor-core/src/planning/task-schema.ts'],
      protected: ['packages/superconductor-core/src/planning/index.ts'],
      invariantAfter: 'Task parser MUST correctly extract the REUSES tag array.',
      reuses: ['card.tsx', 'auth-sso', '@superconductor/kernel:block'],
    };
    const parsed = TaskMetadataSchema.parse(input);
    expect(parsed).toEqual(input);
    expect(isTaskMetadata(input)).toBe(true);
    expect(isParsedTaskCard({ ...input, completed: false, subtasks: [] })).toBe(true);
  });

  it('rejects empty task name', () => {
    expect(() => TaskMetadataSchema.parse({ task: '' })).toThrow();
  });
});

describe('extractListField & extractStringField', () => {
  it('extracts single-line comma-separated items', () => {
    const block = `
REUSES: card.tsx, auth-sso, table.tsx
`;
    expect(extractListField(block, 'REUSES')).toEqual(['card.tsx', 'auth-sso', 'table.tsx']);
  });

  it('extracts single-line bracketed items', () => {
    const block = `
REUSES: [card.tsx, auth-sso]
`;
    expect(extractListField(block, 'REUSES')).toEqual(['card.tsx', 'auth-sso']);
  });

  it('extracts single-line bracketed items with trailing inline comments (REV-1)', () => {
    const block = `
REUSES: [card.tsx, auth-sso] # reusable components
`;
    expect(extractListField(block, 'REUSES')).toEqual(['card.tsx', 'auth-sso']);
  });

  it('handles empty bracketed or keyword forms', () => {
    expect(extractListField('REUSES: []', 'REUSES')).toEqual([]);
    expect(extractListField('REUSES: [ ]', 'REUSES')).toEqual([]);
    expect(extractListField('REUSES: none', 'REUSES')).toEqual([]);
    expect(extractListField('REUSES: n/a', 'REUSES')).toEqual([]);
    expect(extractListField('REUSES:', 'REUSES')).toEqual([]);
  });

  it('extracts multi-line bullet items with hyphen and asterisk', () => {
    const blockHyphen = `
REUSES:
  - card.tsx
  - auth-sso
  - @superconductor/ui-kit:nav-bar
`;
    expect(extractListField(blockHyphen, 'REUSES')).toEqual([
      'card.tsx',
      'auth-sso',
      '@superconductor/ui-kit:nav-bar',
    ]);

    const blockAsterisk = `
REUSES:
  * card.tsx
  * auth-sso
`;
    expect(extractListField(blockAsterisk, 'REUSES')).toEqual(['card.tsx', 'auth-sso']);
  });

  it('strips quotes, backticks, and trailing comments in list items', () => {
    const block = `
REUSES:
  - "card.tsx" # reusable component
  - 'auth-sso'
  - \`registry_list_blocks\`
`;
    expect(extractListField(block, 'REUSES')).toEqual([
      'card.tsx',
      'auth-sso',
      'registry_list_blocks',
    ]);
  });

  it('extracts string field and unquotes correctly', () => {
    expect(
      extractStringField('INVARIANT_AFTER: "Dependencies available"', 'INVARIANT_AFTER')
    ).toBe('Dependencies available');

    expect(
      extractStringField("INVARIANT_AFTER: 'Dependencies available'", 'INVARIANT_AFTER')
    ).toBe('Dependencies available');

    expect(
      extractStringField('INVARIANT_AFTER: Dependencies available', 'INVARIANT_AFTER')
    ).toBe('Dependencies available');

    expect(extractStringField('INVARIANT_AFTER:', 'INVARIANT_AFTER')).toBeUndefined();
    expect(extractStringField('OTHER_FIELD: val', 'INVARIANT_AFTER')).toBeUndefined();
  });
});

describe('parseTaskCard', () => {
  it('parses a complete task card with single-line REUSES', () => {
    const taskCard = `
- [ ] Task: Build UI component [TIER-2:TCS=3] [AGENT:superconductor-processor] [DOMAIN:frontend]
    CREATES: src/components/button.tsx, src/components/button.test.tsx
    PROTECTED: src/components/index.ts
    INVARIANT_AFTER: "Button exports cleanly"
    REUSES: card.tsx, auth-sso
    - [ ] Write button tests [TIER-1]
    - [ ] Implement component logic [TIER-1]
`;
    const parsed = parseTaskCard(taskCard, 2);
    expect(parsed.task).toBe('Build UI component');
    expect(parsed.tier).toBe(2);
    expect(parsed.agent).toBe('superconductor-processor');
    expect(parsed.domain).toBe('frontend');
    expect(parsed.phase).toBe(2);
    expect(parsed.creates).toEqual([
      'src/components/button.tsx',
      'src/components/button.test.tsx',
    ]);
    expect(parsed.protected).toEqual(['src/components/index.ts']);
    expect(parsed.invariantAfter).toBe('Button exports cleanly');
    expect(parsed.reuses).toEqual(['card.tsx', 'auth-sso']);
    expect(parsed.completed).toBe(false);
    expect(parsed.subtasks).toEqual([
      'Write button tests [TIER-1]',
      'Implement component logic [TIER-1]',
    ]);
  });

  it('parses a complete task card with multi-line REUSES', () => {
    const taskCard = `
- [ ] Task: Integrate Component Registry [TIER-3:TCS=5] [AGENT:superconductor-processor] [DOMAIN:planning]
    CREATES: packages/superconductor-core/src/planning/registry-resolver.ts
    PROTECTED: packages/superconductor-core/src/agents/dreamer.ts
    INVARIANT_AFTER: "Planner MUST query registry_recommend before generating tasks."
    REUSES:
      - registry_list_blocks
      - registry_recommend
      - @superconductor/kernel:block
    - [ ] Hook registry_recommend into planning [TIER-1:TCS=3]
`;
    const parsed = parseTaskCard(taskCard, 1);
    expect(parsed.task).toBe('Integrate Component Registry');
    expect(parsed.tier).toBe(3);
    expect(parsed.agent).toBe('superconductor-processor');
    expect(parsed.domain).toBe('planning');
    expect(parsed.phase).toBe(1);
    expect(parsed.reuses).toEqual([
      'registry_list_blocks',
      'registry_recommend',
      '@superconductor/kernel:block',
    ]);
    expect(parsed.subtasks).toEqual(['Hook registry_recommend into planning [TIER-1:TCS=3]']);
  });

  it('parses bracketed single-line array in REUSES', () => {
    const taskCard = `
- [ ] Task: Astryx Report Frontend [TIER-3:TCS=3] [AGENT:superconductor-processor] [DOMAIN:frontend]
    CREATES: src/App.tsx
    PROTECTED: package.json
    INVARIANT_AFTER: "App bootstraps"
    REUSES: [AstryxThemeProvider, AstryxLayout]
`;
    const parsed = parseTaskCard(taskCard);
    expect(parsed.reuses).toEqual(['AstryxThemeProvider', 'AstryxLayout']);
  });

  it('handles completed tasks (- [x] Task:)', () => {
    const taskCard = `
- [x] Task: Preflight Checks [TIER-1:TCS=1] [AGENT:superconductor-orchestrator] [DOMAIN:setup]
    CREATES: 
    PROTECTED: 
    INVARIANT_AFTER: "Dependencies available"
    REUSES: []
`;
    const parsed = parseTaskCard(taskCard);
    expect(parsed.completed).toBe(true);
    expect(parsed.task).toBe('Preflight Checks');
    expect(parsed.creates).toEqual([]);
    expect(parsed.protected).toEqual([]);
    expect(parsed.reuses).toEqual([]);
    expect(parsed.invariantAfter).toBe('Dependencies available');
  });

  it('throws when task declaration is missing', () => {
    expect(() => parseTaskCard('CREATES: file.ts\nREUSES: card.tsx')).toThrow(
      'Missing "Task:" declaration'
    );
  });
});

describe('parsePlanTasksWithMetadata', () => {
  it('parses multi-phase plan correctly', () => {
    const plan = `
# Implementation Plan

## Phase 0: Setup
- [x] Task: Preflight Checks [TIER-1:TCS=1] [AGENT:superconductor-orchestrator] [DOMAIN:setup]
    CREATES: 
    PROTECTED: 
    INVARIANT_AFTER: "Environment valid"
    REUSES: []

## Phase 1: Planning
- [ ] Task: Implement REUSES Metadata Tag [TIER-2:TCS=3] [AGENT:superconductor-processor] [DOMAIN:planning]
    CREATES: src/planning/task-schema.ts, src/planning/parser.ts
    PROTECTED: src/planning/index.ts
    INVARIANT_AFTER: "Task parser extracts REUSES"
    REUSES: []
    - [ ] Update regex [TIER-1]

- [ ] Task: Registry Resolver [TIER-3:TCS=3] [AGENT:superconductor-processor] [DOMAIN:planning]
    CREATES: src/planning/registry-resolver.ts
    PROTECTED: src/agents/dreamer.ts
    INVARIANT_AFTER: "Resolver queries registry"
    REUSES:
      - registry_list_blocks
      - registry_recommend

## Phase 2: Execution
- [ ] Task: Run Swarm [TIER-2:TCS=3] [AGENT:superconductor-processor] [DOMAIN:execution]
    CREATES: src/swarm.ts
    PROTECTED: 
    REUSES: [dispatcherAdapter, runnerAdapter]
`;

    const tasks = parsePlanTasksWithMetadata(plan);
    expect(tasks).toHaveLength(4);

    expect(tasks[0].task).toBe('Preflight Checks');
    expect(tasks[0].phase).toBe(0);
    expect(tasks[0].completed).toBe(true);
    expect(tasks[0].domain).toBe('setup');
    expect(tasks[0].reuses).toEqual([]);

    expect(tasks[1].task).toBe('Implement REUSES Metadata Tag');
    expect(tasks[1].phase).toBe(1);
    expect(tasks[1].completed).toBe(false);
    expect(tasks[1].creates).toEqual(['src/planning/task-schema.ts', 'src/planning/parser.ts']);
    expect(tasks[1].reuses).toEqual([]);

    expect(tasks[2].task).toBe('Registry Resolver');
    expect(tasks[2].phase).toBe(1);
    expect(tasks[2].reuses).toEqual(['registry_list_blocks', 'registry_recommend']);

    expect(tasks[3].task).toBe('Run Swarm');
    expect(tasks[3].phase).toBe(2);
    expect(tasks[3].reuses).toEqual(['dispatcherAdapter', 'runnerAdapter']);
  });

  it('correctly parses the real track plan.md', () => {
    const planPath = path.resolve(
      __dirname,
      '../../../../superconductor/tracks/dry_intelligence_improve_architecture_20261001/plan.md'
    );
    if (!fs.existsSync(planPath)) {
      // Skip if path not accessible in this context
      return;
    }

    const planContent = fs.readFileSync(planPath, 'utf8');
    const tasks = parsePlanTasksWithMetadata(planContent);

    expect(tasks.length).toBeGreaterThanOrEqual(10);

    // Verify Phase 0 task
    const p0Task = tasks.find(t => t.phase === 0);
    expect(p0Task).toBeDefined();
    expect(p0Task?.task).toBe('Preflight Checks');
    expect(p0Task?.reuses).toEqual([]);

    // Verify Phase 1 tasks
    const p1Tasks = tasks.filter(t => t.phase === 1);
    expect(p1Tasks).toHaveLength(2);
    expect(p1Tasks[0].task).toBe('Implement REUSES Metadata Tag');
    expect(p1Tasks[0].reuses).toEqual([]);
    expect(p1Tasks[1].task).toBe('Integrate Component Registry Queries in Planner');
    expect(p1Tasks[1].reuses).toEqual(['registry_list_blocks']);

    // Verify Phase 3 tasks with REUSES
    const p3Tasks = tasks.filter(t => t.phase === 3);
    expect(p3Tasks).toHaveLength(2);
    expect(p3Tasks[0].task).toBe('Scaffold Astryx Report Frontend');
    expect(p3Tasks[0].reuses).toEqual(['AstryxThemeProvider', 'AstryxLayout']);
    expect(p3Tasks[1].task).toBe('Implement Candidate Visualization & Track Generation');
    expect(p3Tasks[1].reuses).toEqual(['AstryxCard', 'AstryxCheckbox', 'AstryxButton']);
  });
});
