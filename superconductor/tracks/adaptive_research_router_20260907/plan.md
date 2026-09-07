# Implementation Plan: Adaptive Multi-Tier Research Router & DeerFlow MCP Integration

**Track ID:** `adaptive_research_router_20260907`  
**Target Branch:** `main`  
**Track Branch:** `track/adaptive_research_router_20260907`  

---

## Swarm Blueprint

### Topology Map & Model Tier Routing

| Phase | Description | Agents | Domain Scope | Models | Max Concurrency |
|---|---|---|---|---|---|
| 0 | Preflight Verification | setup | package.json, test cache | flash_lite | 1 |
| 1 | DeerFlow Provider & Registry | superconductor-processor | packages/engine/src/research/providers/, provider-registry.ts | flash | 2 |
| 2 | Adaptive Router & Circuit Breaker | superconductor-processor | packages/engine/src/research/adaptive-research-router.ts | flash | 2 |
| 3 | Anti-Reinvention Gate & Remediation | superconductor-processor | packages/engine/src/research/anti-reinvention-gate.ts, deep-research-escalation-handler.ts | flash | 2 |
| 4 | E2E Integration Suite | superconductor-processor | packages/engine/tests/e2e/, packages/superconductor-core/tests/e2e/ | flash | 1 |
| 5 | Integration & Finalization | setup | superconductor/tracks.md | flash_lite | 1 |

---

## Phase 0: Swarm Preflight

- [x] Task: Verify preflight test baseline is green [TIER-1:TCS=1] [AGENT:setup]
    CREATES: .superconductor/preflight-cache.json
    PROTECTED: package.json
    INVARIANT_AFTER: "Preflight tests MUST be green before implementation starts."
    - [x] Run npm test -- --run and verify 100% green [TIER-1:TCS=1]
    - [x] Cache preflight report [TIER-1:TCS=1]

- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 1: DeerFlow Provider & Provider Registry Integration

