# Implementation Plan: Token Estimation and Open Source Package Recommender

## Proactive Planning (Oracle Analysis)
- **Reusable Telemetry Interface:** Abstract the `TelemetryStore` so it can be backed by a file system (JSONL), a database, or standard output. This ensures flexibility across different execution environments.
- **Generic Manifest Parser:** Implement the `DependencyContextManager` using a strategy pattern to easily support parsing diverse dependency files (e.g., `package.json`, `go.mod`, `pyproject.toml`) without modifying the core logic.
- **Strict Vetting Schema:** Use Zod (or equivalent) to enforce the `PackageVettingMatrix` schema across both the prompt generator instructions and the actual output validation layer.

## Phase 0: Swarm Preflight
- [ ] Task: Verify if the `swarm-orchestrate` skill is installed and loaded. [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Lifecycle Token Aggregation
- [ ] Task: Implement the reusable `TelemetryStore` interface and file-based backend for logging token usage. [TIER-3] [AGENT:caduceus-dreamer]
    - [ ] Create abstract interface for telemetry backends.
    - [ ] Implement file-based JSONL telemetry writer.
    - [ ] Write unit tests for the telemetry writer.
- [ ] Task: Update the subagent runtime wrapper to track in-memory tokens and flush a `TokenUsageReport` on termination. [TIER-3] [AGENT:caduceus-processor]
    - [ ] Add tracking variables for prompt and completion tokens.
    - [ ] Hook into the agent lifecycle termination to flush the report to the `TelemetryStore`.
    - [ ] Write integration tests for the wrapper.
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Lifecycle Token Aggregation' (Protocol in workflow.md)

## Phase 2: Dependency Context Management
- [ ] Task: Implement the `DependencyContextManager` with a generic manifest parsing strategy. [TIER-3] [AGENT:caduceus-dreamer]
    - [ ] Define the strategy pattern interface for manifest parsers.
    - [ ] Implement a `package.json` parser strategy.
    - [ ] Implement the core manager that queries the workspace and returns the installed package list.
    - [ ] Write unit tests for the manager and parser.
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Dependency Context Management' (Protocol in workflow.md)

## Phase 3: Deep Research Prompt Generation
- [ ] Task: Implement Zod schema for `PackageVettingMatrix` and the prompt generator tool. [TIER-3] [AGENT:caduceus-processor]
    - [ ] Define the `PackageVettingMatrix` schema.
    - [ ] Create the `GenerateResearchPrompt` tool logic.
    - [ ] Wire the `DependencyContextManager` into the prompt generator to provide current context.
    - [ ] Write tests ensuring the prompt strictly enforces read-only evaluation.
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Deep Research Prompt Generation' (Protocol in workflow.md)

## Phase 4: Integration & Finalization
- [ ] Task: Integrate track 'token_estimation_20260723' into main branch. [TIER-2] [AGENT:caduceus-orchestrator]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Integration & Finalization' (Protocol in workflow.md)
