# Implementation Plan: Task Graph + Invariant Ledger

## Phase 0: Swarm Preflight [checkpoint: fb02f4bd]
- [x] Setup test environments and verify current baseline `tsc --noEmit` passes.

## Phase 1: task-store libSQL [checkpoint: fb02f4bd]
- [x] Create `packages/task-store/` following the exact structure specified (like `notebook-store`).
- [x] Define libSQL schema for `tasks`, `invariants`, and `invariant_overrides` with all required fields.
- [x] Implement `LibSQLTaskProvider` and migration logic.

## Phase 2: task-store LanceDB [checkpoint: 3101047a]
- [x] Implement LanceDB integration within `task-store` using the exact `taskSchema`.
- [x] Implement `LanceDBTaskProvider` and `task-provider-factory`.
- [x] Verify vector embedding logic for task items.

## Phase 3: MCP tools [checkpoint: aca4280d]
- [x] Implement all 6 exact MCP tools (`task_create`, `task_update`, `task_query`, `invariant_query`, `invariant_override`, `task_get_invariants`) in `packages/task-store/src/mcp/handlers.ts` or directly within `superconductor-kernel`.
- [x] Register them in `superconductor-kernel`.
- [x] Add full test coverage for these tools.

## Phase 4: newTrack skill + sync-plan script [checkpoint: 9a030b36]
- [x] Update `newTrack` skill to parse `CREATES`, `PROTECTED`, and `INVARIANT_AFTER` fields from `plan.md`.
- [x] Call `task_create` for each parsed task.
- [x] Create/update a `sync-plan` script that pulls state from DB and rewrites `plan.md` checkboxes.

## Phase 5: implement skill [checkpoint: 41e8d0b9]
- [x] Refactor the `implement` skill to query `task_query()` for assignments, fully decoupling from reading markdown files for execution dispatch.

## Phase 6: status skill [checkpoint: 259b6397]
- [x] Update the `status` skill to pull real-time statuses and aggregations from the `task-store` via `task_query` or dedicated endpoint rather than regexing markdown.

## Phase 7: Dreamer enhancement [checkpoint: 74bb8513]
- [x] Modify the Dreamer agent prompt/system instructions to generate `CREATES:`, `PROTECTED:`, and `INVARIANT_AFTER:` fields within the task cards in `plan.md`.

## Phase 8: Regression reviewer [checkpoint: a4b1c50d]
- [x] Add invariant pre-check step to `agents/regression-reviewer/agent.md`.
- [x] Ensure it queries `invariant_query()` and emits `REG-INV-N: CRITICAL` if paths are missing and not overridden.

## Phase 9: Bootstrap + Discovery agent
- Write script to seed existing invariants (commands, MCP tools, core orchestration).
- Build the brownfield discovery bootstrap agent that assesses invariant confidence (HIGH -> active, MEDIUM/LOW -> untriaged output to `superconductor/invariants-untriaged.md`).

## Phase 10: Integration & Finalization
- Test end-to-end integration across Swarm, `newTrack`, `implement`, and `sync-plan`.
- Verify `superconductor/invariants.md` gets correctly generated at finalization via `task_get_invariants()`.
- Ensure >80% coverage and `tsc --noEmit` passes cleanly.
