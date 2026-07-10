# Implementation Plan: HTN Planning & Multi-Agent Delegation Engine

## Phase 1: Project Scaffolding & Core Types

- [ ] Task: Initialize `packages/engine/` TypeScript module with `package.json`, `tsconfig.json`, and directory structure (`src/`, `src/types/`, `src/dag/`, `src/scheduler/`, `src/dispatcher/`, `src/concurrency/`, `src/context/`, `src/generator/`, `tests/`) [TIER-3]
    - [ ] Configure TypeScript with strict mode, ES module output
    - [ ] Add dev dependencies: `vitest`, `yaml` (js-yaml), `typescript`, `@types/node`
    - [ ] Create `src/index.ts` barrel export
- [ ] Task: Define core type system in `src/types/` [TIER-3]
    - [ ] `dag.types.ts`: `DagNode`, `DagEdge`, `TaskGraph`, `TaskRole` (architect|editor), `TaskTier` (1-4), `TaskStatus` (pending|running|completed|failed|blocked)
    - [ ] `scheduler.types.ts`: `SchedulerState`, `TaskBatch`, `SchedulerEvent`
    - [ ] `dispatcher.types.ts`: `SubagentConfig`, `SubagentResult`, `DispatcherEvent`
    - [ ] `concurrency.types.ts`: `FileOwnership`, `ConflictReport`, `WriteRequest`
    - [ ] `events.ts`: Unified `EngineEvent` discriminated union for all event types
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Project Scaffolding & Core Types' (Protocol in workflow.md)

## Phase 2: YAML DAG Parser & Validator (FR-1)

- [ ] Task: Write failing tests for YAML DAG parser [TIER-3]
    - [ ] Test: Parse a valid multi-node YAML DAG into `TaskGraph`
    - [ ] Test: Reject YAML with cyclic dependencies
    - [ ] Test: Reject YAML with missing dependency references
    - [ ] Test: Reject YAML with orphan nodes (no path to root)
    - [ ] Test: Emit structured validation errors with line numbers
    - [ ] Test: Parse task metadata (`id`, `name`, `description`, `dependencies`, `tier`, `role`, `files`)
