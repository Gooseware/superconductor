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

### [Phase 2] ModelTierRouter

**Status:** Completed
**Commit Hash:** `cb7346b`
**Test Count:** 183 tests passing (13 unit tests for ModelTierRouter)

#### Overview
Implemented `ModelTierRouter` at `packages/superconductor-core/src/intelligence/model-tier-router.ts` which routes tasks to model tiers based on Task Complexity Score (TCS) total across 4 distinct bands:
1. **0-5:** `flash-lite` (TIER-1)
2. **6-10:** `flash` (TIER-2)
3. **11-15:** `pro` (TIER-3)
4. **16-20:** `pro-thinking` (TIER-4)

Also implements `formatAnnotation` to generate tier annotation strings formatted as `[TIER-N:TCS=<total>]` for plan injection.

#### Public Interface
```typescript
export type ModelTier = 'flash-lite' | 'flash' | 'pro' | 'pro-thinking';

export interface TierAnnotation {
  tier: ModelTier;
  tcsTotal: number;
  annotation: string; // e.g. "[TIER-1:TCS=4]"
}

export class ModelTierRouter {
  static route(tcs: TaskComplexityScore): TierAnnotation;
  static formatAnnotation(tcs: TaskComplexityScore): string;
}
```

### [Review Phase 1] Advisory Review

**Verdict:** CRITICAL (Fixes required before proceeding)

#### Spec Compliance Checklist
- [x] `TaskComplexityScore` interface has all required fields (`contextLoad`, `reasoningDepth`, `crossCuttingRisk`, `testSurface`, `total`, `source`)
- [x] Intelligence path uses `hotspotMap`, `testGapMap`, `sastFindings` from `RepoContext`
- [x] Heuristic fallback works cleanly when `repoContext` is `null`
- [x] All sub-scores capped at 5, total is their sum (0–20)
- [x] `source` field (`'intelligence'` vs `'heuristic'`) correctly set
- [x] Missing file in `RepoContext` maps → graceful degradation (no throw)
- [x] Exported from `packages/superconductor-core/src/intelligence/index.ts`
- [x] Pure computation, zero `execSync` or shell calls

#### Findings

##### CRITICAL
1. **High Hotspot Signal & Boundary Scaling Discrepancy in `reasoningDepth`** (`task-complexity-scorer.ts:71-88`):
   - **Issue:** `TaskComplexityScorer.scoreWithIntelligence` extracts `cyclomatic_complexity` instead of `hotspot_score` (or max of `hotspot_score` and `cyclomatic_complexity`) as required by `spec.md` §FR-1 / `plan.md` Phase 1. Furthermore, it scales using thresholds `>=16 → 5`, `>=11 → 4`, `>=6 → 3`, `>=1 → 2` instead of the specified `>=20 → 5`, `>=15 → 4`, `>=10 → 3`, `>=5 → 2`, `else 1`.
   - **Impact:** A high-hotspot file (e.g. `hotspot_score: 25`, `cyclomatic_complexity: 4`) yields `reasoningDepth = 2` instead of `5`. This miscalculates the total TCS by up to 3 points, causing tasks that should be routed to `pro` (TIER-3) to be incorrectly routed to `flash` (TIER-2).

##### ADVISORY
1. **Missing Boundary Unit Test at total=11 (Flash → Pro Boundary)** (`task-complexity-scorer.test.ts`):
   - Unit tests cover boundary totals 5, 10, 15, and 20, but omit an explicit test for `total=11` (the exact threshold where model routing transitions from Flash to Pro).
2. **`fanOutMap` & `couplingMap` Added to Interface but Omitted in `IntelligenceSnapshotReader.load()`** (`snapshot-reader.ts` & `snapshot-reader.test.ts`):
   - `fanOutMap` and `couplingMap` were added to `RepoContext` interface, but `IntelligenceSnapshotReader.load()` in `snapshot-reader.ts` was not updated to read `02_dependencies.json` or `04_coupling.json`. Thus `repoContext.fanOutMap` and `repoContext.couplingMap` are `undefined` when reading real snapshots, causing `contextLoad` to default to 1. `snapshot-reader.test.ts` was also not updated for these maps.

#### Notes for Phase 2 Coder
1. In `task-complexity-scorer.ts`, update `reasoningDepth` computation to read `hotspot_score` (or `Math.max(hotspot_score, cyclomatic_complexity)`) and apply the spec thresholds (`≥20 → 5`, `≥15 → 4`, `≥10 → 3`, `≥5 → 2`, `else 1`).
2. In `task-complexity-scorer.test.ts`, add a unit test for `total=11`.
3. In `snapshot-reader.ts`, update `IntelligenceSnapshotReader.load()` to parse `02_dependencies.json` (into `fanOutMap`) and `04_coupling.json` (into `couplingMap`), and update `snapshot-reader.test.ts` accordingly.

