# Superconductor v0.5: Task Graph + Invariant Ledger

## Overview
This track upgrades Superconductor by introducing a structured Task Store and an Invariant Ledger. It establishes a libSQL + LanceDB backed task graph as the source of truth for task execution, replacing `plan.md` (which becomes a human-readable view). It also introduces capability invariants (`CREATES`, `PROTECTED`, `INVARIANT_AFTER`) to safeguard against regressions during iterative development.

**Note:** This track supersedes and absorbs `regression_invariant_ledger_20260812`.

## Acceptance Criteria

- **AC1:** `packages/task-store/` exists, implementing a libSQL schema with tables for `tasks`, `invariants`, and `invariant_overrides`, plus a LanceDB vector store for semantic task search.
- **AC2:** Six new MCP tools are registered in `superconductor-kernel`: `task_create`, `task_update`, `task_query`, `invariant_query`, `invariant_override`, and `task_get_invariants`.
- **AC3:** The `newTrack` skill is updated to call `task_create` for each task after writing `plan.md`.
- **AC4:** The `implement` skill is updated to retrieve task assignments via the `task_query()` MCP tool instead of parsing `plan.md`.
- **AC5:** The `status` skill queries the task database directly to report live execution status.
- **AC6:** The Dreamer agent logic generates `CREATES:`, `PROTECTED:`, and `INVARIANT_AFTER:` fields for task cards.
- **AC7:** The Regression Reviewer includes a pre-check step that queries `invariant_query()` and emits `REG-INV-N: CRITICAL` if a known invariant path no longer exists without a valid override.
- **AC8:** A bootstrap script (`bootstrap-invariants.ts`) seeds initial invariants for all existing slash commands, MCP tools, and 6 core orchestration files.
- **AC9:** A new discovery bootstrap agent generates `superconductor/invariants-untriaged.md` for brownfield project onboarding.
- **AC10:** An auto-generated `superconductor/invariants.md` mirrors the active invariants in a human-readable format.
- **AC11:** All newly introduced code achieves >80% test coverage.
- **AC12:** `tsc --noEmit` completes cleanly without errors.
