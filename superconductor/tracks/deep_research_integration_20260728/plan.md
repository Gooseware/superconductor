# Implementation Plan: deep_research_integration_20260728
# Deep Research Integration into Superconductor Planning Phase

## Phase 0: Swarm Preflight [checkpoint: a30f59f]

- [x] Task: Verify swarm-execute skill is installed and baseline tests pass 3709a86 [TIER-1] [AGENT:superconductor-processor]
    - [ ] Check skills/swarm-execute/SKILL.md exists
    - [ ] Check skills/new-track/SKILL.md exists
    - [ ] Confirm QuorumReviewLoop and KeyholeFeedbackExtractor are importable
    - [ ] Run npm test -w packages/engine -w packages/superconductor-core — must be green before any work starts
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' 3709a86 (Protocol in workflow.md)

---

## Phase 1: Contracts & Refactor [checkpoint: b261115]

- [x] Task: Define shared research type contracts a6cd23c [TIER-3] [AGENT:superconductor-dreamer]
    - [ ] Create packages/engine/src/research/types.ts
    - [ ] Define IResearchQuery, IResearchSource, IResearchBrief, IResearchProvider, IContextInjector<T> interfaces
    - [ ] Define ResearchFinding with category union type
    - [ ] Add Zod schema for ResearchBrief validation (ResearchBriefSchema)
    - [ ] Write tests: schema rejects malformed brief, accepts valid brief
- [x] Task: Extract InputSanitizer from aggregate-findings.ts a6cd23c [TIER-3] [AGENT:superconductor-processor]
    - [ ] Read packages/superconductor-core/src/review/aggregate-findings.ts
    - [ ] Extract into packages/superconductor-core/src/utils/input-sanitizer.ts with sanitizeId(), sanitizePath(), sanitizeUntrustedText()
    - [ ] Update aggregate-findings.ts to import from shared utility (no behavior change)
    - [ ] Write unit tests including adversarial inputs
    - [ ] Confirm existing tests still pass (207+361)
- [x] Task: Refactor KeyholeFeedbackExtractor to KeyholeContextManager dc38a61
    - [ ] Read aggregate-findings.ts — understand KeyholeFeedbackExtractor API
    - [ ] Extend into KeyholeContextManager<T> generic class with extractReviewFeedback() and injectResearchContext()
    - [ ] Implement injectResearchContext: filters brief.keyFindings to workUnit.domain, appends executiveSummary + domain findings as workUnit.researchContext
    - [ ] Maintain full backward compatibility for all existing callers
    - [ ] Write tests: injection adds only domain-relevant findings, full brief not leaked cross-domain
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Contracts & Refactor' (Protocol in workflow.md)

---

## Phase 2: Core Foundations [checkpoint: 3e21a37]

- [x] Task: Implement generic SemanticCache<T> dc38a61
    - [ ] Create packages/superconductor-core/src/cache/semantic-cache.ts
    - [ ] Constructor: SemanticCache<T>(namespace: string, similarityThreshold = 0.85)
    - [ ] Storage: .superconductor/cache/<namespace>/<query_hash>.json
    - [ ] Methods: get(), set(), invalidate()
    - [ ] Deterministic hash-based similarity for MVP (no embedding API required)
    - [ ] Write tests: cache miss returns null, hit returns value, namespace isolation, --refresh bypass
- [x] Task: Add RESEARCHING state to WorkUnitStateMachine 6f2a8d4
    - [ ] Read packages/superconductor-core/src/track/work-unit.ts
    - [ ] Add RESEARCHING = 'RESEARCHING' to WorkUnitState enum
    - [ ] Add valid transitions: PENDING->RESEARCHING, RESEARCHING->IN_PROGRESS, RESEARCHING->FAILED
    - [ ] Add researchContext?: ResearchBriefSummary field to WorkUnit interface
    - [ ] Update WorkUnitStateMachine.transition() guard for new transitions
    - [ ] Write tests: valid transitions succeed, invalid (RESEARCHING->DONE) throws
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Core Foundations' (Protocol in workflow.md)

---

## Phase 3: Research Engine [checkpoint: ]

