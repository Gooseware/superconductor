# Specification: HTN Planning & Multi-Agent Delegation Engine

## Overview

This track delivers the foundational engine module for Superconductor's evolution from a linear, markdown-driven TDD orchestrator into an event-driven, DAG-scheduled, multi-agent orchestration harness. The engine replaces the sequential `plan.md` bottleneck with a Hierarchical Task Network (HTN) represented as YAML Directed Acyclic Graphs, enabling parallel task execution via AGY subagents with intelligent role delegation (Architect vs. Editor).

This is **Phase 1** of a 5-phase transformation roadmap. Subsequent tracks will cover Token Economics & Dynamic Routing (Phase 2), Sandboxing & State Resilience (Phase 3), Production-Grade Verification (Phase 4), and Autonomous Curator (Phase 5).

## Architecture

- **Language:** TypeScript (Node.js)
- **Module Location:** `packages/engine/` (new module, existing commands remain stable)
- **Integration:** Existing Superconductor skills will call into the engine when ready; no breaking changes to current TOML commands or workflow

## Functional Requirements

### FR-1: YAML DAG Parser & Validator
- Parse HTN task definitions from `.yaml` files into a strongly-typed in-memory task graph
- Validate DAG structure: detect cycles, missing dependencies, orphan nodes
- Support task metadata: `id`, `name`, `description`, `dependencies[]`, `tier` (1-4), `role` (architect|editor), `files[]` (file scope for concurrency control)
- Emit structured validation errors with line numbers and suggestions

### FR-2: Topological Scheduler
- Compute topological sort of the task DAG
- Identify maximal sets of parallelizable tasks (tasks with all dependencies satisfied)
- Expose an iterator-based API: `nextBatch()` returns the next set of executable tasks
- Handle dynamic task completion: re-evaluate the frontier after each task completes
- Support task failure propagation: if a task fails, mark all downstream dependents as blocked

### FR-3: Subagent Dispatcher
- Spawn AGY subagents with role-appropriate configurations:
  - **Architect** (frontier model): Generates plans, designs, and architectural decisions — writes zero implementation code
  - **Editor** (flash model): Executes implementation tasks — writes code, tests, and configuration
- Map task `tier` annotations to AGY model flags (e.g., `--model flash` for Tier 1-3, `--model pro` for Tier 4)
- Manage subagent lifecycle: spawn, monitor status, collect results, handle timeouts
- Enforce bounded task contexts: pass only the specific DAG node instructions + relevant file paths (not full chat history)

### FR-4: STORM Concurrency Controller
- Track file ownership per active subagent based on task `files[]` declarations
- Before any subagent write operation, check for conflicts against the ownership ledger
- On conflict: reject the write, return a unified diff of the conflicting changes, and signal the subagent to replan
- Support optimistic concurrency: allow reads from any subagent, serialize writes per file
- Emit conflict events for observability

### FR-5: AGENTS.md Context Builder
- Auto-generate an `AGENTS.md` file codifying system rules, project conventions, and shared context
- For each dispatched subagent, construct a minimal bounded context payload containing:
  - The specific DAG node instructions
  - Relevant file paths (using `--dir` rather than pasting file contents)
  - Project-level rules from `AGENTS.md`
- Support delta-based context updates via `--continue` / `--conversation <id>` to prevent context window bloat

### FR-6: newTrack DAG Generator
- Extend the `/newTrack` skill to output YAML DAG files alongside (or instead of) the current `plan.md`
- Generate DAG nodes with proper dependency edges based on the TDD workflow phases (Red → Green → Refactor)
- Auto-annotate each task with the appropriate `tier` and `role`
- Preserve backward compatibility: continue generating `plan.md` as a human-readable view of the DAG

## Non-Functional Requirements

- **NFR-1: No Breaking Changes** — Existing Superconductor commands (`/setup`, `/implement`, `/status`, `/review`, `/revert`) must continue to work unchanged
- **NFR-2: Testability** — All engine components must be unit-testable with mocked subagent calls
- **NFR-3: Observability** — The scheduler must emit structured events (task started, completed, failed, conflict detected) for future telemetry integration (Phase 5)
- **NFR-4: Extensibility** — The engine architecture must support pluggable escalation policies (for Phase 2) and event persistence (for Phase 3)

## Acceptance Criteria

1. A sample YAML DAG with 8+ tasks (including parallel branches and sequential dependencies) can be parsed, validated, and scheduled without errors
2. The topological scheduler correctly identifies parallel task batches and respects all dependency edges
3. Subagent dispatcher can spawn mock AGY subagents with correct role/model assignments and bounded contexts
4. STORM controller correctly detects and rejects conflicting file writes, returning unified diffs
5. AGENTS.md is auto-generated with project rules and per-task context payloads are correctly scoped
6. The newTrack skill generates valid YAML DAGs that pass the parser/validator
7. All unit tests pass with >80% code coverage
8. Integration test: a sample DAG flows through parser → scheduler → dispatcher → completion without errors
9. Existing Superconductor commands continue to function correctly (regression test)

## Out of Scope

- **Token economics / dynamic model escalation** (Phase 2 track)
- **SQLite event logging / event-stream memory** (Phase 3 track)
- **Git Context Controller (GCC) / worktree isolation** (Phase 3 track)
- **YOLO mode / semantic risk middleware** (Phase 3 track)
- **Headless VLM audits / property-based testing / mutation testing** (Phase 4 track)
- **Telemetry dashboard / automated skill synthesis** (Phase 5 track)
- **Actual AGY CLI integration** — this track uses mocked subagent interfaces; real AGY spawning is a follow-up