### [Review Phase 2] Advisory Review

**Verdict:** PASS (No critical blockers, advisories noted)

#### Spec Compliance Checklist
- [x] `ModelTier` type has all 4 values (`flash-lite`, `flash`, `pro`, `pro-thinking`)
- [x] `route()` returns correct tier for all bands (0-5, 6-10, 11-15, 16-20)
- [x] Band boundaries are exclusive-lower/inclusive-upper (e.g. total=5 → `flash-lite`, total=6 → `flash`)
- [x] `formatAnnotation()` produces `[TIER-N:TCS=<total>]` format
- [x] Tests cover all band boundary values (0, 5, 6, 10, 11, 15, 16, 20)
- [x] Exported from `packages/superconductor-core/src/intelligence/index.ts`

#### Findings

##### CRITICAL
- None. Boundary logic is strictly exclusive-lower / inclusive-upper (`<= 5`, `<= 10`, `<= 15`, `else`). No off-by-one errors present at boundary points (0, 5, 6, 10, 11, 15, 16, 20). Out-of-range scores gracefully evaluate without runtime exception (negative scores map to `flash-lite`, >20 scores map to `pro-thinking`).

##### ADVISORY
1. **Missing Unit Tests for Out-of-Range TCS Totals (`total < 0` and `total > 20`)**:
   - `model-tier-router.test.ts` thoroughly tests boundaries 0, 5, 6, 10, 11, 15, 16, 20 as well as representative inner-band values (4, 8, 13, 18), but omits explicit test cases for `total = -1` or `total = 21`.
2. **Annotation Formatting with Out-of-Bounds Totals**:
   - While `ModelTierRouter.route()` safely handles `total < 0` and `total > 20`, the annotation output reflects the raw `total` score (e.g. `[TIER-1:TCS=-1]` or `[TIER-4:TCS=25]`). Optional bounds clamping (`Math.max(0, Math.min(20, total))`) or explicit handling can be considered if negative/overflow TCS scores should be normalized.

#### Notes for Phase 3+4+5 Coders
1. Phase 3 (Prompt Generator / Injector) can safely consume `ModelTierRouter.formatAnnotation(tcs)` or `ModelTierRouter.route(tcs)` directly.
2. Consider adding explicit test coverage for negative or >20 TCS totals when refining the suite in future passes.

### [Remediation] Phase 1 Critical Fix

**Status:** Completed
**Test Count:** 186 tests passing (3 new unit tests added)

#### Fixes Applied
1. **Fix 1 (CRITICAL):** Updated `reasoningDepth` calculation in `TaskComplexityScorer.scoreWithIntelligence` (`task-complexity-scorer.ts`) to use `Math.max(hotspot_score, cyclomatic_complexity)` and updated spec thresholds (`>=20 -> 5`, `>=15 -> 4`, `>=10 -> 3`, `>=5 -> 2`, `else 1`).
2. **Fix 2 (ADVISORY):** Added `fanOutMap` (from `02_dependency_graph.json`) and `couplingMap` (from `04_coupling.json`) parsing to `IntelligenceSnapshotReader.load()` (`snapshot-reader.ts`) and added unit tests in `snapshot-reader.test.ts`.
3. **Fix 3 (ADVISORY):** Added unit test in `task-complexity-scorer.test.ts` verifying that `total=11` marks the Flash->Pro model tier boundary.

### [Phase 5] OracleCadenceOptimiser

**Status:** Completed
**Commit Hash:** `45d6ddad6694fea64a6531f42cdbb7b84d435e6b`
**Test Count:** 192 tests passing (6 new unit tests for OracleCadenceOptimiser)

#### Overview
Implemented `OracleCadenceOptimiser` at `packages/superconductor-core/src/intelligence/oracle-cadence-optimiser.ts` which computes the optimal firing cadence for oracle checks during swarm plan execution. The algorithm:
1. **Base Cadence:** Oracle fires every ~25% of tasks (`Math.ceil(taskCount / 4)`).
2. **TCS Complexity Modifier:** Higher average task complexity increases firing frequency by subtracting `Math.floor(avgTCS / 5)`, clamped to a minimum of 1.
3. **Retry Rate Modifier:** If `historicalRetryRate > 0.3`, cadence is decreased by 1 (clamped to a minimum of 1).
4. **Safety Bounds:** Cadence is guaranteed to be at least 1 (even when `taskCount = 0`).

#### Public Interface
```typescript
export class OracleCadenceOptimiser {
  static compute(
    taskCount: number,
    avgTCS: number,
    historicalRetryRate?: number
  ): number;
}
```



