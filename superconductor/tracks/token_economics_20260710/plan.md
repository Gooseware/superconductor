# Implementation Plan: Token Economics & Dynamic Routing

## Phase 1: Routing Module Scaffolding [checkpoint: bead157]

- [x] Task: Create `packages/engine/src/routing/` directory structure and type definitions [TIER-3] a6e73c0
    - [ ] `tool-analyzer.types.ts`: `PluginInfo`, `ToolAllowlist`, `TrimResult`
    - [ ] `escalation.types.ts`: `EscalationPolicy`, `EscalationSignal`, `EscalationHistory`, `EscalationEvent`
    - [ ] `cache.types.ts`: `PromptSegment`, `CacheManifest`, `CacheHitReport`
    - [ ] Add new event types to the engine's `EngineEvent` union
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Routing Module Scaffolding' (Protocol in workflow.md) bead157

## Phase 2: Tool Surface Analyzer (FR-1) [checkpoint: cf90671]

- [x] Task: Write failing tests for tool surface analyzer [TIER-3] 640895f
    - [ ] Test: Parse mock `agy plugin list` output into `PluginInfo[]`
    - [ ] Test: Generate correct `--disable-plugin` flags for an editor task (disable design/notebook plugins)
    - [ ] Test: Generate correct flags for an architect task (disable code-write plugins)
    - [ ] Test: Allowlist overrides preserve explicitly required plugins
    - [ ] Test: Emit telemetry event with estimated token savings
- [x] Task: Implement tool surface analyzer in `src/routing/tool-analyzer.ts` [TIER-3] 640895f
    - [ ] Parse plugin list output into typed `PluginInfo[]`
    - [ ] Match task `role` and `files[]` metadata against plugin capabilities
    - [ ] Generate `--disable-plugin` flag strings for subagent spawn commands
    - [ ] Calculate and emit estimated token savings per trim
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Tool Surface Analyzer' (Protocol in workflow.md) cf90671

## Phase 3: Dynamic Escalation Router (FR-2) [checkpoint: 5e4d261]

- [x] Task: Write failing tests for dynamic escalation router [TIER-3] 99f7025
    - [ ] Test: No escalation when failures are below threshold (< 3 consecutive)
    - [ ] Test: Escalation triggers after 3 consecutive Red→Green failures
    - [ ] Test: Escalation triggers on token budget exceeded
    - [ ] Test: Escalation triggers on edit match failure threshold
    - [ ] Test: Combined signal mode triggers on any threshold breach
    - [ ] Test: Downshift to cheaper model after successful post-escalation task
    - [ ] Test: Escalation history is maintained per track
    - [ ] Test: Custom escalation policy overrides default thresholds
- [x] Task: Implement dynamic escalation router in `src/routing/escalation-router.ts` [TIER-4] 99f7025
    - [ ] Define `IEscalationPolicy` interface for pluggable policies
    - [ ] Implement `DefaultEscalationPolicy` with configurable thresholds
    - [ ] Track per-task failure counts, token usage, and edit match results
    - [ ] Implement escalation logic: kill subagent, rebuild context, re-dispatch with frontier model
    - [ ] Implement downshift logic: reset failure counters, resume with cheap model
    - [ ] Maintain `EscalationHistory` log per track
    - [ ] Integrate with Phase 1 dispatcher's `onTaskResult` callback
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Dynamic Escalation Router' (Protocol in workflow.md) 5e4d261

## Phase 4: Prefix Prompt Cache Manager (FR-3)

- [x] Task: Write failing tests for prompt cache manager [TIER-3]
    - [x] Test: Calculate caching breakpoints efficiently (based on prefix similarity)
    - [x] Test: Evict least-recently-used prompts to stay under budget
    - [x] Test: Deduplicate context payloads across branch nodes
- [x] Task: Implement prefix prompt cache manager in `src/routing/cache-manager.ts` [TIER-4] 1b1e554
    - [x] Track system prompt, common task instructions, tool definitions, and standard file context boundaries.
    - [x] Extract overlapping string prefixes to maximize `system_instruction` cache hits on API.
    - [x] Calculate tokens manually via an embedded lightweight tokenizer approximation if exact token counts are unavailable.
- [~] Task: Superconductor - User Manual Verification 'Phase 4: Prefix Prompt Cache Manager' (Protocol in workflow.md)

## Phase 5: Integration Testing

- [ ] Task: Write integration tests for the routing pipeline [TIER-3]
    - [ ] Test: Full dispatch flow with tool trimming + escalation + prompt caching
    - [ ] Test: Escalation mid-pipeline correctly re-dispatches with frontier model and trimmed tools
    - [ ] Test: Routing events are emitted in correct sequence
- [ ] Task: Verify all unit tests pass with >80% code coverage [TIER-1]
- [ ] Task: Regression test: verify Phase 1 engine and existing Superconductor commands still function [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration Testing' (Protocol in workflow.md)

## Phase 6: Integration & Finalization

- [ ] Task: Integrate track 'token_economics_20260710' into main branch. [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Integration & Finalization' (Protocol in workflow.md)
