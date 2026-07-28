# Implementation Plan: Gemini API Deep Research

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 6 tasks)
**Estimated Track Token Budget:** ~0.2M tokens · ~$0.02 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify if the `swarm-orchestrate` skill i... | flash_lite | 19K | ~6 min |
| 2 | Task: Create a dedicated `GeminiInteractionsCli... | flash_lite | 56K | ~18 min |
| 3 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 4 | Task: Implement `GeminiApiDeepResearchProvider`... | flash_lite | 47K | ~15 min |
| 5 | Task: Register the new provider in `packages/en... | flash_lite | 56K | ~18 min |
| 6 | Task: Integrate track 'gemini_api_deep_research... | flash_lite | 19K | ~6 min |

## Phase 0: Swarm Preflight
- [ ] Task: Verify if the `swarm-orchestrate` skill is installed and loaded. [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 1: Proactive Architecture & Reusable Components (Oracle Suggestions)
- [ ] Task: Create a dedicated `GeminiInteractionsClient` utility to encapsulate `@google/genai` SDK initialization and secure key handling. [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [ ] Install `@google/genai` dependency in `packages/engine`. [TIER-1:TCS=3]
    - [ ] Implement robust error throwing if `GEMINI_API_KEY` is missing. [TIER-1:TCS=3]
- [ ] Task: Create an `AsyncLongPoller` utility for generic robust polling with `Retry-After` support. [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [ ] Implement exponential backoff, maximum timeout bounds (e.g. 45 mins), and 429 `Retry-After` interception. [TIER-1:TCS=3]
- [ ] Task: Update `TelemetryStore` to explicitly sanitize `GEMINI_API_KEY` from all outputs. [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Proactive Architecture & Reusable Components (Oracle Suggestions)' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 2: Provider Implementation
- [ ] Task: Implement `GeminiApiDeepResearchProvider` conforming to `IResearchProvider`. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Use `GeminiInteractionsClient` to initiate research with `background: true`. [TIER-1:TCS=3]
    - [ ] Use `AsyncLongPoller` to wait for completion. [TIER-1:TCS=3]
    - [ ] Map the `"completed"` state outputs to `IResearchSource[]`. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Provider Implementation' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 3: Registration and Integration
- [ ] Task: Register the new provider in `packages/engine/src/research/provider-registry.ts`. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Export as `gemini-api-deep-research`. [TIER-1:TCS=3]
- [ ] Task: Update tests for the new provider structure. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Mock the `@google/genai` interactions API. [TIER-1:TCS=3]
    - [ ] Test the long-polling logic and `429 Retry-After` interception. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Registration and Integration' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 4: Integration & Finalization
- [ ] Task: Integrate track 'gemini_api_deep_research_20260728' into main branch. [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=3]
