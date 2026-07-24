import { describe, it, expect } from 'vitest';
import { ParallelismOptimiser, PlanTask } from '../../src/intelligence/parallelism-optimiser.js';

describe('ParallelismOptimiser', () => {
  describe('schedule', () => {
    it('schedules flat DAG (no deps) into a single wave', () => {
      const tasks: PlanTask[] = [
        { id: 't1', description: '', phase: 'P1', tier: 'flash', dependencies: [], tcs: {} as any },
        { id: 't2', description: '', phase: 'P1', tier: 'flash', dependencies: [], tcs: {} as any },
      ];
      const result = ParallelismOptimiser.schedule(tasks, 5);
      expect(result.waves).toHaveLength(1);
      expect(result.waves[0].tasks.map(t => t.id)).toEqual(['t1', 't2']);
    });

    it('schedules a linear chain into multiple waves', () => {
      const tasks: PlanTask[] = [
        { id: 't1', description: '', phase: 'P1', tier: 'flash', dependencies: [], tcs: {} as any },
        { id: 't2', description: '', phase: 'P1', tier: 'flash', dependencies: ['t1'], tcs: {} as any },
        { id: 't3', description: '', phase: 'P1', tier: 'flash', dependencies: ['t2'], tcs: {} as any },
      ];
      const result = ParallelismOptimiser.schedule(tasks, 5);
      expect(result.waves).toHaveLength(3);
      expect(result.waves[0].tasks.map(t => t.id)).toEqual(['t1']);
      expect(result.waves[1].tasks.map(t => t.id)).toEqual(['t2']);
      expect(result.waves[2].tasks.map(t => t.id)).toEqual(['t3']);
    });

    it('schedules mixed DAG', () => {
      const tasks: PlanTask[] = [
        { id: 'A', description: '', phase: 'P1', tier: 'flash', dependencies: [], tcs: {} as any },
        { id: 'B', description: '', phase: 'P1', tier: 'flash', dependencies: [], tcs: {} as any },
        { id: 'C', description: '', phase: 'P1', tier: 'flash', dependencies: ['A'], tcs: {} as any },
        { id: 'D', description: '', phase: 'P1', tier: 'flash', dependencies: ['B'], tcs: {} as any },
        { id: 'E', description: '', phase: 'P1', tier: 'flash', dependencies: ['C', 'D'], tcs: {} as any },
      ];
      const result = ParallelismOptimiser.schedule(tasks, 5);
      expect(result.waves).toHaveLength(3);
      expect(result.waves[0].tasks.map(t => t.id)).toEqual(expect.arrayContaining(['A', 'B']));
      expect(result.waves[1].tasks.map(t => t.id)).toEqual(expect.arrayContaining(['C', 'D']));
      expect(result.waves[2].tasks.map(t => t.id)).toEqual(['E']);
    });

    it('respects maxConcurrent cap', () => {
      const tasks: PlanTask[] = Array.from({ length: 8 }).map((_, i) => ({
        id: `t${i}`, description: '', phase: 'P1', tier: 'flash', dependencies: [], tcs: {} as any
      }));
      const result = ParallelismOptimiser.schedule(tasks, 3);
      expect(result.waves).toHaveLength(3);
      expect(result.waves[0].tasks).toHaveLength(3);
      expect(result.waves[1].tasks).toHaveLength(3);
      expect(result.waves[2].tasks).toHaveLength(2);
    });
  });

  describe('parsePlan', () => {
    it('parses a multi-phase plan and sets correct IDs and deps', () => {
      const markdown = `
# Plan
## Phase 1: Setup
- [ ] Task A [TIER-2:TCS=8]
- [ ] Task B [TIER-1:TCS=3]
- [x] Task C
## Phase 2: Implementation
- [ ] Task D
- [ ] Task E [TIER-3:TCS=12]
      `;
      const tasks = ParallelismOptimiser.parsePlan(markdown);
      expect(tasks).toHaveLength(5);
      expect(tasks[0].id).toBe('phase1-task1');
      expect(tasks[0].tier).toBe('flash');
      expect(tasks[1].tier).toBe('flash-lite');
      expect(tasks[2].tier).toBe('flash');
      expect(tasks[3].tier).toBe('flash');
      expect(tasks[4].tier).toBe('pro');
      
      // Check deps
      expect(tasks[0].dependencies).toEqual([]);
      expect(tasks[3].dependencies).toEqual(['phase1-task1', 'phase1-task2', 'phase1-task3']);
      expect(tasks[4].dependencies).toEqual(['phase1-task1', 'phase1-task2', 'phase1-task3']);
    });
  });
});
