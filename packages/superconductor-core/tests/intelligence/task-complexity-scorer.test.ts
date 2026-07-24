import { describe, it, expect } from 'vitest';
import { TaskComplexityScorer } from '../../src/intelligence/task-complexity-scorer.js';
import { RepoContext } from '../../src/intelligence/snapshot-reader.js';

describe('TaskComplexityScorer', () => {
  const createMockRepoContext = (overrides?: Partial<RepoContext>): RepoContext => {
    return {
      hotspotMap: new Map(),
      testGapMap: new Map(),
      sastFindings: new Map(),
      driftState: 'LIVE',
      driftBanner: '',
      fanOutMap: new Map(),
      couplingMap: new Map(),
      ...overrides,
    };
  };

  it('should score via intelligence path with mock RepoContext and verify sub-scores', () => {
    const hotspotMap = new Map([['file1.ts', { hotspot_score: 10, cyclomatic_complexity: 12 }]]);
    const testGapMap = new Map([['file1.ts', { risk: 'HIGH' as const, gitChurnScore: 25 }]]);
    const sastFindings = new Map([
      [
        'file1.ts',
        [
          { rule_id: 'r1', severity: 'HIGH', message: 'm1' },
          { rule_id: 'r2', severity: 'HIGH', message: 'm2' },
          { rule_id: 'r3', severity: 'MEDIUM', message: 'm3' },
          { rule_id: 'r4', severity: 'LOW', message: 'm4' },
          { rule_id: 'r5', severity: 'LOW', message: 'm5' },
        ],
      ],
    ]);
    const fanOutMap = new Map([['file1.ts', 3]]);
    const couplingMap = new Map([['file1.ts', ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']]]);

    const context = createMockRepoContext({
      hotspotMap,
      testGapMap,
      sastFindings,
      fanOutMap,
      couplingMap,
    });

    const score = TaskComplexityScorer.score('Refactor file1.ts to improve efficiency', context);

    expect(score.source).toBe('intelligence');
    expect(score.contextLoad).toBe(4); // raw: fanOut (3) + coupling (6) = 9 -> scale 9-15 is 4
    expect(score.reasoningDepth).toBe(4); // complexity 12 -> scale 11-15 is 4
    expect(score.crossCuttingRisk).toBe(5); // sast 5 findings -> 3 + high coupling bonus (+2) = 5 (capped at 5)
    expect(score.testSurface).toBe(5); // risk HIGH (4) + churn floor(25/20) (1) = 5
    expect(score.total).toBe(18);
  });

  it('should score via heuristic path when repoContext is null', () => {
    const taskDesc = 'Implement algorithm complex auth sql test spec coverage file1.ts file2.ts file3.ts';
    const score = TaskComplexityScorer.score(taskDesc, null);

    expect(score.source).toBe('heuristic');
    expect(score.contextLoad).toBe(3); // 3 distinct files (file1.ts, file2.ts, file3.ts) -> scale 3-4 is 3
    expect(score.reasoningDepth).toBe(2); // 'algorithm', 'complex' -> 2 hits
    expect(score.crossCuttingRisk).toBe(4); // 'auth', 'sql' -> 2 hits * 2 = 4
    expect(score.testSurface).toBe(3); // 'test', 'spec', 'coverage' -> 3 hits
    expect(score.total).toBe(12);
  });

  it('should set source field correctly based on repoContext presence', () => {
    const context = createMockRepoContext();
    const withCtx = TaskComplexityScorer.score('Update readme.md', context);
    expect(withCtx.source).toBe('intelligence');

    const withoutCtx = TaskComplexityScorer.score('Update readme.md', null);
    expect(withoutCtx.source).toBe('heuristic');
  });

  it('should handle unmapped files in RepoContext with graceful degradation', () => {
    const context = createMockRepoContext();
    const score = TaskComplexityScorer.score('Fix unmapped.ts', context);

    expect(score.source).toBe('intelligence');
    expect(score.contextLoad).toBe(1); // raw 0 -> 1
    expect(score.reasoningDepth).toBe(1); // 0 -> 1
    expect(score.crossCuttingRisk).toBe(0); // 0 SAST, no high coupling -> 0
    expect(score.testSurface).toBe(1); // none risk -> 1
    expect(score.total).toBe(3);
  });

  it('should achieve boundary scores (total=5, total=10, total=15, total=20)', () => {
    // Total = 5 (Intelligence path)
    const context5 = createMockRepoContext({
      fanOutMap: new Map([['f1.ts', 2]]), // raw 2 -> contextLoad = 2
      hotspotMap: new Map([['f1.ts', { hotspot_score: 1, cyclomatic_complexity: 0 }]]), // complexity 0 -> depth = 1
      sastFindings: new Map([['f1.ts', [{ rule_id: 'r1', severity: 'LOW', message: 'm' }]]]), // 1 finding -> risk = 1
      testGapMap: new Map([['f1.ts', { risk: 'LOW', gitChurnScore: 0 }]]), // risk LOW -> testSurface = 1
    });
    const s5 = TaskComplexityScorer.score('f1.ts', context5);
    expect(s5.total).toBe(5);

    // Total = 10 (Heuristic path)
    // 3 files -> contextLoad = 3
    // 2 depth keywords ('complex', 'algorithm') -> depth = 2
    // 1 risk keyword ('auth') -> risk = 2
    // 3 test keywords ('test', 'spec', 'mock') -> testSurface = 3
    // 3 + 2 + 2 + 3 = 10
    const s10 = TaskComplexityScorer.score(
      'Algorithm complex auth test spec mock f1.ts f2.ts f3.ts',
      null
    );
    expect(s10.total).toBe(10);

    // Total = 15 (Heuristic path)
    // 5 files -> contextLoad = 4
    // 3 depth keywords ('complex', 'algorithm', 'cache') -> depth = 3
    // 2 risk keywords ('auth', 'sql') -> risk = 4
    // 4 test keywords ('test', 'spec', 'coverage', 'mock') -> testSurface = 4
    // 4 + 3 + 4 + 4 = 15
    const s15 = TaskComplexityScorer.score(
      'Algorithm complex cache auth sql test spec coverage mock f1.ts f2.ts f3.ts f4.ts f5.ts',
      null
    );
    expect(s15.total).toBe(15);

    // Total = 20 (Intelligence path with max values)
    const context20 = createMockRepoContext({
      fanOutMap: new Map([['f1.ts', 20]]), // raw 20 -> contextLoad = 5
      hotspotMap: new Map([['f1.ts', { hotspot_score: 100, cyclomatic_complexity: 50 }]]), // complexity 50 -> depth = 5
      sastFindings: new Map([
        [
          'f1.ts',
          Array(12).fill({ rule_id: 'r', severity: 'HIGH', message: 'm' }),
        ],
      ]), // 12 findings -> 5
      couplingMap: new Map([['f1.ts', ['a', 'b', 'c', 'd', 'e', 'f', 'g']]]), // high coupling (>5) -> capped at 5
      testGapMap: new Map([['f1.ts', { risk: 'HIGH', gitChurnScore: 40 }]]), // risk HIGH (4) + churn 2 = 6 -> capped at 5
    });
    const s20 = TaskComplexityScorer.score('f1.ts', context20);
    expect(s20.contextLoad).toBe(5);
    expect(s20.reasoningDepth).toBe(5);
    expect(s20.crossCuttingRisk).toBe(5);
    expect(s20.testSurface).toBe(5);
    expect(s20.total).toBe(20);
  });
});
