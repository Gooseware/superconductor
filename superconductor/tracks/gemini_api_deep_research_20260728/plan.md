# Implementation Plan: Gemini API Deep Research

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 6 tasks)

---

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 10 tasks)
**Estimated Track Token Budget:** ~0.3M tokens · ~$0.03 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify if the `swarm-orchestrate` skill i... | flash_lite | 19K | ~6 min |
| 2 | Task: Fix `IResearchSource` — add `content?: st... | flash_lite | 56K | ~18 min |
| 3 | Implement: add parameter, wire through.; Task: ... | flash_lite | 19K | ~6 min |
| 4 | Task: Create `GeminiInteractionsClient` utility... | flash_lite | 56K | ~18 min |
| 5 | Implement: configurable `pollIntervalMs`, `maxW... | flash_lite | 47K | ~15 min |
| 6 | Task: Implement `GeminiApiDeepResearchProvider`... | flash_lite | 56K | ~18 min |
| 7 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 8 | Task: Update `ResearchProviderRegistry.resolve(... | flash_lite | 56K | ~18 min |
| 9 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 10 | Task: Integrate track 'gemini_api_deep_research... | flash_lite | 19K | ~6 min |

## Phase 0: Swarm Preflight
- [ ] Task: Verify if the `swarm-orchestrate` skill is installed and loaded. [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 1: Pre-existing Bug Fix & Type Extension
- [x] Task: Fix `IResearchSource` — add `content?: string` field to `packages/engine/src/research/types.ts`. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: `IResearchSource` with `content` field is accepted by brief synthesizer. [TIER-1:TCS=3]
    - [x] Implement: add `content?: string` to interface and Zod schema (if present). [TIER-1:TCS=3]
    - [x] Update `llmMapSource()` in `brief-synthesizer.ts` to use `source.content ?? source.title ?? source.url` as input. [TIER-1:TCS=3]
- [x] Task: Fix `ResearchBriefSynthesizer.synthesize()` signature mismatch — add missing `queries: string[]` parameter. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: call `synthesize(sources, trackId, queries)` and assert `queriesExecuted` is populated correctly. [TIER-1:TCS=3]
    - [x] Implement: add parameter, wire through. [TIER-1:TCS=3]
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Pre-existing Bug Fix & Type Extension' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 2: Shared Infrastructure (Oracle)
- [ ] Task: Create `GeminiInteractionsClient` utility in `packages/engine/src/research/providers/`. [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [ ] Write failing tests: missing API key → throws `ResearchProviderUnavailableError`. Missing `GCP_PROJECT_ID` → same. Valid AI Studio init succeeds. Valid Vertex AI init succeeds. [TIER-1:TCS=3]
    - [ ] Install `@google/genai` (>= 2.3.0) in `packages/engine`. [TIER-1:TCS=3]
    - [ ] Implement: `GeminiInteractionsClient` wrapping SDK init for both auth modes (`apiKey` vs `vertexai: true`). [TIER-1:TCS=3]
- [ ] Task: Create `AsyncLongPoller` utility in `packages/engine/src/research/providers/`. [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [ ] Write failing tests: normal completion returns result. Timeout exceeded → rejects. `429` with `Retry-After: 30` suspends 30s then resumes. Exponential backoff applied between polls. [TIER-1:TCS=3]
    - [ ] Implement: configurable `pollIntervalMs`, `maxWaitMs`, `Retry-After` parsing, jittered backoff. [TIER-1:TCS=3]
- [ ] Task: Update `TelemetryStore` to scrub `GEMINI_API_KEY` and `GCP_*` vars from all outputs. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Write failing test: telemetry payload containing `GEMINI_API_KEY` value is redacted to `[REDACTED]`. [TIER-1:TCS=3]
    - [ ] Implement scrubbing logic. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Shared Infrastructure (Oracle)' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 3: Provider Implementations
- [ ] Task: Implement `GeminiApiDeepResearchProvider` (AI Studio, `GEMINI_API_KEY`). [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Write failing tests: missing key → `ResearchProviderUnavailableError`. Successful query maps output to `IResearchSource[]` with `content`. Polling calls `AsyncLongPoller`. [TIER-1:TCS=3]
    - [ ] Implement: use `GeminiInteractionsClient`, `AsyncLongPoller`, map `interaction.outputs` to `IResearchSource[]`. [TIER-1:TCS=3]
- [ ] Task: Implement `VertexAiDeepResearchProvider` (Vertex AI ADC, `GCP_PROJECT_ID` + `GCP_LOCATION`). [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Write failing tests: missing `GCP_PROJECT_ID` → `ResearchProviderUnavailableError`. Successful Vertex AI query maps output. `GCP_LOCATION` defaults to `us-central1` when absent. [TIER-1:TCS=3]
    - [ ] Implement: same pattern as above but with `vertexai: true` init. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Provider Implementations' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 4: Registry & Agent-Config Wiring
- [ ] Task: Update `ResearchProviderRegistry.resolve()` to support both new providers and accept `options?: { apiKey?: string }`. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Write failing tests: `resolve('gemini-api-deep-research')` returns `GeminiApiDeepResearchProvider`. `resolve('vertex-ai-deep-research')` returns `VertexAiDeepResearchProvider`. `resolve('unknown-provider')` throws. [TIER-1:TCS=3]
    - [ ] Implement: register both providers. [TIER-1:TCS=3]
- [ ] Task: Wire provider key from `agent-config.md` through to `ResearchProviderRegistry.resolve()` at all call sites. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Write failing test: `agent-config.md` with `Research Provider: gemini-api-deep-research` correctly instantiates the new provider end-to-end in `ResearchExecutor`. [TIER-1:TCS=3]
    - [ ] Implement: update config reader/resolver to pass the key through. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Registry & Agent-Config Wiring' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 5: Integration & Finalization
- [ ] Task: Integrate track 'gemini_api_deep_research_20260728' into main branch. [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=3]
