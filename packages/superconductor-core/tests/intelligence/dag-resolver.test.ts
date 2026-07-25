import { describe, it, expect } from 'vitest';
import {
  DAGResolver,
  DAGCycleError,
  DAGMissingDependencyError,
} from '../../src/intelligence/dag-resolver.js';
import type { TrackEntryYaml } from '../../src/schema/track-manifest.js';

describe('DAGResolver', () => {
  describe('Topological Sorting (Kahn\'s Algorithm)', () => {
    it('sorts flat nodes with no dependencies', () => {
      const items = [
        { id: 'node-b', deps: [] },
        { id: 'node-a', deps: [] },
        { id: 'node-c', deps: [] },
      ];
      const sorted = DAGResolver.sort(items);
      expect(sorted.map(x => x.id)).toEqual(['node-a', 'node-b', 'node-c']);
    });

    it('sorts a linear dependency chain (A -> B -> C)', () => {
      // B depends on A, C depends on B
      const items = [
        { id: 'C', deps: ['B'] },
        { id: 'A', deps: [] },
        { id: 'B', deps: ['A'] },
      ];
      const sorted = DAGResolver.sort(items);
      expect(sorted.map(x => x.id)).toEqual(['A', 'B', 'C']);
    });

    it('sorts a complex diamond DAG', () => {
      // A -> B, A -> C, B -> D, C -> D
      const items = [
        { id: 'D', deps: ['B', 'C'] },
        { id: 'B', deps: ['A'] },
        { id: 'C', deps: ['A'] },
        { id: 'A', deps: [] },
      ];
      const sorted = DAGResolver.sort(items);
      const ids = sorted.map(x => x.id);
      expect(ids[0]).toBe('A');
      expect(ids[3]).toBe('D');
      expect(ids.slice(1, 3)).toEqual(expect.arrayContaining(['B', 'C']));
    });

    it('supports TrackEntryYaml structure with trackId and deps', () => {
      const tracks: Partial<TrackEntryYaml>[] = [
        { trackId: 'track-2', deps: ['track-1'], name: 'Track 2', status: 'planned', link: '', spec: '', plan: '' },
        { trackId: 'track-1', deps: [], name: 'Track 1', status: 'completed', link: '', spec: '', plan: '' },
      ];
      const sorted = DAGResolver.sort(tracks as TrackEntryYaml[]);
      expect(sorted.map(t => t.trackId)).toEqual(['track-1', 'track-2']);
    });

    it('supports custom getId and getDeps getters', () => {
      const customItems = [
        { name: 'task2', requires: ['task1'] },
        { name: 'task1', requires: [] },
      ];
      const sorted = DAGResolver.sort(customItems, {
        getId: item => item.name,
        getDeps: item => item.requires,
      });
      expect(sorted.map(x => x.name)).toEqual(['task1', 'task2']);
    });
  });

  describe('Parallel Waves (getWaves)', () => {
    it('groups nodes into waves of independent tasks', () => {
      const items = [
        { id: 'A', deps: [] },
        { id: 'B', deps: [] },
        { id: 'C', deps: ['A'] },
        { id: 'D', deps: ['A', 'B'] },
        { id: 'E', deps: ['C', 'D'] },
      ];
      const waves = DAGResolver.getWaves(items);
      expect(waves).toHaveLength(3);
      expect(waves[0].map(x => x.id)).toEqual(['A', 'B']);
      expect(waves[1].map(x => x.id)).toEqual(['C', 'D']);
      expect(waves[2].map(x => x.id)).toEqual(['E']);
    });
  });

  describe('Missing Dependency Handling', () => {
    it('throws DAGMissingDependencyError by default when a dependency is missing', () => {
      const items = [
        { id: 'A', deps: ['NON_EXISTENT'] },
        { id: 'B', deps: ['A', 'ANOTHER_MISSING'] },
      ];

      expect(() => DAGResolver.sort(items)).toThrow(DAGMissingDependencyError);

      try {
        DAGResolver.sort(items);
      } catch (err: any) {
        expect(err).toBeInstanceOf(DAGMissingDependencyError);
        expect(err.missingDependencies).toEqual({
          NON_EXISTENT: ['A'],
          ANOTHER_MISSING: ['B'],
        });
        expect(err.message).toContain('NON_EXISTENT');
        expect(err.message).toContain('ANOTHER_MISSING');
      }
    });

    it('ignores missing dependencies when onMissingDependency is set to "ignore"', () => {
      const items = [
        { id: 'B', deps: ['A', 'EXTERNAL_DEP'] },
        { id: 'A', deps: [] },
      ];

      const sorted = DAGResolver.sort(items, { onMissingDependency: 'ignore' });
      expect(sorted.map(x => x.id)).toEqual(['A', 'B']);
    });
  });

  describe('Cycle Detection', () => {
    it('detects self-loop cycle (A -> A)', () => {
      const items = [
        { id: 'A', deps: ['A'] },
      ];

      expect(() => DAGResolver.sort(items)).toThrow(DAGCycleError);
      try {
        DAGResolver.sort(items);
      } catch (err: any) {
        expect(err).toBeInstanceOf(DAGCycleError);
        expect(err.cycle).toEqual(['A', 'A']);
        expect(err.message).toContain('A -> A');
      }
    });

    it('detects 2-node cycle (A -> B -> A)', () => {
      const items = [
        { id: 'A', deps: ['B'] },
        { id: 'B', deps: ['A'] },
      ];

      expect(() => DAGResolver.sort(items)).toThrow(DAGCycleError);
      try {
        DAGResolver.sort(items);
      } catch (err: any) {
        expect(err).toBeInstanceOf(DAGCycleError);
        expect(err.cycle).toEqual(['A', 'B', 'A']);
        expect(err.message).toContain('A -> B -> A');
      }
    });

    it('detects 3-node cycle (A -> B -> C -> A)', () => {
      const items = [
        { id: 'A', deps: ['C'] },
        { id: 'B', deps: ['A'] },
        { id: 'C', deps: ['B'] },
      ];

      expect(() => DAGResolver.sort(items)).toThrow(DAGCycleError);
      try {
        DAGResolver.sort(items);
      } catch (err: any) {
        expect(err).toBeInstanceOf(DAGCycleError);
        expect(err.cycle).toEqual(['A', 'B', 'C', 'A']);
        expect(err.message).toContain('A -> B -> C -> A');
      }
    });

    it('detects cycle in a mixed DAG with valid nodes', () => {
      const items = [
        { id: 'valid1', deps: [] },
        { id: 'valid2', deps: ['valid1'] },
        { id: 'cycle1', deps: ['cycle2'] },
        { id: 'cycle2', deps: ['cycle1'] },
      ];

      expect(() => DAGResolver.sort(items)).toThrow(DAGCycleError);
      try {
        DAGResolver.sort(items);
      } catch (err: any) {
        expect(err).toBeInstanceOf(DAGCycleError);
        expect(err.cycle).toEqual(['cycle1', 'cycle2', 'cycle1']);
        expect(err.remainingNodes).toEqual(expect.arrayContaining(['cycle1', 'cycle2']));
      }
    });
  });
});
