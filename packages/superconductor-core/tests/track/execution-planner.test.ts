import { describe, it, expect } from 'vitest';
import { ExecutionPlanner, TrackPlanData } from '../../src/track/execution-planner';

describe('ExecutionPlanner', () => {
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

    // Candidates initially: A and B. B has higher benefitScore (20 > 10).
    // So B is chosen first. Then D is unblocked.
    // Next candidates: A (10) and D (50). D has higher benefitScore.
    // D is chosen.
    // Next candidates: A (10). A is chosen.
    // Next candidates: C (100). C is chosen.
    // Expected order: B, D, A, C

    const result = ExecutionPlanner.plan(tracks);
    expect(result.map(t => t.trackId)).toEqual(['B', 'D', 'A', 'C']);
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
});
