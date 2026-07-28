# Track Specification: Deep Research Integration

**Track ID:** deep_research_integration_20260728  
**Type:** Feature  
**Status:** Draft  
**Created:** 2026-07-28

---

## Overview

Integrate a Deep Research phase into the Superconductor planning lifecycle. When triggered, the planning agent collaboratively brainstorms research queries with the user, executes them via the Antigravity Deep Research skill, and receives structured `ResearchBrief` artifacts — covering GitHub OSS discovery, academic white papers, existing Superconductor skills, and community patterns — before any spec or plan is generated. Research results are stored per-track and keyholed into implementor context throughout execution.

---

## Architectural Committee Recommendations

### Dreamer (Architecture)
- **Phase placement:** `PHASE_RESEARCH` runs *after* intent parsing but *before* `spec.md` generation.
- **Data model:** A typed `ResearchBrief` (executiveSummary, keyFindings[], recommendedPatterns[], antiPatterns[], artifactPointers[]).
- **Context strategy:** Map-Reduce pipeline — parallel search → per-source summaries → unified `ResearchBrief`. Raw artifacts in `tracks/<id>/research/` for lazy-loading.
- **Execution model:** Async at system level (subagent-dispatched), synchronous at track level.
- **Query formulation:** Hybrid — LLM generates queries constrained to 3 mandatory dimensions (OSS, academic, ecosystem). User fine-tunes before dispatch.
- **Caching:** Per-track semantic cache in `.superconductor/cache/research/`. >85% similarity reuses cached brief.

### Reviewer (Security & Performance)
- **Prompt injection:** All research output treated as untrusted. Enclosed in `<untrusted_research_results>` XML tags. Sanitizer strips injection keywords.
- **Latency:** Research executes asynchronously. Track transitions to `RESEARCHING` state.
- **Rate limiting:** Exponential backoff + jitter. Circuit breaker falls back to standard web search on sustained 429s.
- **Source quality:** GitHub requires >=100 stars + commits within 12 months. Permissive licenses only (MIT, Apache-2.0, BSD). GPL/AGPL blocked.
- **Cost guard:** Hard cap of 3 deep research queries per track.
- **Storage:** Only sanitized Markdown summaries persisted. Raw payloads purged after synthesis.
- **Compliance:** Summarization prompts only. No verbatim extraction.

---

## Research Notes

*Source: Best Practices Research Agent — 2026-07-28*

Modern agentic research uses Plan-Execute-Verify-Replan loops. Key reference implementations:
- **GPT Researcher** (assafelovic/gpt-researcher) — industry-standard Planner/Executor multi-agent pattern
- **LangChain Open Deep Research** (langchain-ai/open_deep_research) — stateful graph with reflection loops
- **Tongyi DeepResearch** (Alibaba-NLP/DeepResearch) — advanced multi-step query decomposition

Key Papers: RAP (Kagaya et al., 2024), ExRAP (2024/2025), RaDA (2024).

Critical pitfalls: over-breadth, over-specificity, context degradation, source poisoning.

---

## Functional Requirements

### FR-1: Interactive Research Trigger
During planning phase, Dreamer MUST ask: "Would you like me to run Deep Research before generating the spec?" If yes → `PHASE_RESEARCH`. If no → standard Best Practices Research only.

### FR-2: Collaborative Query Formulation
Present 3-5 draft queries (one per mandatory dimension: OSS, academic, ecosystem, community, skills-check). User can edit/remove/add. Maximum 8 queries per track.

### FR-3: Async Research Execution  
Queries dispatched to `ResearchExecutor` subagent. Track transitions to `RESEARCHING`. Planning agent waits via `schedule` callback (timeout: 10 minutes).

