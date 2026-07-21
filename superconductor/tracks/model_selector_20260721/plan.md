# Implementation Plan: Model Selector Automation

## Proactive Planning (Oracle Suggestions)
- **Reusable CacheManager:** Abstract the lazy-loading, file checking, and JSON parsing logic into a generic `CacheManager` utility so it can be reused for caching other `agy` CLI data in the future.
- **Custom Error Handling:** Introduce a `ModelFetchError` class to cleanly catch and report failures from the Fetcher Agent to the CLI user.

## Phase 0: Swarm Preflight
- [ ] Task: Verify if the `swarm-orchestrate` skill is installed and loaded. [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Core Cache Manager & Fetch Logic
- [ ] Task: Implement Reusable CacheManager [TIER-3] [AGENT:caduceus-processor]
    - [ ] Sub-task: Write unit tests verifying `mtime` logic (older than 24h triggers refresh) and `0600` file permissions.
    - [ ] Sub-task: Implement `CacheManager` class to read/write JSON files safely.
- [ ] Task: Implement Fetcher Agent integration [TIER-3] [AGENT:caduceus-processor]
    - [ ] Sub-task: Write unit tests for executing the `agy models` CLI command and parsing its output.
    - [ ] Sub-task: Implement the Fetcher logic that runs `agy models`, wrapped in a `try-catch` using `ModelFetchError`.
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Core Cache Manager & Fetch Logic' (Protocol in workflow.md)

## Phase 2: Selector UI Integration
- [ ] Task: Implement interactive TUI prompt for model selection [TIER-3] [AGENT:caduceus-dreamer]
    - [ ] Sub-task: Write tests simulating UI prompt behavior with an empty vs populated cache.
    - [ ] Sub-task: Implement the `enquirer`/`prompts` prompt that reads from `CacheManager`.
    - [ ] Sub-task: Integrate the blocking lazy-fetch logic so the prompt waits if a fetch is triggered.
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Selector UI Integration' (Protocol in workflow.md)

## Phase 3: Integration & Finalization
- [ ] Task: Integrate track 'model_selector_20260721' into main branch. [TIER-2] [AGENT:caduceus-reviewer]
