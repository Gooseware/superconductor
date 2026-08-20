# Specification: Parallel Multi-Agent Execution Model

## Overview
Redesign the Superconductor core execution engine to support parallel, multi-agent task execution. Transition from a strict sequential state machine to a parallel task dispatcher for tasks without dependencies, drastically increasing swarm throughput and reducing track completion time.

## Functional Requirements
1. **Parallel Dispatch:** The engine must parse task dependencies (via DAG) and concurrently spawn multiple agent processes for independent tasks within a phase.
2. **Concurrency Limits:** Implement a configurable `--max-concurrent-agents` flag (default 6) to prevent API rate limiting.
3. **State Merging:** Implement a robust state-merging conflict resolver (e.g., using AST merging or branch reconciliation) when multiple parallel tasks attempt to modify the same source files.
4. **Swarm Pipeline Update:** Update `swarm-orchestrate` to handle asynchronous parallel tracking and logging.

## Non-Functional Requirements
- **Performance:** Track execution time should theoretically reduce by up to N times (where N is the concurrency limit) for highly independent tasks.
- **Resilience:** The state machine must gracefully wait (Promise.all) for all parallel waves in a phase to complete before triggering the Phase Verification.

## Acceptance Criteria
- [ ] Engine successfully runs 4 independent tasks concurrently.
- [ ] Conflicting file edits from parallel agents are caught and queued for sequential conflict resolution.
- [ ] Swarm logger cleanly interleaves or distinctly separates output from parallel subagents.
