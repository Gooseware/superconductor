# Implementation Plan: Task Graph + Invariant Ledger

## Phase 0: Swarm Preflight
- Setup test environments and verify current baseline `tsc --noEmit` passes.

## Phase 1: task-store package (libSQL)
- Create `packages/task-store/` following the structure of `notebook-store/`.
- Define libSQL schema for `tasks`, `invariants`, and `invariant_overrides`.
- Implement migration logic and base database provider classes.

## Phase 2: task-store LanceDB
- Implement LanceDB integration within `task-store` for semantic search over tasks.
- Ensure hybrid search (vector + BM25 if applicable) works for task queries.

## Phase 3: MCP tools registration
- Update `superconductor-kernel` (`packages/superconductor-kernel/src/index.ts`) to register `task_create`, `task_update`, `task_query`, `invariant_query`, `invariant_override`, and `task_get_invariants`.
- Add comprehensive unit tests for all new MCP tools.

## Phase 4: newTrack skill update
- Modify the `newTrack` skill script to sync generated tasks into the DB via `task_create` immediately after generating the human-readable `plan.md`.

## Phase 5: implement skill update
- Refactor the `implement` skill to query `task_query()` for assignments instead of parsing the markdown plan.

## Phase 6: status skill update
- Update the `status` skill to pull real-time statuses and aggregations from the `task-store` via MCP queries rather than regexing markdown checkboxes.

## Phase 7: Dreamer task card enhancement
- Modify the Dreamer agent prompts/logic to append `CREATES:`, `PROTECTED:`, and `INVARIANT_AFTER:` fields on new task generation.
- Ensure these new fields flow correctly into the task DB.

## Phase 8: Regression reviewer enhancement
- Add the invariant pre-check step to `agents/regression-reviewer/agent.md`.
- Query `invariant_query()` and emit `REG-INV-N: CRITICAL` if paths are missing without overrides.

## Phase 9: Bootstrap + Discovery agent
- Write a bootstrap script to seed existing codebase invariants (slash commands, tools, core files).
- Implement a discovery agent that reasons over brownfield codebases to output `superconductor/invariants-untriaged.md`.
- Add functionality to auto-generate/sync `superconductor/invariants.md`.

## Phase 10: Integration & Finalization
- End-to-end testing of the Swarm executing a track end-to-end with the new DB.
- Validate test coverage (>80%) and `tsc --noEmit`.
