# Specification: Swarm-Aware Planner — Throughput & Token Economics Optimizer

## Overview

When the Superconductor planner generates a `plan.md`, it currently assigns static `[TIER-N]` hints and makes no attempt to reason about the actual cost-throughput tradeoff of the resulting swarm. Every task is treated as equally expensive and equally parallelisable.

This track introduces a **Swarm-Aware Planner** — an intelligent planning layer that analyses a proposed plan's tasks and produces a validated **Swarm Blueprint**: a per-task routing decision that maximises wall-clock throughput while respecting a configurable token budget.

The core insight is:

> *A small Flash model working on a well-scoped, isolated task doesn't need deep reasoning — the cost is dominated by the context window load, not the reasoning depth. A Pro model is justified only when the task requires architectural synthesis across multiple files or a judgment call that benefits from extended thinking.*

---

## Research Notes (Auto-Synthesised)

- **Model tier economics:** Flash-class models are ~10–20× cheaper per token than Pro-class. For tasks with large context but mechanical transformation (e.g. "write unit tests for this function"), Flash outperforms Pro on cost with comparable output quality.
- **Parallelism ceiling:** Beyond ~6 concurrent agents on the same repo, write conflicts and test lock contention cause retries that erase throughput gains.
- **Context load ≠ reasoning load:** A task that requires reading 20 files but making a trivial mechanical change has high context load but low reasoning load — Flash is ideal. A task with 2 files but complex cross-cutting security implications needs Pro.
- **Token waste patterns:** The largest token waste in current swarm runs comes from: (1) Pro models assigned to boilerplate/test writing, (2) reviewers receiving full repo context instead of minimal diff context, (3) Oracle firing every 3 tasks even when retry rate is 0%.

---

## Functional Requirements

### FR-0: Intelligence Layer Reader
Before scoring any task, the planner must check for a pre-computed intelligence snapshot at `<outputDir>/intelligence/`. If present (i.e. `00_manifest.json` exists and is < 7 days old), load the following outputs into memory as the **RepoContext**:

| Intelligence File | Loaded As | Used For |
|---|---|---|
| `03_complexity.json` | `hotspotMap: Map<file, hotspot_score>` | reasoningDepth |
| `02_dependencies.json` | `fanOutMap: Map<file, number>` | contextLoad |
| `05_sast.json` | `sastFindings: Map<file, finding[]>` | crossCuttingRisk |
| `07_test_gaps.json` | `testGapMap: Map<file, { riskLevel, gitChurnScore }>` | testSurface |
| `04_coupling.json` | `couplingMap: Map<file, coupledFiles[]>` | contextLoad modifier |

If no snapshot is found, fall back to keyword heuristics. Always surface to the user:
> `"ℹ️ Intelligence snapshot found (age: Xh). Using real repo data for swarm scoring."`  
> or `"⚠️ No intelligence snapshot found. Scoring with keyword heuristics. Run \`/superconductor:setup\` for surgical precision."`

### FR-1: Task Complexity Scorer (Intelligence-Aware)
Produce a `TaskComplexityScore` (TCS) for each plan task, composed of:
- **Context Load** (0–5): When RepoContext is available — sum of `fanOutMap[file]` for files mentioned in the task description, normalised to 0–5. Fallback: count file/module references in task text.
- **Reasoning Depth** (0–5): When RepoContext is available — max `hotspot_score` across files touched by the task, scaled to 0–5 (hotspot ≥ 20 → 5, ≥ 15 → 4, ≥ 10 → 3, ≥ 5 → 2, else 1). Fallback: architectural/design keyword detection.
- **Cross-cutting Risk** (0–5): When RepoContext is available — count of SAST findings + coupling degree for task files, normalised. Fallback: API/auth/security keyword detection.
- **Test Surface** (0–5): When RepoContext is available — `gitChurnScore` and `riskLevel` from `testGapMap` for task files. Fallback: test requirement keyword detection.

### FR-2: Model Tier Router
Map `TaskComplexityScore` to a model tier recommendation:
- **TCS 0–5 → Flash Lite** (simple unit tests, doc updates, config changes)
- **TCS 6–10 → Flash** (standard feature impl, isolated components)
- **TCS 11–15 → Pro** (architectural changes, security-sensitive, cross-cutting refactors)
- **TCS 16–20 → Pro + extended thinking** (Oracle-class judgment: system-wide design decisions)

Replace the current static `[TIER-N]` annotations with dynamically computed `[TIER-N:TCS=<score>]` annotations.