- [ ] Task: Implement DeerflowResearchProvider with MCP & HTTP bridges [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/engine/src/research/providers/deerflow-research-provider.ts, packages/engine/src/research/providers/__tests__/deerflow-research-provider.test.ts
    PROTECTED: packages/engine/src/research/types.ts
    INVARIANT_AFTER: "DeerflowResearchProvider MUST parse markdown findings into IResearchSource objects."
    - [ ] Write unit tests for DeerflowResearchProvider with mocked MCP and HTTP responses [TIER-1:TCS=2]
    - [ ] Implement DeerflowResearchProvider supporting modes (pro, ultra, flash) and source normalization [TIER-1:TCS=3]
    - [ ] Implement multi-turn conversational querying via deerflow_chat [TIER-1:TCS=2]
    - [ ] Verify test suite and coverage [TIER-1:TCS=2]

- [ ] Task: Register deerflow provider in ResearchProviderRegistry and AgentConfigReader [TIER-2:TCS=2] [AGENT:superconductor-processor]
    CREATES: packages/engine/src/research/__tests__/provider-registry.test.ts
    PROTECTED: packages/engine/src/research/provider-registry.ts, packages/engine/src/research/agent-config-reader.ts
    INVARIANT_AFTER: "ResearchProviderRegistry MUST resolve deerflow provider cleanly."
    - [ ] Write unit tests verifying provider resolution for 'deerflow' and 'deerflow-2' [TIER-1:TCS=2]
    - [ ] Wire DeerflowResearchProvider into ResearchProviderRegistry [TIER-1:TCS=2]
    - [ ] Support researchProvider: 'deerflow' in agent-config-reader [TIER-1:TCS=2]
    - [ ] Verify test suite and coverage [TIER-1:TCS=1]

- [ ] Task: Superconductor - User Manual Verification 'Phase 1: DeerFlow Provider Integration' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 2: Adaptive Research Router & Circuit Breaker Fallback

- [ ] Task: Implement AdaptiveResearchRouter with intent classification and credential awareness [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/engine/src/research/adaptive-research-router.ts, packages/engine/src/research/__tests__/adaptive-research-router.test.ts
    PROTECTED: packages/engine/src/research/research-executor.ts
    INVARIANT_AFTER: "AdaptiveResearchRouter MUST verify GEMINI_API_KEY before routing to Gemini Deep Research."
    - [ ] Write unit tests for intent classification (INTERNAL, ECOSYSTEM, FRONTIER) [TIER-1:TCS=2]
    - [ ] Implement user control hierarchy (agent-config.md settings and CLI overrides) [TIER-1:TCS=2]
    - [ ] Implement credential verification gate for GEMINI_API_KEY with auto-fallback [TIER-1:TCS=2]
    - [ ] Verify test suite and coverage [TIER-1:TCS=2]

- [ ] Task: Implement 2-strike Circuit Breaker with automatic multi-tier fallback [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/engine/src/research/circuit-breaker.ts, packages/engine/src/research/__tests__/circuit-breaker.test.ts
    PROTECTED: packages/engine/src/research/adaptive-research-router.ts
    INVARIANT_AFTER: "Circuit breaker MUST trip after 2 failures and recover after 60s cooldown."
    - [ ] Write unit tests for circuit breaker trip, open, half-open, and recovery states [TIER-1:TCS=2]
    - [ ] Implement circuit breaker wrapping DeerFlow and external endpoints [TIER-1:TCS=2]
    - [ ] Connect fallback cascade: DeerFlow -> Gemini Deep Research -> search_web [TIER-1:TCS=2]
    - [ ] Verify test suite and coverage [TIER-1:TCS=2]

- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Adaptive Router & Resilience' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 3: Prior-Art Anti-Reinvention Gate & Remediation Escalation

- [ ] Task: Implement Prior-Art Anti-Reinvention Gate for track planning [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/engine/src/research/anti-reinvention-gate.ts, packages/engine/src/research/__tests__/anti-reinvention-gate.test.ts
    PROTECTED: skills/new-track/SKILL.md
    INVARIANT_AFTER: "Anti-reinvention gate MUST emit OSS_DISCOVERY dependencies into ResearchBrief."
    - [ ] Write unit tests for extracting ecosystem packages and emitting locked dependency sections [TIER-1:TCS=2]
    - [ ] Implement AntiReinventionGate extracting top OSS libraries and known traps [TIER-1:TCS=3]
    - [ ] Wire AntiReinventionGate into skills/new-track/SKILL.md research phase [TIER-1:TCS=2]
    - [ ] Verify test suite and coverage [TIER-1:TCS=2]

- [ ] Task: Connect DeepResearchEscalationHandler to research router with multi-turn chat [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/remediation/__tests__/deep-research-escalation-router.test.ts
    PROTECTED: packages/superconductor-core/src/remediation/deep-research-escalation-handler.ts
    INVARIANT_AFTER: "DeepResearchEscalationHandler MUST feed failure traces and diffs into the research router."
    - [ ] Write unit tests for multi-turn remediation research using diagnostic payloads [TIER-1:TCS=2]
    - [ ] Update DeepResearchEscalationHandler to route through AdaptiveResearchRouter [TIER-1:TCS=3]
    - [ ] Implement interactive policy confirmation when breaking changes or CVEs are detected [TIER-1:TCS=2]
    - [ ] Verify test suite and coverage [TIER-1:TCS=2]

- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Anti-Reinvention & Remediation' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 4: End-to-End Integration Suite & CLI Verification

- [ ] Task: Implement End-to-End Adaptive Research & Fallback Integration Test Suite [TIER-2:TCS=2] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/tests/e2e/adaptive-research-e2e.test.ts
    PROTECTED: packages/superconductor-core/tests/e2e/
    INVARIANT_AFTER: "E2E suite MUST verify full lifecycle: intent classification -> research dispatch -> brief synthesis -> dependency lock."
    - [ ] Write E2E test exercising track inception research -> brief generation -> locked dependencies [TIER-1:TCS=2]
    - [ ] Write E2E test verifying circuit breaker fallback when DeerFlow is offline [TIER-1:TCS=2]
    - [ ] Run global test suite to verify 100% green [TIER-1:TCS=2]

- [ ] Task: Superconductor - User Manual Verification 'Phase 4: E2E Verification' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 5: Integration & Finalization

- [ ] Task: Integrate track 'adaptive_research_router_20260907' into main branch [TIER-1:TCS=2] [AGENT:setup]
    CREATES: superconductor/tracks.md
    PROTECTED: .git/
    INVARIANT_AFTER: "Track branch MUST be merged cleanly into main without regressions."

- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=4]
