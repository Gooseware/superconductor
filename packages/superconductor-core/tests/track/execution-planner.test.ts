import { describe, it, expect } from 'vitest';
import { ExecutionPlanner, TrackPlanData } from '../../src/track/execution-planner';

describe('ExecutionPlanner', () => {
  describe('planWaves', () => {
    it('should return independent tracks together in Wave 0 sorted by benefit score descending', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 'A', dependencies: [], benefitScore: 10 },
        { trackId: 'B', dependencies: [], benefitScore: 50 },
        { trackId: 'C', dependencies: [], benefitScore: 30 }
      ];

      const waves = ExecutionPlanner.planWaves(tracks);
      expect(waves.map(wave => wave.map(t => t.trackId))).toEqual([['B', 'C', 'A']]);
    });

    it('should partition dependent chains across sequential waves', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 'C', dependencies: ['B'], benefitScore: 10 },
        { trackId: 'B', dependencies: ['A'], benefitScore: 20 },
        { trackId: 'A', dependencies: [], benefitScore: 30 }
      ];

      const waves = ExecutionPlanner.planWaves(tracks);
      expect(waves.map(wave => wave.map(t => t.trackId))).toEqual([['A'], ['B'], ['C']]);
    });

    it('should partition diamond dependencies into sequential waves', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 'D', dependencies: ['B', 'C'], benefitScore: 10 },
        { trackId: 'B', dependencies: ['A'], benefitScore: 40 },
        { trackId: 'C', dependencies: ['A'], benefitScore: 50 },
        { trackId: 'A', dependencies: [], benefitScore: 20 }
      ];

      const waves = ExecutionPlanner.planWaves(tracks);
      expect(waves.map(wave => wave.map(t => t.trackId))).toEqual([['A'], ['C', 'B'], ['D']]);
    });

    it('should throw an error on cyclical dependencies in planWaves', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 't1', dependencies: ['t2'], benefitScore: 10 },
        { trackId: 't2', dependencies: ['t1'], benefitScore: 10 }
      ];

      expect(() => ExecutionPlanner.planWaves(tracks)).toThrow(/cyclical/i);
    });

    it('should ignore dependencies that are not in the provided tracks list in planWaves', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 't1', dependencies: ['external_track'], benefitScore: 10 },
      ];

      const waves = ExecutionPlanner.planWaves(tracks);
      expect(waves.map(wave => wave.map(t => t.trackId))).toEqual([['t1']]);
    });

    it('should return an empty array of waves when given an empty tracks list', () => {
      const waves = ExecutionPlanner.planWaves([]);
      expect(waves).toEqual([]);
    });
  });

  describe('plan (backward compatibility)', () => {
    it('should maintain backward compatibility by delegating to planWaves().flat()', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 'D', dependencies: ['B', 'C'], benefitScore: 10 },
        { trackId: 'B', dependencies: ['A'], benefitScore: 40 },
        { trackId: 'C', dependencies: ['A'], benefitScore: 50 },
        { trackId: 'A', dependencies: [], benefitScore: 20 }
      ];

      const flatResult = ExecutionPlanner.plan(tracks);
      const wavesResult = ExecutionPlanner.planWaves(tracks).flat();
      expect(flatResult).toEqual(wavesResult);
      expect(flatResult.map(t => t.trackId)).toEqual(['A', 'C', 'B', 'D']);
    });

    it('should topologically sort independent tracks by benefit score descending', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 't1', dependencies: [], benefitScore: 10 },
        { trackId: 't2', dependencies: [], benefitScore: 50 },
        { trackId: 't3', dependencies: [], benefitScore: 30 }
      ];

      const result = ExecutionPlanner.plan(tracks);
      expect(result.map(t => t.trackId)).toEqual(['t2', 't3', 't1']);
    });

    it('should topologically sort tracks with dependencies', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 't1', dependencies: ['t2'], benefitScore: 10 },
        { trackId: 't2', dependencies: [], benefitScore: 10 }
      ];

      const result = ExecutionPlanner.plan(tracks);
      expect(result.map(t => t.trackId)).toEqual(['t2', 't1']);
    });

    it('should handle complex DAG with benefit score tie-breakers', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 'C', dependencies: ['A'], benefitScore: 100 },
        { trackId: 'D', dependencies: ['B'], benefitScore: 50 },
        { trackId: 'A', dependencies: [], benefitScore: 10 },
        { trackId: 'B', dependencies: [], benefitScore: 20 },
      ];

      // Wave 0: unblocked roots A (10) and B (20) -> sorted: [B, A]
      // Wave 1: unblocked C (100) and D (50) -> sorted: [C, D]
      // Flattened result: B, A, C, D
      const result = ExecutionPlanner.plan(tracks);
      expect(result.map(t => t.trackId)).toEqual(['B', 'A', 'C', 'D']);
    });

    it('should throw an error on cyclical dependencies', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 't1', dependencies: ['t2'], benefitScore: 10 },
        { trackId: 't2', dependencies: ['t1'], benefitScore: 10 }
      ];

      expect(() => ExecutionPlanner.plan(tracks)).toThrow(/cyclical/i);
    });

    it('should ignore dependencies that are not in the provided tracks list', () => {
      const tracks: TrackPlanData[] = [
        { trackId: 't1', dependencies: ['external_track'], benefitScore: 10 },
      ];

      const result = ExecutionPlanner.plan(tracks);
      expect(result.map(t => t.trackId)).toEqual(['t1']);
    });
  });

  describe('loadTrackData', () => {
    it('should load track data correctly from yaml and metadata', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const projectRoot = path.join(__dirname, 'tmp-test-planner');
      fs.mkdirSync(path.join(projectRoot, 'superconductor', 'tracks', 't1'), { recursive: true });

      fs.writeFileSync(path.join(projectRoot, 'superconductor', 'tracks.yaml'), `
version: 1
tracks:
  - id: t1
    deps: ['t2']
`);

      fs.writeFileSync(path.join(projectRoot, 'superconductor', 'tracks', 't1', 'metadata.json'), JSON.stringify({
        benefitScore: 42
      }));

      const data = await ExecutionPlanner.loadTrackData(projectRoot, 't1');
      expect(data.trackId).toBe('t1');
      expect(data.dependencies).toEqual(['t2']);
      expect(data.benefitScore).toBe(42);

      fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('throws path traversal error when track ID contains invalid path characters like ../../etc', async () => {
      const projectRoot = '/test/repo';
      await expect(ExecutionPlanner.loadTrackData(projectRoot, '../../etc')).rejects.toThrow(
        'Invalid track ID: path traversal characters prohibited'
      );
      await expect(ExecutionPlanner.loadTrackData(projectRoot, 'track/nested')).rejects.toThrow(
        'Invalid track ID: path traversal characters prohibited'
      );
      await expect(ExecutionPlanner.loadTrackData(projectRoot, 'track..bad')).rejects.toThrow(
        'Invalid track ID: path traversal characters prohibited'
      );
    });
  });
});
