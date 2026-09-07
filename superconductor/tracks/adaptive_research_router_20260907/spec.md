# Specification: Adaptive Multi-Tier Research Router & DeerFlow MCP Integration

**Track ID:** `adaptive_research_router_20260907`  
**Type:** Feature  
**Status:** Approved  
**Target Branch:** `main`  
**Track Branch:** `track/adaptive_research_router_20260907`  

---

## 1. Overview

AI coding swarms often fall into the trap of re-inventing the wheel — implementing custom regular expressions, hand-rolled parsers, ad-hoc state machines, or home-grown retry logic when robust, battle-tested open-source libraries already exist. Additionally, when encountering unexpected errors, regressions, or library idiosyncrasies, agents frequently guess with speculative edits rather than consulting deep community research.

This track implements the **Adaptive Multi-Tier Research Router** and integrates **DeerFlow 2.0 MCP** into Superconductor. The system intelligently classifies research intent (Internal Codebase vs. Ecosystem Discovery vs. Exhaustive Frontier Cloud Reasoning), enforces a strict **Prior-Art & Anti-Reinvention Gate** before specifications are generated, provides multi-turn conversational remediation research via `deerflow_chat`, and maintains high resilience through credential-aware circuit breakers and fallbacks.

---

## 2. Architecture Committee Recommendations

### Dreamer Role (Decoupling & System Design)
- Implement `AdaptiveResearchRouter` in `packages/engine/src/research/adaptive-research-router.ts` as an orchestrator decoupled from underlying transport.
- Introduce `DeerflowResearchProvider` implementing `IResearchProvider` (`packages/engine/src/research/providers/deerflow-research-provider.ts`), integrating seamlessly with `ResearchProviderRegistry`.
- Standardize the `ResearchBrief` schema to ensure `OSS_DISCOVERY` and `ANTI_PATTERNS` sections are first-class citizens.

### Reviewer Role (Security, Performance & Resilience)
- **SSRF & URL Containment:** Validate that custom DeerFlow endpoints strictly match authorized local addresses (`http://127.0.0.1:2026` or localhost) unless explicitly whitelisted.
- **Credential Protection:** The router MUST strictly guard `GEMINI_API_KEY`, verifying its presence before routing to Gemini Deep Research and ensuring keys are never logged in research artifacts.
- **Circuit Breaker:** Enforce an automated circuit breaker (tripping after 2 consecutive errors with a 60-second cooldown) to guarantee the swarm never stalls when external or local containers are unavailable.
- **Data Sanitization:** Pass all external research outputs through `sanitizeUntrustedText` to prevent prompt injection from untrusted web pages.

---

## 3. Research Notes & Prior Art

1. **DeerFlow 2.0 (MCP & Local Docker):**
   - Connects to `http://127.0.0.1:2026` via MCP tools (`deerflow_research`, `deerflow_chat`, `deerflow_status`).
   - Provides autonomous subagent web synthesis, source citation, and multi-turn conversational threads without consuming cloud API tokens.
2. **Gemini Deep Research API:**
   - Provides high-tier cloud reasoning for exhaustive frontier topics, but requires a valid `GEMINI_API_KEY`.
3. **Ecosystem Discovery:**
   - Rather than asking general questions, research queries specifically target package registries (npm/crates/PyPI) to identify top libraries, weekly downloads, maintenance metrics, and known CVEs.

---

## 4. Ecosystem Alignment & Prior Art (Anti-Reinvention Gate)

- **Approved Dependencies:**
  - `@superconductor/core` & `@superconductor/engine` existing internal modules.
  - Native `fetch` / `child_process` / MCP client bridges.
  - Zod / TypeBox schema validators.
- **Anti-Patterns & Traps to Avoid:**
  - DO NOT write custom web scrapers or raw HTTP crawlers; use existing MCP bridges.
  - DO NOT hard-code provider selection; route dynamically through `AdaptiveResearchRouter`.
  - DO NOT block or throw uncaught exceptions if a provider is offline; gracefully degrade across the fallback chain.

---

## 5. Functional Requirements

- **FR-1 (Adaptive Research Router):** Create `AdaptiveResearchRouter` that evaluates query intent (`INTERNAL`, `ECOSYSTEM`, `FRONTIER`), respects user configuration in `superconductor/agent-config.md` and CLI flags (`--research`, `--exhaustive`), and dispatches to the optimal provider.
- **FR-2 (DeerFlow Research Provider):** Implement `DeerflowResearchProvider` conforming to `IResearchProvider`, supporting execution modes (`pro`, `ultra`, `flash`), response normalization into `IResearchSource`, and multi-turn threads via `deerflow_chat`.
- **FR-3 (Provider Registry Integration):** Register `deerflow` in `ResearchProviderRegistry` and support configuration via `agent-config.md` (`researchProvider: 'deerflow'`).
- **FR-4 (Prior-Art & Anti-Reinvention Gate):** Integrate ecosystem discovery into `skills/new-track/SKILL.md` (and Dreamer planning). Generate structured `ResearchBrief` with `OSS_DISCOVERY`, injecting `Approved Ecosystem Dependencies` into `spec.md`.
- **FR-5 (Remediation Deep Research):** Connect `DeepResearchEscalationHandler` to the research router, providing error traces and diffs to DeerFlow and handling policy decisions with interactive prompter.
- **FR-6 (Resilient Circuit Breaker & Fallback):** Implement a 2-strike circuit breaker with automatic fallback: DeerFlow $\to$ Gemini Deep Research (if `GEMINI_API_KEY` exists) $\to$ `search_web`.

---

## 6. Non-Functional Requirements

- **NFR-1 (Zero-Crash Guarantee):** Provider errors, connection timeouts, or offline Docker containers must never crash the active swarm or block task completion.
- **NFR-2 (Performance):** Intent classification must complete in $<5$ms; provider circuit breaker check must take $<2$ms.
- **NFR-3 (Test Coverage):** Comprehensive unit, integration, and E2E coverage $>85\%$ across all new research modules.

---

## 7. Acceptance Criteria

- **AC-1:** `AdaptiveResearchRouter` accurately classifies query intents and honors user configuration and CLI overrides.
- **AC-2:** `DeerflowResearchProvider` successfully calls DeerFlow MCP/HTTP, parses findings into `IResearchSource[]`, and supports conversational queries via `deerflow_chat`.
- **AC-3:** `ResearchProviderRegistry.resolve('deerflow')` correctly instantiates `DeerflowResearchProvider`.
- **AC-4:** When `GEMINI_API_KEY` is missing, frontier queries automatically degrade to DeerFlow or `search_web` without throwing uncaught exceptions.
- **AC-5:** The Circuit Breaker trips after 2 consecutive connection failures and automatically recovers after a 60s cooldown.
- **AC-6:** Prior-Art & Anti-Reinvention Gate generates a valid `ResearchBrief` with `OSS_DISCOVERY` categories.
- **AC-7:** End-to-End test passes verifying the entire lifecycle: query $\to$ intent routing $\to$ DeerFlow research $\to$ fallback cascade $\to$ brief synthesis.

---

## 8. Out of Scope

- Hosting or deploying DeerFlow Docker containers (assumes external or local container managed by user).
- Modifying third-party MCP server schemas.