- [ ] Task: Implement YAML DAG parser and validator in `src/dag/parser.ts` and `src/dag/validator.ts` [TIER-3]
    - [ ] Parse YAML using `js-yaml` into raw structure
    - [ ] Map raw structure to typed `TaskGraph` with `DagNode[]` and adjacency lists
    - [ ] Implement cycle detection (Kahn's algorithm or DFS-based)
    - [ ] Implement orphan detection and missing dependency checks
    - [ ] Return `ValidationResult` with structured errors including line context
- [ ] Task: Create sample YAML DAG fixture (`tests/fixtures/sample-dag.yaml`) with 8+ tasks demonstrating parallel branches, sequential dependencies, and all task metadata fields [TIER-3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: YAML DAG Parser & Validator' (Protocol in workflow.md)

## Phase 3: Topological Scheduler (FR-2)

- [ ] Task: Write failing tests for topological scheduler [TIER-3]
    - [ ] Test: `nextBatch()` returns root tasks (no dependencies) first
    - [ ] Test: `nextBatch()` returns maximal parallel set after completing a task
    - [ ] Test: Sequential dependencies are respected (B depends on A → B not in batch until A completes)
    - [ ] Test: Diamond dependency pattern resolves correctly (D depends on B and C, both depend on A)
    - [ ] Test: Task failure propagation marks all downstream dependents as `blocked`
    - [ ] Test: Empty graph returns empty batch
    - [ ] Test: Single-node graph works correctly
- [ ] Task: Implement topological scheduler in `src/scheduler/scheduler.ts` [TIER-3]
    - [ ] Build in-degree map from `TaskGraph`
    - [ ] Implement `nextBatch()` iterator: return all tasks with in-degree 0 and status `pending`
    - [ ] Implement `completeTask(id)`: decrement in-degrees of dependents, re-evaluate frontier
    - [ ] Implement `failTask(id)`: mark task as `failed`, recursively mark all descendants as `blocked`
    - [ ] Emit `SchedulerEvent` on each state transition
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Topological Scheduler' (Protocol in workflow.md)

## Phase 4: Subagent Dispatcher (FR-3)

- [ ] Task: Write failing tests for subagent dispatcher [TIER-3]
    - [ ] Test: Architect tasks spawn with frontier model config (`--model pro`)
    - [ ] Test: Editor tasks spawn with flash model config (`--model flash`)
    - [ ] Test: Tier-to-model mapping is correct (Tier 1-3 → flash, Tier 4 → pro)
    - [ ] Test: Bounded context payload contains only DAG node instructions and file paths
    - [ ] Test: Subagent lifecycle: spawn → monitor → collect result
    - [ ] Test: Timeout handling kills subagent and marks task as failed
    - [ ] Test: Concurrent dispatch of multiple subagents for parallel tasks
- [ ] Task: Implement subagent dispatcher in `src/dispatcher/dispatcher.ts` [TIER-3]
    - [ ] Define `ISubagentRunner` interface (for mocking AGY CLI calls)
    - [ ] Implement `MockSubagentRunner` for testing
    - [ ] Build `SubagentDispatcher` class: accept `TaskBatch`, construct configs, spawn runners
    - [ ] Map `TaskTier` and `TaskRole` to AGY model flags
    - [ ] Implement timeout mechanism with configurable duration
    - [ ] Emit `DispatcherEvent` on spawn, completion, failure, timeout
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Subagent Dispatcher' (Protocol in workflow.md)

## Phase 5: STORM Concurrency Controller (FR-4)

- [ ] Task: Write failing tests for STORM concurrency controller [TIER-3]
    - [ ] Test: First writer acquires file ownership successfully
    - [ ] Test: Concurrent write to same file by different subagent is rejected
    - [ ] Test: Rejected write returns a unified diff of the conflict
    - [ ] Test: File ownership is released when a task completes
    - [ ] Test: Read operations are always permitted regardless of ownership
    - [ ] Test: Conflict events are emitted on rejection
- [ ] Task: Implement STORM concurrency controller in `src/concurrency/storm.ts` [TIER-4]
    - [ ] Build file ownership ledger (`Map<filepath, { ownerId, version }>`)
    - [ ] Implement `acquireWrite(taskId, filepath)`: check ledger, grant or reject
    - [ ] Implement `releaseAll(taskId)`: release all file locks held by a task
    - [ ] Generate unified diffs on conflict using `diff` library
    - [ ] Emit `ConflictEvent` with details (file, owners, diff)
    - [ ] Integrate with dispatcher: wrap subagent write operations through STORM
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: STORM Concurrency Controller' (Protocol in workflow.md)

## Phase 6: AGENTS.md Context Builder (FR-5)

- [ ] Task: Write failing tests for context builder [TIER-3]
    - [ ] Test: Auto-generate `AGENTS.md` from project Product Definition and Workflow
    - [ ] Test: Per-task context payload contains only DAG node instructions and file paths
    - [ ] Test: Context payload excludes chat history and unrelated project files
    - [ ] Test: Delta context update only includes changed instructions
- [ ] Task: Implement context builder in `src/context/context-builder.ts` [TIER-3]
    - [ ] Read `product.md`, `workflow.md`, and `tech-stack.md` to generate `AGENTS.md` template
    - [ ] Build `TaskContext` from `DagNode`: extract instructions, file paths, relevant rules
    - [ ] Support `--dir <repo-root>` flag generation instead of inlining file contents
    - [ ] Implement delta computation for `--continue` conversations
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: AGENTS.md Context Builder' (Protocol in workflow.md)

## Phase 7: newTrack DAG Generator (FR-6)

- [ ] Task: Write failing tests for DAG generator [TIER-3]
    - [ ] Test: Generate valid YAML DAG from a track spec with TDD phases (Red → Green → Refactor)
    - [ ] Test: Generated DAG passes the parser/validator from Phase 2
    - [ ] Test: Tasks are auto-annotated with correct `tier` and `role`
    - [ ] Test: Dependency edges correctly encode TDD ordering (test → implement → refactor)
    - [ ] Test: Backward-compatible `plan.md` is also generated as human-readable view
- [ ] Task: Implement DAG generator in `src/generator/dag-generator.ts` [TIER-4]
    - [ ] Accept spec content and workflow rules as input
    - [ ] Generate phases with proper task decomposition following TDD lifecycle
    - [ ] Auto-assign tiers based on task complexity heuristics
    - [ ] Auto-assign roles (architect for design tasks, editor for implementation)
    - [ ] Output valid YAML that conforms to the schema defined in Phase 2
    - [ ] Generate companion `plan.md` with task status markers for backward compatibility
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: newTrack DAG Generator' (Protocol in workflow.md)

## Phase 8: Integration Testing & Engine Orchestrator

- [ ] Task: Write failing integration tests for the full engine pipeline [TIER-3]
    - [ ] Test: Sample DAG flows through parser → scheduler → dispatcher → completion
    - [ ] Test: STORM controller correctly mediates concurrent writes during pipeline execution
    - [ ] Test: Context builder provides correct payloads to dispatched subagents
    - [ ] Test: Engine emits correct sequence of events throughout the pipeline
- [ ] Task: Implement engine orchestrator in `src/engine.ts` [TIER-4]
    - [ ] Wire together parser, scheduler, dispatcher, STORM controller, and context builder
    - [ ] Implement main `run(dagPath)` entry point
    - [ ] Implement event bus for engine-wide observability
    - [ ] Handle graceful shutdown on critical failures
- [ ] Task: Verify all unit tests pass with >80% code coverage [TIER-1]
    - [ ] Run `CI=true npx vitest run --coverage`
    - [ ] Verify coverage report meets threshold
- [ ] Task: Regression test: verify existing Superconductor commands still function [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 8: Integration Testing & Engine Orchestrator' (Protocol in workflow.md)

## Phase 9: Integration & Finalization

- [ ] Task: Integrate track 'htn_engine_20260710' into main branch. [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 9: Integration & Finalization' (Protocol in workflow.md)