- [ ] Task: Implement ResearchQueryFormulator [TIER-3] [AGENT:superconductor-processor]
    - [ ] Create packages/engine/src/research/query-formulator.ts
    - [ ] formulate(trackDescription: string, maxQueries = 8): ResearchQueryDraft[]
    - [ ] Always generate >=1 query per mandatory dimension: OSS, academic, ecosystem, SC skills, community
    - [ ] Returns structured ResearchQueryDraft[] with dimension, query, rationale
    - [ ] Write tests: always produces >=3 queries, never exceeds maxQueries
- [ ] Task: Implement ResearchSourceQualityGate [TIER-3] [AGENT:superconductor-processor]
    - [ ] Create packages/engine/src/research/source-quality-gate.ts
    - [ ] GitHub: >=100 stars, last commit <=12 months, license in {MIT, Apache-2.0, BSD-2, BSD-3}
    - [ ] Papers: arXiv, ACL, NeurIPS, openreview.net domains
    - [ ] Community: stackoverflow.com, docs.*, MDN
    - [ ] Returns { passed: boolean, reason?: string } per source
    - [ ] Write tests: GPL blocked, abandoned blocked, fresh MIT passes, arxiv passes
- [ ] Task: Implement GoogleDeepResearchProvider [TIER-4] [AGENT:superconductor-processor]
    - [ ] Create packages/engine/src/research/providers/google-deep-research-provider.ts
    - [ ] Implements IResearchProvider interface
    - [ ] Executes via search_web tool per query
    - [ ] Results through ResearchSourceQualityGate before inclusion
    - [ ] All output wrapped in <untrusted_research_results> XML
    - [ ] All text through InputSanitizer.sanitizeUntrustedText()
    - [ ] Exponential backoff + jitter (max 3 retries)
    - [ ] Circuit breaker: 3 consecutive failures -> ResearchProviderUnavailableError
    - [ ] Write tests: quality gate filtering, XML wrapping, sanitizer called, backoff on failure
- [ ] Task: Implement ResearchBriefSynthesizer (LLM Map-Reduce) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Create packages/engine/src/research/brief-synthesizer.ts
    - [ ] synthesize(rawResults: IResearchSource[]): Promise<IResearchBrief>
    - [ ] Map: per-source LLM summarization into structured finding
    - [ ] Filter: drop findings with confidenceScore < 0.6
    - [ ] Reduce: LLM synthesis into executiveSummary (<=400 words), recommendedPatterns[], antiPatterns[]
    - [ ] Chunked artifact files saved to research/<source_slug>.md
    - [ ] Validate output against ResearchBriefSchema (Zod)
    - [ ] Write tests: malformed filtered, output validates schema, executiveSummary <=400 words
- [ ] Task: Implement ResearchProviderRegistry [TIER-2] [AGENT:superconductor-processor]
    - [ ] Create packages/engine/src/research/provider-registry.ts
    - [ ] Reads superconductor/agent-config.md for researchProvider config
    - [ ] Returns appropriate IResearchProvider implementation
    - [ ] Defaults to GoogleDeepResearchProvider
    - [ ] Write tests: default returns Google, unknown provider throws descriptive error
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Research Engine' (Protocol in workflow.md)

---

## Phase 4: Orchestration Integration [checkpoint: ]

