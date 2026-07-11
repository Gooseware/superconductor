# Implementation Plan: Sandboxing & State Resilience

## Phase 1: State & Safety Module Scaffolding [checkpoint: ac7249d]

- [x] Task: Create `packages/engine/src/state/` and `packages/engine/src/safety/` directory structures and type definitions [TIER-3] [3c0c324]
    - [ ] `event-store.types.ts`: `EngineEventRecord`, `EventQuery`, `EventStoreConfig`
    - [ ] `gcc.types.ts`: `WorktreeInfo`, `GccOperation`, `GccEvent`
    - [ ] `risk.types.ts`: `RiskTier` (auto-approve|log-proceed|human-required), `RiskRule`, `RiskPolicy`, `RiskClassification`
    - [ ] Add new event types to the engine's `EngineEvent` union
- [x] Task: Superconductor - User Manual Verification 'Phase 1: State & Safety Module Scaffolding' (Protocol in workflow.md) [ac7249d]

## Phase 2: SQLite Event Store (FR-1)

- [x] Task: Write failing tests for SQLite event store [TIER-3] [5446c76]
    - [ ] Test: Append event to store and retrieve by ID
    - [ ] Test: Query events by task ID, event type, and time range
    - [ ] Test: Reconstruct full engine state from event replay
    - [ ] Test: Generate `plan.md` materialized view matching current state
    - [ ] Test: Handle 10K+ events without query degradation
- [~] Task: Implement SQLite event store in `src/state/event-store.ts` [TIER-4]
    - [ ] Initialize SQLite database with schema (events table, indexes)
    - [ ] Implement `append(event)`: serialize and persist engine events
    - [ ] Implement `query(filter)`: filter by task, type, time range
    - [ ] Implement `reconstruct(toTimestamp?)`: replay events to rebuild state
    - [ ] Implement `materializePlan()`: generate `plan.md` from current state
    - [ ] Use `better-sqlite3` for synchronous, embedded SQLite access
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: SQLite Event Store' (Protocol in workflow.md)

## Phase 3: Git Context Controller (FR-2)

- [ ] Task: Write failing tests for Git Context Controller [TIER-3]
    - [ ] Test: `gccBranch(taskId)` creates an isolated worktree
    - [ ] Test: `gccMerge(taskId)` merges worktree back to track branch on success
    - [ ] Test: `gccDrop(taskId)` cleanly removes worktree and branch on failure
    - [ ] Test: High-risk tasks (Tier 4) automatically trigger worktree isolation
    - [ ] Test: Worktree lifecycle events are emitted
- [ ] Task: Implement Git Context Controller in `src/safety/gcc.ts` [TIER-4]
    - [ ] Implement `gccBranch(taskId)`: create worktree via `git worktree add`
    - [ ] Implement `gccMerge(taskId)`: merge and clean up via `git merge` + `git worktree remove`
    - [ ] Implement `gccDrop(taskId)`: force remove worktree and delete branch
    - [ ] Add risk-based auto-trigger: integrate with dispatcher to check task tier/conflict history
    - [ ] Emit GCC lifecycle events to the event store
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Git Context Controller' (Protocol in workflow.md)

## Phase 4: Semantic Risk Middleware (FR-3)

- [ ] Task: Write failing tests for semantic risk middleware [TIER-3]
    - [ ] Test: Read-only commands classified as `auto-approve`
    - [ ] Test: Test runners classified as `auto-approve`
    - [ ] Test: File writes in `src/` classified as `auto-approve`
    - [ ] Test: File writes outside project dir classified as `human-required`
    - [ ] Test: Destructive commands (`rm -rf`) classified as `human-required`
    - [ ] Test: Dependency modifications classified as `human-required`
    - [ ] Test: Custom `risk-policy.yaml` rules override defaults
    - [ ] Test: Risk classification events are emitted for every action
- [ ] Task: Implement semantic risk middleware in `src/safety/risk-middleware.ts` [TIER-4]
    - [ ] Parse `risk-policy.yaml` into typed `RiskPolicy`
    - [ ] Implement command classifier: regex/glob patterns for each risk tier
    - [ ] Integrate with dispatcher: intercept tool calls before execution
    - [ ] On `auto-approve`: proceed silently
    - [ ] On `log-proceed`: log and proceed
    - [ ] On `human-required`: pause execution and request approval
    - [ ] Emit `RiskClassification` events to the event store
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Semantic Risk Middleware' (Protocol in workflow.md)

## Phase 5: Integration Testing

- [ ] Task: Write integration tests for state and safety pipeline [TIER-3]
    - [ ] Test: Full task lifecycle with events persisted to SQLite
    - [ ] Test: High-risk task triggers GCC worktree → succeeds → merges back
    - [ ] Test: Risk middleware blocks destructive command during pipeline execution
    - [ ] Test: State reconstruction from event log matches live state
- [ ] Task: Verify all unit tests pass with >80% code coverage [TIER-1]
- [ ] Task: Regression test: verify Phases 1-2 engine and existing commands still function [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration Testing' (Protocol in workflow.md)

## Phase 6: Integration & Finalization

- [ ] Task: Integrate track 'sandboxing_resilience_20260710' into main branch. [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Integration & Finalization' (Protocol in workflow.md)
