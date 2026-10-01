# Specification: First-Class Parallel Multi-Track Swarm Orchestration

## Title & Overview
**Track ID**: `parallel_multi_track_swarm_orchestration_20261001`
**Title**: First-Class Parallel Multi-Track Swarm Orchestration (Topological Waves, Worktrunk Isolation & DMQ-POP)

This track implements a major upgrade to the Superconductor swarm orchestrator. It transforms the legacy linear execution model—plagued by algorithmic 1D flattening in the ExecutionPlanner and explicit sequential directives in skills—into a fully parallelized, wave-based Directed Acyclic Graph (DAG) executor. It employs worktrunk-driven worktree isolation, a pipelined Distributed Multi-Track Quorum & Pipelined Oracle Protocol (DMQ-POP), and a mutex-gated serial merge queue, ultimately achieving a 2.5x-3.0x speedup in multi-track execution.

## Architecture Discussion Panel Synthesis
A thorough panel review identified four main culprits for the current linear execution bias:
1. **Algorithmic 1D Flattening**: `ExecutionPlanner.plan(tracks)` forcibly flattens the DAG into a serial list, selecting only the first candidate. We will introduce `planWaves(tracks)` to partition tracks into parallel topological antichains (waves).
2. **Explicit Sequential Directives**: Skills like `batch-execute/SKILL.md` and `implement/SKILL.md` contain explicit instructions forcing sequential loops. We will rewrite these to natively invoke parallel wave execution with worktree isolation.
3. **Worktree Contention & Isolation**: Shared repository roots lead to Git lock contention and state leaks. We will implement strict worktree isolation via a `.config/wt.toml` setup and `wt list`, integrated via `WorktreeIsolationManager`.
4. **Quorum Bottlenecks**: Global shared states in QuorumStore limit parallel execution. We will partition store paths by `trackId` and introduce semaphores for reviewers/test runners and a pipelined Oracle gate (DMQ-POP) to support concurrent flash quorums.

## Functional Requirements
- **FR-1**: `ExecutionPlanner` MUST implement a `planWaves(tracks: TrackPlanData[]): TrackPlanData[][]` method returning valid parallel waves (topological antichains).
- **FR-2**: The `batch-execute` and `implement` skills MUST execute tracks utilizing the parallel wave strategy and worktree isolation (`--parallel` mode).
- **FR-3**: The system MUST implement worktree isolation through `WorktreeIsolationManager` querying `.config/wt.toml` or `wt list`.
- **FR-4**: The orchestrator MUST queue merge operations using a serial mutex-gated `MergeQueueManager` to avoid Git collisions (`wt step push --no-ff`).
- **FR-5**: The QuorumStore and Preflight mechanisms MUST be fully namespaced by `trackId` (`.superconductor/tracks/${trackId}/...`) with concurrent reviewer/test semaphores.

## Non-Functional Requirements
- **Performance**: The execution of unblocked multi-track workloads MUST achieve a 2.5x-3.0x speedup relative to purely sequential execution.
- **Isolation**: Worktrees MUST guarantee zero contamination or Git lock contention across concurrent track runs.
- **Backward Compatibility**: `ExecutionPlanner.plan()` MUST be preserved as a backward-compatible wrapper that flattens `planWaves()`.

## Acceptance Criteria
- **AC-1**: `ExecutionPlanner.planWaves` correctly outputs independent track groups (waves) where no track in a wave depends on another track in the same wave.
- **AC-2**: Running the updated `batch-execute` skill with multiple parallel candidates launches them in separate worktrees concurrently.
- **AC-3**: `MergeQueueManager` successfully linearizes concurrent merge attempts, safely applying them to the mainline branch.
- **AC-4**: Quorum reports and preflight logs are correctly persisted in their track-specific folders, without clashing across concurrent runs.
- **AC-5**: The existing test suite passes, and new unit tests for `planWaves` and `MergeQueueManager` achieve >90% coverage.

## Out of Scope
- Cross-project multi-track execution.
- Optimizing or refactoring individual `correctness-reviewer` logic or subagent prompts beyond parallel safety.
