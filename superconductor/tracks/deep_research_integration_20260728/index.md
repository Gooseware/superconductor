# Track: deep_research_integration_20260728

**Title:** Deep Research Integration  
**Type:** Feature | **Status:** PLANNING  
**Created:** 2026-07-28

## Links

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Metadata](./metadata.json)

## Summary

Integrates a collaborative deep research phase into the Superconductor planning lifecycle. The planning agent presents draft queries to the user for fine-tuning, executes them via the pluggable `ResearchProvider` abstraction (Google Deep Research by default), and injects structured `ResearchBrief` context into spec generation, implementor keyhole context, and quorum reviewer mandatory criteria.

## Key Components

- `IResearchProvider` interface + `GoogleDeepResearchProvider` (default)
- `ResearchQueryFormulator` — LLM-driven multi-dimensional query generation
- `ResearchBriefSynthesizer` — Map-Reduce pipeline from raw results to structured brief
- `ResearchSourceQualityGate` — star/activity/license filtering for GitHub + papers
- `SemanticCache<T>` — generic per-namespace semantic cache
- `KeyholeContextManager<T>` — extended from KeyholeFeedbackExtractor for research injection
- `ResearchExecutor` — orchestration with cost cap, async dispatch, fallback

## Oracle Recommendations

- Extract `InputSanitizer` from `aggregate-findings.ts` before building new sanitizer (DRY)
- Refactor `KeyholeFeedbackExtractor` → `KeyholeContextManager<T>` (generic, reusable)
- `SemanticCache<T>` designed as generic utility for future review/lint result caching