- [ ] Task: Add ResearchExecutor orchestration service [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Create packages/engine/src/research/research-executor.ts
    - [ ] execute(trackId, queries, provider): Promise<IResearchBrief>
    - [ ] Check SemanticCache first — return cached brief if hit
    - [ ] Enforce cost cap: throw ResearchBudgetExceededError if >3 queries per track
    - [ ] Transition track WorkUnit to RESEARCHING state before dispatch
    - [ ] On success: pass through BriefSynthesizer, save brief.json + *.md artifacts, update cache
    - [ ] On unavailable: fall back to standard search_web, log degraded mode
    - [ ] Write tests: cache hit skips provider, cost cap enforced, fallback on unavailable, artifacts saved
- [ ] Task: Integrate research phase into new-track SKILL.md [TIER-3] [AGENT:superconductor-processor]
    - [ ] Read skills/new-track/SKILL.md
    - [ ] Add section 2.0.4 Deep Research Phase (Interactive) between 2.0.3 and 2.0.5
    - [ ] Step 1: Ask user if they want Deep Research (yesno)
    - [ ] Step 2 (if yes): Present draft queries from ResearchQueryFormulator, allow edit (max 8)
    - [ ] Step 3: Confirm cost estimate before dispatch
    - [ ] Step 4: Execute via ResearchExecutor (async subagent)
    - [ ] Step 5: Inject executiveSummary into spec.md Research Context section
    - [ ] Skipped if --fast or --lite flags present
- [ ] Task: Inject ResearchBrief into implementor work unit context [TIER-3] [AGENT:superconductor-processor]
    - [ ] Update packages/engine/src/cli/orchestrate.ts to load research/brief.json when present
    - [ ] Call KeyholeContextManager.injectResearchContext(workUnit, brief) before dispatch
    - [ ] Verify keyholing: only domain-relevant findings injected
    - [ ] Write tests: auth domain receives only auth findings, not UI findings
- [ ] Task: Inject recommendedPatterns/antiPatterns into QuorumReviewLoop reviewer context [TIER-3] [AGENT:superconductor-processor]
    - [ ] Update packages/engine/src/verification/quorum-review-loop.ts to accept optional researchBrief?: IResearchBrief
    - [ ] When present, append to reviewer context: "Research mandated these patterns: [...]. Flag any deviation as CRITICAL."
    - [ ] Write tests: reviewer context includes patterns when brief provided, omits when absent
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Orchestration Integration' (Protocol in workflow.md)

---

## Phase 5: Skills & Documentation [checkpoint: ]

- [ ] Task: Update swarm-execute SKILL.md with research phase docs [TIER-2] [AGENT:superconductor-processor]
    - [ ] Add Research Context section documenting: implementor keyholing, reviewer patterns, view_file brief.json
- [ ] Task: Add researchProvider config to superconductor/agent-config.md [TIER-1] [AGENT:superconductor-processor]
    - [ ] Add researchProvider: google default entry
    - [ ] Document available values and custom provider interface
- [ ] Task: Fix .gitignore to exclude lock files and research cache [TIER-1] [AGENT:superconductor-processor]
    - [ ] Add packages/engine/.superconductor/locks_*/ to .gitignore
    - [ ] Add .superconductor/cache/ to .gitignore
    - [ ] Run git rm -r --cached packages/engine/.superconductor/ to untrack 1,355 tracked lock files
    - [ ] Commit: chore: Untrack test lock files and research cache from git
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Skills & Documentation' (Protocol in workflow.md)

---

## Phase 6: Integration & Finalization [checkpoint: ]

- [ ] Task: Full regression test suite [TIER-3] [AGENT:superconductor-reviewer]
    - [ ] npm test -w packages/engine -w packages/superconductor-core
    - [ ] All 207+361 existing tests still pass
    - [ ] New tests bring coverage >= 80% for all new modules
- [ ] Task: End-to-end integration smoke test [TIER-4] [AGENT:superconductor-oracle]
    - [ ] Write E2E test: simulate new-track flow with mocked research provider
    - [ ] Verify: RESEARCHING state entered, brief.json written, spec.md has Research Context, implementor WorkUnit has research context, QuorumReviewLoop receives patterns
- [ ] Task: Integrate track 'deep_research_integration_20260728' into main branch. [TIER-1] [AGENT:superconductor-processor]

---

## Swarm Blueprint

| Wave | Tasks | Model Tier | Agent Role |
|------|-------|-----------|------------|
| 1 | Type contracts, InputSanitizer extraction | TIER-3 | dreamer + processor |
| 2 | KeyholeContextManager refactor, SemanticCache | TIER-3/4 | dreamer |
| 3 | WorkUnit RESEARCHING state | TIER-3 | processor |
| 4 | QueryFormulator, SourceQualityGate | TIER-3 | processor |
| 5 | GoogleDeepResearchProvider, BriefSynthesizer | TIER-4 | dreamer + processor |
| 6 | ProviderRegistry, ResearchExecutor | TIER-4 | dreamer |
| 7 | new-track SKILL integration, orchestrate.ts wiring | TIER-3 | processor |
| 8 | QuorumReviewLoop context injection | TIER-3 | processor |
| 9 | Docs, gitignore, agent-config | TIER-1/2 | processor |
| 10 | Full regression, E2E, integration | TIER-3/4 | reviewer + oracle |

*Estimated: 10 waves · Oracle every 3 tasks · ~6 implementor agents parallel at peak*