### FR-3: Parallelism Optimiser
Analyse the task dependency DAG and produce an optimal **wave schedule** — groups of tasks that can execute concurrently within a configurable parallelism ceiling (default: `maxConcurrent: 6`).

Output: a `SwarmWaveSchedule` with each wave listing its tasks, estimated token cost, and estimated wall-clock duration.

### FR-4: Token Budget Estimator
For each task, produce a `TokenBudgetEstimate`:
- `contextTokens`: estimated input tokens (file sizes × task reads)
- `reasoningTokens`: model-tier-specific reasoning overhead estimate  
- `outputTokens`: estimated code/text output size
- `reviewTokens`: cost of the paired reviewer pass
- `totalEstimate`: sum

Produce a `TrackTokenBudget` — the sum across all waves — and surface it to the user during plan confirmation with a human-readable cost estimate (e.g. `~4.2M tokens · ~$0.84 at Flash rates`).

### FR-5: Oracle Cadence Optimiser
Currently Oracle fires every 3 tasks regardless of retry rate. The new planner should compute an adaptive `oracleCadence` based on:
- Track total task count (fewer tasks → more frequent Oracle)
- Average task TCS (higher complexity → lower cadence, more frequent checks)
- Historical retry rate from `swarm_log.md` of similar tracks (if available)

### FR-6: Swarm Blueprint Output
Embed a `## Swarm Blueprint` section at the end of every generated `plan.md`:

```markdown
## Swarm Blueprint
**Mode:** parallel | pipeline  
**Max Concurrent Agents:** 6  
**Oracle Cadence:** adaptive (every N tasks)  
**Estimated Track Token Budget:** ~X.XM tokens (~$X.XX)

### Wave Schedule
| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | T1, T2, T3 | Flash, Flash, Flash-Lite | 420K | ~3 min |
| 2 | T4, T5 | Pro, Flash | 890K | ~8 min |
```

### FR-7: Planner Skill Integration
Update `skills/new-track/SKILL.md` §2.3 to:
1. Invoke `IntelligenceSnapshotReader.load(outputDir)` to check for and load repo intelligence data before plan generation begins.
2. Invoke `SwarmBlueprintGenerator.generate()` after plan generation, passing the loaded `RepoContext` (or `null` for heuristic fallback).
3. Surface the intelligence source in the plan confirmation message: `"Swarm Blueprint generated using [real repo intelligence | keyword heuristics]"`.

### FR-8: `swarm-orchestrate` Runtime Consumption
Update `skills/swarm-orchestrate/SKILL.md` to read the embedded `## Swarm Blueprint` from `plan.md` at execution time — using the wave schedule and model tiers instead of static `[TIER-N]` annotations to dispatch subagents.

---

## Non-Functional Requirements

- **NFR-1:** Token budget estimation must complete in < 2 seconds (synchronous, heuristic-based — not an LLM call)
- **NFR-2:** The Swarm Blueprint must be human-readable and embeddable in `plan.md` without breaking existing tooling
- **NFR-3:** All scoring functions must be unit-tested with deterministic inputs
- **NFR-4:** Backward compatibility: plans without a `## Swarm Blueprint` section must continue to work with the existing static tier routing

---

## Acceptance Criteria

- [ ] AC-1: `TaskComplexityScorer.score(task)` returns a TCS with all 4 sub-components for a given task description
- [ ] AC-2: `ModelTierRouter.route(tcs)` returns the correct tier string for each TCS band boundary (0, 5, 6, 10, 11, 15, 16, 20)
- [ ] AC-3: `ParallelismOptimiser.optimise(tasks, maxConcurrent)` returns a valid wave schedule where no wave exceeds `maxConcurrent` and all task dependencies are respected
- [ ] AC-4: `TokenBudgetEstimator.estimate(task, tier)` returns a `TokenBudgetEstimate` with all 4 fields populated
- [ ] AC-5: `OracleCadenceOptimiser.compute(taskCount, avgTCS)` returns a cadence value that decreases as avgTCS increases
- [ ] AC-6: Generated `plan.md` for any new track includes a `## Swarm Blueprint` section with wave schedule and token estimate
- [ ] AC-7: `swarm-orchestrate` reads the Swarm Blueprint and dispatches subagents at the correct model tier per wave
- [ ] AC-8: All scoring + routing functions have 100% unit test coverage with boundary-value tests

---

## Out of Scope

- Live token counting via LLM API calls during planning (heuristic estimation only)
- Automatic budget enforcement / hard-stop on over-budget tracks (advisory only in v1)
- GPU/inference latency modelling
