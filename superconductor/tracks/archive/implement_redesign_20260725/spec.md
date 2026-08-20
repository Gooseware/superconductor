# Specification: /superconductor:implement Redesign & Track Manifest

## Overview
Redesign the `/superconductor:implement` workflow to distinctly support both headless and interactive entrypoints from initialization. Replace the verbose `tracks.md` with a Dense YAML format (`tracks.yaml`) to optimize the LLM context window. Implement multi-track selection with automated Directed Acyclic Graph (DAG) topological sorting based on track dependencies to ensure logical execution order.

## Architectural Committee Recommendations
- **Entrypoint Decoupling:** Use a `CliDispatcher` checking `process.stdout.isTTY` and arguments to launch either an `InteractiveOrchestrator` (TUI based) or a `HeadlessOrchestrator`. Both MUST output a standardized `ImplementationPlan` for the `ExecutionEngine`.
- **Dense YAML Validation:** Parsing of `tracks.yaml` must use secure mechanisms (disabled schema execution in YAML parsers) and be strictly validated via a schema library (like Zod) to prevent corruption and prototype pollution.
- **DAG Robustness:** Topological sorting via Kahn's Algorithm must include robust cycle detection to gracefully fail and prevent infinite loops when circular dependencies exist.

## Research Notes
- **Context Window Optimization:** Dense YAML drastically reduces whitespace and narrative tokens compared to Markdown tables, making context injection up to 40% more efficient.
- **Dependency Graph Sorting:** Evaluating dependencies via a DAG ensures functional determinism. Tracks acting as foundational features (nodes without parents) are always executed before dependent features, maximizing synthetic context continuity.

## Functional Requirements
1. **Interactive Entrypoint:** Running `/superconductor:implement` without a specific track argument and in a TTY environment must launch a TUI multi-select checklist of available tracks.
2. **DAG Sorting:** Once tracks are selected, the system must topologically sort them based on `deps` defined in `tracks.yaml`.
3. **Headless Entrypoint:** Passing `--headless` or running in a non-TTY environment must bypass the TUI and execute strictly via arguments, or fail with a non-zero exit code if arguments are invalid.
4. **Migration Script:** Include an automated CLI utility to migrate legacy `tracks.md` files to the new `tracks.yaml` format for backward compatibility.
5. **Intelligence Layer Upgrade:** The Superconductor Intelligence snapshot reader must be upgraded to natively read `tracks.yaml` and inject its structured data into the agent context window.

## Non-Functional Requirements
- **Security:** Strict YAML parsing to prevent code injection.
- **Performance:** DAG resolution must execute in O(V+E) time to ensure instantaneous TUI feedback.
- **Resilience:** Circular dependency detection must throw clear, actionable error messages (e.g., `Error: Circular dependency A -> B -> A`).

## Acceptance Criteria
- [ ] User can launch `/superconductor:implement` and select 3 dependent tracks via checkboxes.
- [ ] The system automatically orders the 3 tracks logically based on their DAG relationships before executing.
- [ ] Passing `--headless` bypasses all UI and successfully executes passed track IDs.
- [ ] A migration script successfully converts an existing `tracks.md` with 5 tracks into a valid `tracks.yaml`.
- [ ] `IntelligenceSnapshotReader` loads the YAML and accurately exposes pending/completed tracks to the agent context.
- [ ] If a circular dependency is artificially introduced in `tracks.yaml`, the system aborts gracefully and reports the cycle.

## Out of Scope
- Modifying the underlying execution model of the tracks themselves.
- Rewriting the Oracle/Reviewer panel implementations.
