# Spec: Swarm Execution Engine — Parallel Implementor Swarm + Single-Run Preflight

**Track ID:** `swarm_implementation_20260901`
**Type:** Engine Enhancement
**Status:** Planned

---

## Overview

The Superconductor swarm execution pipeline has three sequential phases — Implementation, Quorum Review, and Remediation — but only the Remediation phase currently runs in a proper parallel swarm. The Implementation phase dispatches `superconductor-processor` agents one-by-one via a sequential loop, and the Preflight test runner is scoped per-WorkUnit so it fires once per task rather than once per track.

This track fixes both problems and ensures the `swarm-execute` SKILL.md protocol reflects the corrected execution model.

---

## Problem Statement

### Problem 1 — Sequential Implementor Loop

`SwarmOrchestratorCLI.executeTrack()` (in `packages/engine/src/cli/orchestrate.ts`) iterates over the `WorkUnit[]` array produced by `parseAndDispatch()` in a sequential `for` loop. While each iteration pushes a `dispatchPromise` into `allDispatches[]`, the actual agent spawning via `IAgentSpawner.spawn()` happens inside the loop body before the promise is constructed — meaning agents are spawned one-at-a-time rather than as a batch. The `ParallelDispatcher` (which has a `maxConcurrent: 5` concurrency cap) is entirely bypassed when a real spawner is present, reducing the swarm to a serial queue.

**Impact:** A track with 8 tasks spawns 8 agents serially. Wall-clock time = sum of all agent durations rather than max.

### Problem 2 — Per-WorkUnit Preflight (4× CPU spike)

`QuorumReviewLoop` is constructed inside the `dispatchPromise` closure for each WorkUnit (line 258 in `orchestrate.ts`). The `preflightFn` is passed as a closure to each loop instance. This means for a track with 4 WorkUnits and 4 quorum reviewers, `PreflightTestRunner.run()` is called **4 times simultaneously** during quorum — saturating CI resources.

**Impact:** 4 parallel `npm test` invocations on the same repo, each consuming full CPU, causing timeouts and flaky results.

### Problem 3 — Skill Protocol Gap

`swarm-execute/SKILL.md` correctly states the preflight-once intent (§Quorum Preflight Test Execution) and the domain-split remediation protocol, but has no protocol for the **Implementation Swarm** phase — how to batch tasks into parallel segments before dispatching processors. Agents reading the skill fall through to sequential execution.

---

## Acceptance Criteria

### AC-1: Global Preflight Runs Exactly Once per Track

- `executeTrack()` calls `PreflightTestRunner.run()` **once** before the WorkUnit loop begins.
- The resulting `TestReport` is stored on the `SwarmOrchestratorCLI` instance (or passed as a parameter) and injected into every `QuorumReviewLoop` instance via `preflightReport` instead of `preflightFn`.
- If `--no-preflight` is set, no runner is invoked at all.
- `QuorumReviewLoop` accepts an optional `preflightReport?: TestReport` in its options (alongside the existing `preflightFn`) and skips the internal `preflightFn` call when `preflightReport` is already provided.
- **Verification:** A test with a spy on `PreflightTestRunner.prototype.run` confirms it is called exactly once regardless of WorkUnit count.

### AC-2: Implementor Agents Spawn in Parallel Batches

- `executeTrack()` collects all implementor spawn calls into `Promise.all()` batches capped by `ParallelDispatcher.maxConcurrent` (default 5).
- The sequential `for` loop is replaced with a batched parallel dispatch: spawn up to N agents simultaneously, `await Promise.all()`, then proceed to quorum.
- Each spawned agent still gets its own isolated `WorkUnit` and `QuorumReviewLoop`.
- If a spawner is not provided, the existing `ParallelDispatcher` path is used unchanged.
- **Verification:** A test spawning 8 WorkUnits confirms all 8 spawn calls are issued before any completes (using mock spawner with latency).

### AC-3: `swarm-execute/SKILL.md` Implementation Swarm Protocol

- The skill file gains a new top-level section: `## Implementation Swarm Dispatch Protocol`.
- The protocol specifies:
  1. Parse `plan.md` via `parseAndDispatch()` → `WorkUnit[]`
  2. Run global preflight once → cache `TestReport`
  3. Batch WorkUnits into segments of ≤ `maxConcurrent` (default 5)
  4. For each batch: `invoke_subagent` N `superconductor-processor` agents in parallel
  5. Await all agents in the batch before proceeding to the next batch
  6. After all implementor agents complete → run Quorum Swarm with shared `TestReport` injected
- The existing `§Quorum Preflight Test Execution` section is updated to reference the pre-cached `TestReport` rather than describing a per-reviewer run.

### AC-4: `QuorumReviewLoop` Accepts Pre-Run `TestReport`

- `QuorumReviewLoopOptions` gains `preflightReport?: TestReport`.
- When `preflightReport` is set and `passed === false`, the loop returns `NEEDS_FIXES` immediately (same behavior as existing failed `preflightFn`).
- When `preflightReport` is set and `passed === true`, the `<test_report>` XML block is injected into reviewer context exactly as it is today.
- Existing `preflightFn` still works for backward compatibility (used when orchestrate.ts is not providing a pre-run report).
- **Verification:** Unit tests cover all four combinations: `{preflightFn, preflightReport} × {passed, failed}`.

### AC-5: No Regression on Existing Quorum Tests

- All existing `orchestrate.test.ts` and `quorum-review-loop.test.ts` tests continue to pass.
- Coverage for modified files stays ≥ 80%.

---

## Out of Scope

- Changes to the Remediation phase (already correctly implemented as domain-split parallel).
- Changes to the Oracle gate or Track Lifecycle Manager.
- Changes to the `implement/SKILL.md` (that skill delegates to `swarm-execute`).
- Multi-track parallel execution (batch headless mode — separate concern).
