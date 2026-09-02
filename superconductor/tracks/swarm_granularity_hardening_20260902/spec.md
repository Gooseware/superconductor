# Track Specification: Swarm Granularity Hardening

**Track ID:** `swarm_granularity_hardening_20260902`
**Status:** `[ ]` Planned
**Source:** Audit of conversation `ac3262f1-7408-4192-b8ce-b35b163dc853`
**Author:** Root Orchestrator (Audit-Triggered)
**Date:** 2026-09-02

---

## Problem Statement

An audit of the `/superconductor:implement` pipeline revealed four concrete gaps that allow the swarm to silently under-parallelize work, causing implementation phases to be collapsed into fewer, larger subagents than the plan's `maxConcurrent` ceiling permits — degrading wall-clock throughput without any warning or protocol violation being flagged.

### Observed Failure Modes (from audit ac3262f1)

| # | Gap | Observed Effect | Transcript Evidence |
|---|-----|-----------------|---------------------|
| G1 | No `parseAndDispatch` call enforcement | Agent manually parsed `plan.md` in-context, producing coarser WorkUnit groupings | step_index 93: manual in-thinking grouping |
| G2 | TIER-1 tasks bundled into Wave-0 subagents | Expensive LLM inference spent on deterministic shell tasks | Phases 0+1 collapsed into one processor in both tracks |
| G3 | No minimum-concurrency gate | 4 agents dispatched for 9 WorkUnits; waves 0+1 and 2+3 each collapsed into single agents | Lines 330 & 336 (Track 2) |
| G4 | Root agent wrote `plan.md` during grill/plan-verification | Hero-agent violation on track documentation | step_index 85: root `write_to_file` on `plan.md` |

### What Should Have Happened

- **G1:** `parseAndDispatch()` is the ONLY permitted method to derive WorkUnits.
- **G2:** All `[TIER-1]` tasks extracted and run inline via `run_command` before any subagent spawn.
- **G3:** Each batch contains exactly `min(pending_workUnits, maxConcurrent)` agents.
- **G4:** `plan.md` updates during plan-verification delegated to `superconductor-dreamer`, never the root agent.

---

## Acceptance Criteria

### AC-1: `parseAndDispatch` Enforcement in `swarm-execute`
- `swarm-execute/SKILL.md §Step 1` adds: _"Before ANY `invoke_subagent` call, verify WorkUnit[] was produced by `parseAndDispatch()` NOT by manual in-context parsing. Log count to `swarm_log.md`."_
- Step 1 includes a structural example: each `- [ ] Task:` line (with `[AGENT:]`, `[DOMAIN:]`, `[TIER-N]` annotations) maps 1:1 to one WorkUnit.

### AC-2: TIER-1 Pre-Filter in `swarm-execute`
- New **Step 2a** inserted between Step 1 and Step 2:
  ```
  Step 2a — TIER-1 Pre-Filter (MANDATORY)
  Extract all WorkUnits where tier === 1.
  Execute each via run_command in-context (no subagent).
  Remove completed TIER-1 WorkUnits from WorkUnit[] before Step 3 batching.
  PROHIBITED: Passing TIER-1 WorkUnits into the subagent dispatch pipeline.
  ```
- `implement/SKILL.md §3.e.iii` updated to cross-reference this pre-filter.

### AC-3: Minimum Concurrency Gate in `swarm-execute`
- `swarm-execute/SKILL.md §Step 3` adds, before each batch dispatch:
  ```
  MINIMUM CONCURRENCY GATE:
  required = min(pending_workUnits.length, maxConcurrent)
  if (batch.length < required) → HALT + log violation. MUST NOT proceed.
  ```
- Worked example: 9-WorkUnit plan, maxConcurrent:4 → batches of [4, 4, 1], never [2, 2, 3].

### AC-4: Plan Verification Must Use Dreamer Subagent
- `implement/SKILL.md §3.1` amended:
  - Remove: _"If approved, update `plan.md`."_
  - Add: _"If plan updates are needed, dispatch a `superconductor-dreamer` subagent with the grill findings. Root agent MUST NOT write `plan.md` directly — this is Hero-Agenting on track documentation."_
- Root Orchestration Dogma block updated: _"Track documentation files (`plan.md`, `spec.md`) MUST NOT be written by the root orchestrator during plan verification. Delegate to `superconductor-dreamer`."_

### AC-5: Regression Tests
- New file: `packages/superconductor-core/src/orchestration/__tests__/swarm-granularity.test.ts`
  - `parseAndDispatch()` never merges two independent TIER-2 tasks from different domains.
  - TIER-1 WorkUnits absent from subagent dispatch output.
  - Batch sizes always `min(pending, maxConcurrent)`.
- All existing swarm-execute tests pass (no regressions).

---

## Out of Scope
- Changing `maxConcurrent` ceiling (plan-level config).
- Quorum reviewer dispatch (already correctly parallel).
- Remediation dispatch (already correct via `DomainSplitRemediationDispatcher`).
- Grill skill content itself.

## Files Modified

| File | Change Type | AC |
|------|-------------|----|
| `skills/swarm-execute/SKILL.md` | Amendment | AC-1, AC-2, AC-3 |
| `skills/implement/SKILL.md` | Amendment | AC-2 (cross-ref), AC-4 |
| `packages/superconductor-core/src/orchestration/__tests__/swarm-granularity.test.ts` | New | AC-5 |

## Risk Assessment
**Low risk.** All changes are skill instruction text + one new test file. No hot-path runtime code modified. Minimum-concurrency gate is a soft HALT+log — no impact on existing passing swarms.

## Dependencies
None. Self-contained, no blocking edges.
