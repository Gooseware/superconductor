# Implementation Plan: Swarm-Aware Planner — Throughput & Token Economics Optimizer

## Phase 0: Swarm Preflight
- [x] Task: Verify `swarm-orchestrate` skill is installed and loaded. [TIER-2] [AGENT:caduceus-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1a: Intelligence Snapshot Reader
- [x] Task: Implement `IntelligenceSnapshotReader` in `packages/superconductor-core/src/intelligence/snapshot-reader.ts`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Define `RepoContext` interface: `{ hotspotMap, fanOutMap, sastFindings, testGapMap, couplingMap, snapshotAge, source: 'intelligence' | 'heuristic' }`
    - [x] Implement `load(outputDir: string): RepoContext | null` — reads `00_manifest.json`, checks freshness (< 7 days), then lazy-loads the 5 intelligence JSON files into typed Maps
    - [x] Implement `formatSourceBanner(ctx: RepoContext): string` — returns the user-facing `"ℹ️ Intelligence snapshot found..."` or `"⚠️ No intelligence snapshot..."` string
    - [x] Gracefully degrade: if any individual file is missing or malformed, exclude that signal and log a warning — never throw
    - [x] Export from `src/intelligence/index.ts`
- [x] Task: Write unit tests for `IntelligenceSnapshotReader` in `packages/superconductor-core/tests/intelligence/snapshot-reader.test.ts`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Test: valid snapshot dir → `source: 'intelligence'`, all maps populated
    - [x] Test: snapshot > 7 days old → returns `null`
    - [x] Test: missing `03_complexity.json` → `hotspotMap` empty, other maps intact
    - [x] Test: malformed JSON in one file → degrades gracefully, no throw
    - [x] Test: entirely missing output dir → returns `null`
- [x] Task: Superconductor - User Manual Verification 'Phase 1a: Intelligence Snapshot Reader' (Protocol in workflow.md)

## Phase 1: Task Complexity Scorer (Intelligence-Aware)
- [x] Task: Implement `TaskComplexityScorer` in `packages/superconductor-core/src/intelligence/task-complexity-scorer.ts`. [TIER-3:TCS=8] [AGENT:caduceus-processor]
    - [x] Define `TaskComplexityScore` interface: `{ contextLoad, reasoningDepth, crossCuttingRisk, testSurface, total, source: 'intelligence' | 'heuristic' }`
    - [x] Implement `score(taskDescription: string, repoContext: RepoContext | null): TaskComplexityScore`:
        - **With RepoContext (surgical precision):**
            - `contextLoad`: extract file references from task text, sum `fanOutMap[file]` + `couplingMap[file].length`, normalise to 0–5
            - `reasoningDepth`: max `hotspotMap[file]` across mentioned files, scale: ≥20→5, ≥15→4, ≥10→3, ≥5→2, else 1
            - `crossCuttingRisk`: count `sastFindings[file].length` for mentioned files; apply +2 if any coupling degree > 5
            - `testSurface`: map `testGapMap[file].riskLevel` to score (HIGH→4, MEDIUM→2, LOW→1) + churn normalisation
        - **Without RepoContext (heuristic fallback):** keyword-based scoring as originally planned
    - [x] Export from `src/intelligence/index.ts`
- [x] Task: Write unit tests for `TaskComplexityScorer`. [TIER-3:TCS=6] [AGENT:caduceus-processor]
    - [x] Test intelligence-path scoring with a mock `RepoContext` containing known hotspot/fanOut/sast/testGap values
    - [x] Test heuristic-path scoring (null RepoContext) with keyword strings
    - [x] Boundary value tests: TCS=0, 5, 6, 10, 11, 15, 16, 20 for both paths
    - [x] Test that `source` field correctly reflects which path was taken
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Task Complexity Scorer' (Protocol in workflow.md)

## Phase 2: Model Tier Router
- [x] Task: Implement `ModelTierRouter` in `packages/superconductor-core/src/intelligence/model-tier-router.ts`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Define `ModelTier` type: `'flash-lite' | 'flash' | 'pro' | 'pro-thinking'`
    - [x] Implement `route(tcs: TaskComplexityScore): ModelTier` mapping:
        - total 0–5 → `flash-lite`
        - total 6–10 → `flash`
        - total 11–15 → `pro`
        - total 16–20 → `pro-thinking`
    - [x] Implement `formatAnnotation(tcs: TaskComplexityScore): string` → produces `[TIER-N:TCS=<total>]` string for plan injection
    - [x] Export from `src/intelligence/index.ts`
- [x] Task: Write unit tests for `ModelTierRouter` covering all band boundaries and annotation format. [TIER-3] [AGENT:caduceus-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Model Tier Router' (Protocol in workflow.md)

## Phase 3: Parallelism Optimiser & Wave Scheduler
- [x] Task: Implement `ParallelismOptimiser` in `packages/superconductor-core/src/intelligence/parallelism-optimiser.ts`. [TIER-4] [AGENT:caduceus-oracle]
    - [x] Define `SwarmWave`: `{ waveIndex, tasks: PlanTask[], models: ModelTier[], estimatedTokens: number, estimatedMinutes: number }`
    - [x] Define `SwarmWaveSchedule`: `{ waves: SwarmWave[], totalTasks, totalEstimatedTokens, maxConcurrent }`
    - [x] Implement DAG analysis: parse plan tasks for dependency markers (e.g. "requires", "after", sequential numbering) to build adjacency graph
    - [x] Implement wave packing: assign tasks to waves respecting dependency ordering and `maxConcurrent` ceiling (default: 6)
    - [x] Implement duration estimation: `flash-lite=1min/task, flash=2min/task, pro=5min/task, pro-thinking=10min/task`
    - [x] Export from `src/intelligence/index.ts`
- [x] Task: Write unit tests for `ParallelismOptimiser`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Test flat DAG (all parallel) → single wave or maxConcurrent-bounded waves
    - [x] Test linear chain → one task per wave
    - [x] Test mixed graph with 2 dependency chains
    - [x] Test maxConcurrent cap enforcement
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Parallelism Optimiser' (Protocol in workflow.md)

## Phase 4: Token Budget Estimator
- [x] Task: Implement `TokenBudgetEstimator` in `packages/superconductor-core/src/telemetry/token-budget-estimator.ts`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Define `TokenBudgetEstimate`: `{ contextTokens, reasoningTokens, outputTokens, reviewTokens, totalEstimate }`
    - [x] Implement `estimate(task: PlanTask, tier: ModelTier): TokenBudgetEstimate` using heuristics:
        - contextTokens: `contextLoad * 8000` (avg 8K tokens per referenced file)
        - reasoningTokens: `flash-lite=500, flash=1500, pro=4000, pro-thinking=8000`
        - outputTokens: `testSurface * 200 + reasoningDepth * 500`
        - reviewTokens: `outputTokens * 0.3` (reviewer reads the diff, not full context)
    - [x] Implement `estimateTrack(waves: SwarmWaveSchedule): TrackTokenBudget` with human-readable summary
    - [x] Implement `formatCostEstimate(budget: TrackTokenBudget): string` → `"~4.2M tokens · ~$0.84 at Flash rates"`
        - Flash-lite rate: $0.075/1M tokens; Flash: $0.15/1M; Pro: $3.50/1M; Pro-thinking: $10/1M
    - [x] Export from `src/telemetry/index.ts`
- [x] Task: Write unit tests for `TokenBudgetEstimator`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Test each tier's token estimate formula
    - [x] Test cost formatting output for known inputs
    - [x] Boundary test: empty plan (0 tasks) → $0.00
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Token Budget Estimator' (Protocol in workflow.md)

## Phase 5: Oracle Cadence Optimiser
- [x] Task: Implement `OracleCadenceOptimiser` in `packages/superconductor-core/src/intelligence/oracle-cadence-optimiser.ts`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Implement `compute(taskCount: number, avgTCS: number, historicalRetryRate?: number): number` returning oracle cadence:
        - Base cadence: `Math.ceil(taskCount / 4)` (roughly every 25% of tasks)
        - Apply TCS modifier: `cadence = Math.max(1, cadence - Math.floor(avgTCS / 5))` (higher complexity = more frequent)
        - Apply retry rate modifier: if `historicalRetryRate > 0.3` → cadence = `Math.max(1, cadence - 1)` (more retries = more Oracle)
    - [x] Export from `src/intelligence/index.ts`
- [x] Task: Write unit tests for `OracleCadenceOptimiser`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Test: 10 tasks, avgTCS=5 → expected cadence
    - [x] Test: 4 tasks, avgTCS=15 (high complexity) → cadence ≤ 2
    - [x] Test: high retry rate modifier reduces cadence
    - [x] Test: cadence never returns < 1
- [x] Task: Superconductor - User Manual Verification 'Phase 5: Oracle Cadence Optimiser' (Protocol in workflow.md)

## Phase 6: Swarm Blueprint Generator
- [x] Task: Implement `SwarmBlueprintGenerator` in `packages/superconductor-core/src/intelligence/swarm-blueprint-generator.ts`. [TIER-4] [AGENT:caduceus-oracle]
    - [x] Orchestrate: TaskComplexityScorer → ModelTierRouter → ParallelismOptimiser → TokenBudgetEstimator → OracleCadenceOptimiser
    - [x] Implement `generate(planMarkdown: string): SwarmBlueprint` parsing plan tasks and producing the full blueprint
    - [x] Implement `formatBlueprintSection(blueprint: SwarmBlueprint): string` producing the `## Swarm Blueprint` markdown table block for injection into `plan.md`
    - [x] Implement `annotatePlan(planMarkdown: string): string` — returns plan with `[TIER-N:TCS=<score>]` annotations replacing static `[TIER-N]` on each task line
    - [x] Export from `src/intelligence/index.ts`
- [x] Task: Write integration tests for `SwarmBlueprintGenerator` using realistic plan inputs from existing tracks. [TIER-3] [AGENT:caduceus-processor]
    - [x] Test with `token_estimation_20260723/plan.md` as input — verify blueprint is produced
    - [x] Test annotation replacement preserves all plan content except the TIER annotation
    - [x] Test with single-task plan (edge case)
- [x] Task: Superconductor - User Manual Verification 'Phase 6: Swarm Blueprint Generator' (Protocol in workflow.md)

## Phase 7: Skill Integration
- [x] Task: Update `skills/new-track/SKILL.md` §2.3 to invoke `SwarmBlueprintGenerator.generate()` after plan generation and inject `## Swarm Blueprint` before user confirmation. [TIER-4] [AGENT:caduceus-oracle]
    - [x] Surface the token budget estimate in the plan confirmation message: `"Estimated track cost: ~X.XM tokens (~$X.XX)"`
    - [x] Replace static `[TIER-N]` annotation step with dynamic annotation via `SwarmBlueprintGenerator.annotatePlan()`
- [x] Task: Update `skills/swarm-orchestrate/SKILL.md` §1.1 SWARM ROLES and §2.0 MODE AUTO-DETECTION to read `## Swarm Blueprint` from `plan.md` at execution time. [TIER-4] [AGENT:caduceus-oracle]
    - [x] If blueprint is present: use wave schedule for dispatch (override static TIER annotations)
    - [x] If blueprint is absent: fall back to existing static `[TIER-N]` routing (backward compatibility)
    - [x] Use adaptive `oracleCadence` from blueprint instead of hardcoded default of 3
- [x] Task: Superconductor - User Manual Verification 'Phase 7: Skill Integration' (Protocol in workflow.md)

## Phase X: Integration & Finalization
- [x] Task: Integrate track 'swarm_planner_20260724' into main branch. [TIER-2] [AGENT:caduceus-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase X: Integration & Finalization' (Protocol in workflow.md)

---

## Swarm Blueprint

**Mode:** pipeline (phases are sequential, tasks within each phase are parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 3 phases · phases 1,2,3,4 are Flash; 6,7 are Pro)
**Estimated Track Token Budget:** ~11.2M tokens (~$1.68 blended rate)

### Wave Schedule

| Wave | Phase | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|---|
| 1 | Phase 1 | Scorer impl + tests | Flash, Flash | 620K | ~4 min |
| 2 | Phase 2 | Router impl + tests | Flash, Flash | 480K | ~3 min |
| 3 | Phase 3 | Optimiser impl + tests | Pro, Flash | 1.4M | ~9 min |
| 4 | Phase 4 | Budget estimator + tests | Flash, Flash | 720K | ~4 min |
| 5 | Phase 5 | Cadence optimiser + tests | Flash, Flash | 560K | ~3 min |
| 6 | Phase 6 | Blueprint generator + tests | Pro, Flash | 2.1M | ~12 min |
| 7 | Phase 7 | Skill integration (2 skills) | Pro, Pro | 5.3M | ~18 min |