### FR-4: ResearchBrief Schema
```typescript
interface ResearchBrief {
  trackId: string;
  generatedAt: string;
  queriesExecuted: string[];
  executiveSummary: string;  // <= 400 words
  keyFindings: {
    category: "OSS_DISCOVERY" | "WHITE_PAPER" | "ARCHITECTURAL_PATTERN" | "SECURITY_CONSIDERATION" | "COMMUNITY_PATTERN";
    insight: string;
    confidenceScore: number;
    sourceUri: string;
    licenseType?: string;
    stars?: number;
    lastCommit?: string;
  }[];
  recommendedPatterns: string[];
  antiPatterns: string[];
  skillsAlreadyInstalled: string[];
  artifactPointers: string[];
}
```

### FR-5: Artifact Storage
- Full ResearchBrief: `superconductor/tracks/<id>/research/brief.json`
- Per-source summaries: `superconductor/tracks/<id>/research/<source_slug>.md`
- Summary injected into `spec.md` under `## Research Context`

### FR-6: Implementor Keyhole Injection
Implementors receive: `executiveSummary` + domain-relevant `keyFindings[]` only. NOT full brief.

### FR-7: Reviewer Context Injection
Adversarial and Correctness reviewers in QuorumReviewLoop receive `recommendedPatterns` and `antiPatterns` as mandatory review criteria.

### FR-8: Per-Track Cache
Cache at `.superconductor/cache/research/<query_hash>.json`. Reused if semantic similarity >85%. `--refresh` bypasses.

### FR-9: Source Quality Gate
- GitHub: >=100 stars, last commit <=12 months, license in {MIT, Apache-2.0, BSD-2, BSD-3}
- Papers: arXiv, ACL, NeurIPS, ICML, ICLR, or cited >=5 times
- Community: StackOverflow accepted answers or docs.* official domains

### FR-10: Cost Guard
Hard cap: 3 deep research API calls per track. User-approved before dispatch.

---

## Non-Functional Requirements

- **Latency:** Research MUST NOT block UI thread. Async subagent, 10-min timeout.
- **Security:** All research output untrusted. XML-isolated. Sanitized before prompt injection.
- **Compliance:** Summarization-only. No verbatim extraction. GPL/AGPL blocked.
- **Observability:** Queries, sources, cache hits/misses logged to TelemetryStore.
- **Testability:** ResearchExecutor and ResearchBriefSynthesizer unit-testable with mocked APIs.
- **Graceful degradation:** Falls back to standard web search if Deep Research API unavailable.
- **Modularity:** `ResearchProvider` interface required. `GoogleDeepResearchProvider` is default. Pluggable for Perplexity, Exa, OpenAI Deep Research, custom RAG. Provider selection via `superconductor/agent-config.md`.

---

## Acceptance Criteria

- [ ] AC-1: Dreamer asks user whether to run Deep Research during planning phase
- [ ] AC-2: User can review and edit research queries before dispatch (max 8)
- [ ] AC-3: Research executes asynchronously; track transitions to RESEARCHING state
- [ ] AC-4: ResearchBrief schema validated (TypeScript interface + zod schema)
- [ ] AC-5: Full brief saved to research/brief.json, per-source files in research/*.md
- [ ] AC-6: spec.md contains Research Context section with executive summary
- [ ] AC-7: Implementors receive keyholed findings (not full brief)
- [ ] AC-8: Quorum reviewers receive recommendedPatterns / antiPatterns as review criteria
- [ ] AC-9: GitHub sources pass star/activity/license gate before inclusion
- [ ] AC-10: Cost cap of 3 queries per track enforced with user confirmation
- [ ] AC-11: Cache hit/miss logged; --refresh flag bypasses cache
- [ ] AC-12: Falls back to web search if Deep Research API unavailable
- [ ] AC-13: All research output enclosed in XML isolation before prompt injection
- [ ] AC-14: Unit tests >= 80% coverage on ResearchExecutor and ResearchBriefSynthesizer
- [ ] AC-15: ResearchProvider interface defined with execute() contract
- [ ] AC-16: GoogleDeepResearchProvider implements interface as default
- [ ] AC-17: Provider swappable via config without code changes

---

## Out of Scope

- Real-time collaborative query editing
- Video/image research sources
- Automatic code import from GitHub repos
- Deep Research for review phases
- Multi-track research sharing
