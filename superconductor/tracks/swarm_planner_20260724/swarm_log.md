# Swarm Log - track/swarm_planner_20260724

### [Phase 1] TaskComplexityScorer

**Status:** Completed
**Commit Hash:** `e76f786`
**Test Count:** 170 tests passing (5 new unit tests added for TaskComplexityScorer)

#### Overview
Implemented `TaskComplexityScorer` at `packages/superconductor-core/src/intelligence/task-complexity-scorer.ts` which evaluates task complexity based on two execution paths:
1. **Intelligence path (`repoContext` non-null):** Leverages `hotspotMap`, `testGapMap`, `sastFindings`, `fanOutMap`, and `couplingMap` from `RepoContext` to calculate surgical precision sub-scores for `contextLoad`, `reasoningDepth`, `crossCuttingRisk`, and `testSurface`.
2. **Heuristic fallback (`repoContext` is null):** Uses keyword scans and file reference counting to produce fallback estimates.

#### Public Interface
```typescript
export interface TaskComplexityScore {
  contextLoad: number;      // 0-5: how many files/contexts agent must hold
  reasoningDepth: number;   // 0-5: cyclomatic/hotspot complexity signal
  crossCuttingRisk: number; // 0-5: SAST findings + high coupling
  testSurface: number;      // 0-5: test gap risk + churn
  total: number;            // sum, 0-20
  source: 'intelligence' | 'heuristic';
}

export class TaskComplexityScorer {
  static score(taskDescription: string, repoContext: RepoContext | null): TaskComplexityScore;
}
```
