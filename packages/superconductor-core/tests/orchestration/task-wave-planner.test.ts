import { describe, it, expect } from 'vitest';
import {
  TaskWavePlanner,
  type TaskPlanUnit,
} from '../../src/orchestration/task-wave-planner.js';

describe('TaskWavePlanner', () => {
  describe('Antichain Task Batching Across Phases', () => {
    it('groups independent tasks across Phase 0, Phase 1, and Phase 2 into Wave 0 together', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Phase 0 Task',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 0,
          creates: ['packages/core/src/surface-adapter.ts'],
          protected: ['packages/core/src/index.ts'],
        },
        {
          id: 'wu-1',
          task: 'Phase 1 Task',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'scanner',
          phase: 1,
          creates: ['packages/core/src/scanner.ts'],
          protected: ['packages/core/src/index.ts'],
        },
        {
          id: 'wu-2',
          task: 'Phase 2 Task',
          tier: 3,
          agent: 'superconductor-processor',
          domain: 'tokens',
          phase: 2,
          creates: ['packages/core/src/token-synthesizer.ts'],
          protected: ['packages/core/src/index.ts'],
        },
      ];

      const waves = TaskWavePlanner.planTaskWaves(units);

      // All 3 tasks are independent of each other (read-read on index.ts is not a hazard)
      // Concurrency is maximized: all 3 run in Wave 0!
      expect(waves).toHaveLength(1);
      expect(waves[0]).toHaveLength(3);

      // High-tier task (Phase 2, tier 3) is sorted first within the wave
      expect(waves[0][0].id).toBe('wu-2');
      expect(waves[0][1].id).toBe('wu-0');
      expect(waves[0][2].id).toBe('wu-1');
    });

    it('groups independent tasks parsed from markdown across phases into Wave 0', () => {
      const plan = `
## Phase 0: Setup
- [ ] Task: Task P0 [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/p0.ts
    PROTECTED: packages/core/src/index.ts

## Phase 1: Engine
- [ ] Task: Task P1 [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/p1.ts
    PROTECTED: packages/core/src/index.ts

## Phase 2: Polish
- [ ] Task: Task P2 [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/p2.ts
    PROTECTED: packages/core/src/index.ts
`;
      const units = TaskWavePlanner.parsePlanWithDependencies(plan);
      expect(units).toHaveLength(3);

      const waves = TaskWavePlanner.planTaskWaves(units);
      expect(waves).toHaveLength(1);
      expect(waves[0].map(u => u.task)).toEqual(['Task P0', 'Task P1', 'Task P2']);
    });
  });

  describe('File Write Hazards Sequencing', () => {
    it('properly sequences write-read hazards (creates file A -> protected file A) into Wave 0 then Wave 1', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Define SurfaceAdapter',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 0,
          creates: ['packages/core/src/surface-adapter.ts'],
          protected: ['packages/core/src/index.ts'],
        },
        {
          id: 'wu-1',
          task: 'Implement Vite Harness',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 0,
          creates: ['packages/core/src/vite-harness.ts'],
          protected: ['packages/core/src/surface-adapter.ts'], // Protected file created by wu-0!
        },
      ];

      const waves = TaskWavePlanner.planTaskWaves(units);

      expect(waves).toHaveLength(2);
      expect(waves[0]).toHaveLength(1);
      expect(waves[0][0].id).toBe('wu-0');
      expect(waves[1]).toHaveLength(1);
      expect(waves[1][0].id).toBe('wu-1');
    });

    it('matches file paths using suffix/relative formats between creates and protected', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Create Component',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'ui',
          phase: 0,
          creates: ['packages/ui/src/button.tsx'],
        },
        {
          id: 'wu-1',
          task: 'Use Component',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'ui',
          phase: 1,
          protected: ['button.tsx'], // Suffix match
        },
      ];

      const waves = TaskWavePlanner.planTaskWaves(units);
      expect(waves).toHaveLength(2);
      expect(waves[0][0].id).toBe('wu-0');
      expect(waves[1][0].id).toBe('wu-1');
    });

    it('matches recursive glob src/components/**/*.tsx to immediate child and nested files', () => {
      expect(TaskWavePlanner.matchesFilePath('src/components/**/*.tsx', 'src/components/Button.tsx')).toBe(true);
      expect(TaskWavePlanner.matchesFilePath('src/components/**/*.tsx', 'src/components/ui/Button.tsx')).toBe(true);
      expect(TaskWavePlanner.matchesFilePath('src/components/**/*.tsx', 'src/components/ui/nested/Button.tsx')).toBe(true);
      expect(TaskWavePlanner.matchesFilePath('src/components/**/*.tsx', 'src/components/Button.ts')).toBe(false);
      expect(TaskWavePlanner.matchesFilePath('src/components/**/*.tsx', 'src/other/Button.tsx')).toBe(false);
    });

    it('sequences hazards correctly when one task creates glob src/components/**/*.tsx and another protects immediate child src/components/Button.tsx', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Create components batch',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'ui',
          phase: 0,
          creates: ['src/components/**/*.tsx'],
        },
        {
          id: 'wu-1',
          task: 'Integrate Button component',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'ui',
          phase: 0,
          protected: ['src/components/Button.tsx'],
        },
      ];

      const waves = TaskWavePlanner.planTaskWaves(units);
      expect(waves).toHaveLength(2);
      expect(waves[0][0].id).toBe('wu-0');
      expect(waves[1][0].id).toBe('wu-1');
    });

    it('sequences write-write hazards on the same file according to plan order', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Initial Schema Definition',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'db',
          phase: 0,
          creates: ['src/db/schema.ts'],
        },
        {
          id: 'wu-1',
          task: 'Extend Schema With Relations',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'db',
          phase: 1,
          creates: ['src/db/schema.ts'],
        },
      ];

      const waves = TaskWavePlanner.planTaskWaves(units);
      expect(waves).toHaveLength(2);
      expect(waves[0][0].id).toBe('wu-0');
      expect(waves[1][0].id).toBe('wu-1');
    });
  });

  describe('Explicit Dependency Ordering', () => {
    it('sequences tasks when task specifies dependsOn by task ID', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'task-a',
          task: 'Task Alpha',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 0,
        },
        {
          id: 'task-b',
          task: 'Task Beta',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 1,
          dependsOn: ['task-a'],
        },
      ];

      const waves = TaskWavePlanner.planTaskWaves(units);
      expect(waves).toHaveLength(2);
      expect(waves[0][0].id).toBe('task-a');
      expect(waves[1][0].id).toBe('task-b');
    });

    it('sequences tasks when task specifies dependsOn by task title', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Build Foundation',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 0,
        },
        {
          id: 'wu-1',
          task: 'Build Extension',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 1,
          dependsOn: ['Build Foundation'],
        },
      ];

      const waves = TaskWavePlanner.planTaskWaves(units);
      expect(waves).toHaveLength(2);
      expect(waves[0][0].id).toBe('wu-0');
      expect(waves[1][0].id).toBe('wu-1');
    });

    it('sequences tasks when task specifies dependency via REUSES on an artifact created by another task', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Build Card Component',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'ui',
          phase: 0,
          creates: ['src/components/card.tsx'],
        },
        {
          id: 'wu-1',
          task: 'Build Dashboard Widget',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'dashboard',
          phase: 1,
          reuses: ['card.tsx'],
        },
      ];

      const waves = TaskWavePlanner.planTaskWaves(units);
      expect(waves).toHaveLength(2);
      expect(waves[0][0].id).toBe('wu-0');
      expect(waves[1][0].id).toBe('wu-1');
    });
  });

  describe('Cycle Detection', () => {
    it('throws error on direct 2-task circular dependency', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Task A',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 0,
          dependsOn: ['wu-1'],
        },
        {
          id: 'wu-1',
          task: 'Task B',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 1,
          dependsOn: ['wu-0'],
        },
      ];

      expect(() => TaskWavePlanner.planTaskWaves(units)).toThrow(
        'Cyclical task dependencies detected in plan'
      );
    });

    it('throws error on file hazard circular dependency', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Task A',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 0,
          creates: ['fileA.ts'],
          protected: ['fileB.ts'],
        },
        {
          id: 'wu-1',
          task: 'Task B',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 1,
          creates: ['fileB.ts'],
          protected: ['fileA.ts'],
        },
      ];

      expect(() => TaskWavePlanner.planTaskWaves(units)).toThrow(
        'Cyclical task dependencies detected in plan'
      );
    });

    it('throws error on multi-task circular dependency (A -> B -> C -> A)', () => {
      const units: TaskPlanUnit[] = [
        {
          id: 'wu-0',
          task: 'Task A',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 0,
          dependsOn: ['wu-2'],
        },
        {
          id: 'wu-1',
          task: 'Task B',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 1,
          dependsOn: ['wu-0'],
        },
        {
          id: 'wu-2',
          task: 'Task C',
          tier: 2,
          agent: 'superconductor-processor',
          domain: 'core',
          phase: 2,
          dependsOn: ['wu-1'],
        },
      ];

      expect(() => TaskWavePlanner.planTaskWaves(units)).toThrow(
        'Cyclical task dependencies detected in plan'
      );
    });
  });

  describe('Concurrency Capping and Tier Prioritization', () => {
    it('caps waves to maxConcurrent and batches remainder in next wave', () => {
      const units: TaskPlanUnit[] = [
        { id: '1', task: 'T1', tier: 2, agent: 'a', domain: 'd', phase: 0 },
        { id: '2', task: 'T2', tier: 2, agent: 'a', domain: 'd', phase: 0 },
        { id: '3', task: 'T3', tier: 3, agent: 'a', domain: 'd', phase: 0 },
        { id: '4', task: 'T4', tier: 4, agent: 'a', domain: 'd', phase: 0 },
        { id: '5', task: 'T5', tier: 1, agent: 'a', domain: 'd', phase: 0 },
        { id: '6', task: 'T6', tier: 2, agent: 'a', domain: 'd', phase: 0 },
        { id: '7', task: 'T7', tier: 3, agent: 'a', domain: 'd', phase: 0 },
      ];

      // Default maxConcurrent is 5
      const waves = TaskWavePlanner.planTaskWaves(units, { maxConcurrent: 5 });
      expect(waves).toHaveLength(2);
      expect(waves[0]).toHaveLength(5);
      expect(waves[1]).toHaveLength(2);

      // Verify wave 0 received highest tier tasks:
      // T4 (tier 4), T3 (tier 3), T7 (tier 3), T1 (tier 2), T2 (tier 2)
      expect(waves[0].map(u => u.id)).toEqual(['4', '3', '7', '1', '2']);
      // Wave 1 gets remainder: T6 (tier 2), T5 (tier 1)
      expect(waves[1].map(u => u.id)).toEqual(['6', '5']);
    });

    it('custom maxConcurrent partitions tasks into smaller batches', () => {
      const units: TaskPlanUnit[] = [
        { id: '1', task: 'T1', tier: 2, agent: 'a', domain: 'd', phase: 0 },
        { id: '2', task: 'T2', tier: 2, agent: 'a', domain: 'd', phase: 0 },
        { id: '3', task: 'T3', tier: 2, agent: 'a', domain: 'd', phase: 0 },
        { id: '4', task: 'T4', tier: 2, agent: 'a', domain: 'd', phase: 0 },
      ];

      const waves = TaskWavePlanner.planTaskWaves(units, { maxConcurrent: 2 });
      expect(waves).toHaveLength(2);
      expect(waves[0]).toHaveLength(2);
      expect(waves[1]).toHaveLength(2);
    });

    it('returns empty array when units array is empty', () => {
      expect(TaskWavePlanner.planTaskWaves([])).toEqual([]);
    });
  });

  describe('parsePlanWithDependencies', () => {
    it('parses single-line and multi-line CREATES, PROTECTED, DEPENDS, and REUSES tags', () => {
      const markdown = `
## Phase 0: Foundation
- [ ] Task: Alpha Task [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: src/alpha.ts, src/types.ts
    PROTECTED: src/index.ts
    DEPENDS: none
    REUSES: []
    - [ ] Internal subtask 1
    - [ ] Internal subtask 2

## Phase 1: Consumer
- [ ] Task: Beta Task [TIER-2] [AGENT:superconductor-processor] [DOMAIN:feature]
    CREATES:
      - src/beta.ts
      - src/beta-util.ts
    PROTECTED:
      - src/alpha.ts
    DEPENDS:
      - Alpha Task
    REUSES:
      - src/types.ts
`;

      const units = TaskWavePlanner.parsePlanWithDependencies(markdown);
      expect(units).toHaveLength(2);

      const alpha = units[0];
      expect(alpha.id).toBe('wu-0');
      expect(alpha.task).toBe('Alpha Task');
      expect(alpha.tier).toBe(3);
      expect(alpha.agent).toBe('superconductor-processor');
      expect(alpha.domain).toBe('core');
      expect(alpha.phase).toBe(0);
      expect(alpha.creates).toEqual(['src/alpha.ts', 'src/types.ts']);
      expect(alpha.protected).toEqual(['src/index.ts']);
      expect(alpha.dependsOn).toBeUndefined();
      expect(alpha.reuses).toBeUndefined();

      const beta = units[1];
      expect(beta.id).toBe('wu-1');
      expect(beta.task).toBe('Beta Task');
      expect(beta.tier).toBe(2);
      expect(beta.agent).toBe('superconductor-processor');
      expect(beta.domain).toBe('feature');
      expect(beta.phase).toBe(1);
      expect(beta.creates).toEqual(['src/beta.ts', 'src/beta-util.ts']);
      expect(beta.protected).toEqual(['src/alpha.ts']);
      expect(beta.dependsOn).toEqual(['Alpha Task']);
      expect(beta.reuses).toEqual(['src/types.ts']);
    });
  });
});
