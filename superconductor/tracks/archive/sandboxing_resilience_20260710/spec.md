# Specification: Sandboxing & State Resilience

## Overview

Phase 3 replaces Superconductor's mutable markdown state with an append-only event store, adds Git-based isolation for risky operations, and introduces a semantic risk classifier for safe autonomous execution. This phase enables "overnight autonomy" — the system can run unattended without accumulating state corruption.

This is **Phase 3** of a 5-phase transformation roadmap.

## Architecture

- **Language:** TypeScript (Node.js)
- **Module Location:** `packages/engine/src/state/` and `packages/engine/src/safety/` (extends engine)
- **Dependencies:** Phase 1 engine, Phase 2 routing (for escalation events)

## Functional Requirements

### FR-1: Event-Stream Memory (SQLite Event Store)
- Replace in-place markdown edits with an append-only SQLite event log
- Record every engine event: task transitions, file deltas, subagent spawns, conflicts, escalations
- Support deterministic state reconstruction ("time-travel"): replay events to rebuild any past state
- Provide query API: filter events by task ID, event type, time range
- Generate `plan.md` as a materialized view from the event log (backward compatibility)

### FR-2: Git Context Controller (GCC)
- Provide `gccBranch(taskId)` and `gccMerge(taskId)` operations
- When a task is classified as high-risk (Tier 4 or STORM conflict count > threshold), automatically check out an isolated Git worktree
- On task success: merge the worktree back into the track branch
- On task failure: drop the worktree branch cleanly, preserving the main timeline from polluted diffs
- Emit lifecycle events for worktree creation, merge, and drop

### FR-3: Semantic Risk Middleware
- Classify every subagent action into risk tiers:
  - **Auto-approve:** Read-only commands, test runners, file writes strictly within `src/` and `tests/`
  - **Log & proceed:** File writes outside `src/` but within the project directory
  - **Human approval required:** Destructive OS commands (`rm -rf`, `chmod`), CI/CD config changes, dependency modifications (`package.json`, `go.mod`)
- Integrate with the dispatcher: intercept tool calls before execution
- Support configurable risk rules via a `risk-policy.yaml` file
- Emit risk classification events for every intercepted action

## Non-Functional Requirements

- **NFR-1:** SQLite database must handle 100K+ events without degradation
- **NFR-2:** GCC worktree operations must be atomic — no partial merges
- **NFR-3:** Risk middleware must add <50ms latency to tool call interception

## Acceptance Criteria

1. All engine events are persisted to SQLite; state can be fully reconstructed from the event log
2. `plan.md` materialized view matches the event log state at any point
3. GCC correctly isolates a high-risk task in a worktree and merges on success
4. GCC drops a failed worktree without affecting the main branch
5. Risk middleware correctly classifies read-only, write, and destructive commands
6. Risk policy is configurable via YAML; custom rules override defaults
7. All unit tests pass with >80% coverage

## Out of Scope

- Firecracker/microVM sandboxing (infrastructure-level, not engine-level)
- Full YOLO mode UI/CLI flags (deferred to CLI integration track)
- Event log compaction or archival
