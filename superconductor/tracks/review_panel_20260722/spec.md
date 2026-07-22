# Track Specification: Review Panel Mode with Coverage-Aware Residual Passes

## Overview

Implement a **Review Panel Mode** within the `swarm-orchestrate` skill that replaces the current single-reviewer Oracle phase with a structured multi-agent review pipeline. This pipeline combines:

1. A **deterministic pre-filter** (LSP/AST/static analysis) to eliminate noise before any LLM token is spent
2. A **specialized heterogeneous Flash panel** (parallel, isolated) with **Coverage Manifests**
3. A **residual pass** directed at gaps in the aggregate coverage manifest
4. A **reasoning-model arbiter** (Pro/Sonnet Thinking) that synthesises findings and runs the adversarial audit

The architecture is grounded in the research synthesis from Verga et al. (2024), the Pyramid MoA cascade pattern, and the empirical observation that iterative attention-with-coverage-tracking outperforms both single-pass review and naive homogeneous quorums.

---

## Core Concepts

### Coverage Manifest
Every specialized reviewer outputs, alongside their findings, an explicit declaration of:
- **Examined:** Files, line ranges, and logical concerns they reviewed deeply
- **Skimmed:** Areas they touched but did not analyse thoroughly  
- **NOT examined:** Areas they explicitly skipped (residual for next pass)

The aggregate of all `NOT examined` lists becomes the **Residual Coverage Map** — the directive for the targeted residual pass.

### Cascade Deferral Gate
If the specialized Flash reviewers **all agree** (no findings or unanimous findings on a specific issue), that case is resolved at Flash cost. Only **divergent or high-severity findings** are escalated to the arbiter. This matches the Semantic Cascades architecture and targets 40–60% token savings vs. sending everything to a reasoning model.

---

## Research Basis

| Finding | Source | Implication |
|---|---|---|
| Homogeneous N×Flash: n_eff ≈ 2.5 even at N=9 | Kish ESS Analysis / arXiv:2605.29800 | Never replicate same model |
| Cascade saves 61% tokens vs. monolithic | Pyramid MoA (arXiv:2602.19509) | Use deferral gate |
| Specialized heterogeneous beats uniform quorum | Premasundera Thesis / Orq.ai 2026 | Different lenses per reviewer |
| Deterministic layer reduces token bloat 5–34× | Orq.ai 2026 Engineering Report | LSP/AST pre-filter mandatory |
| Cognitive collapse when reviewers see each other early | ACL Findings 2026 | Enforce isolation until manifests aggregated |
| Iterative attention-with-coverage-tracking (empirical) | User observation (7-pass review) | Formalise as Coverage Manifest + Residual Pass |

---

## Functional Requirements

### FR-0: JSON Schema Definitions (Pre-requisite)
Before any templates or scripts are written, two canonical JSON schemas must be defined and versioned:
- `schemas/coverage-manifest.schema.json` — `{ reviewer_id, examined[], skimmed[], not_examined[] }` each entry `{ file, line_range, concern }`
- `schemas/review-finding.schema.json` — `{ finding_id, reviewer_id, file, line_range, severity, category, description, recommendation, is_security_critical }` with enums for severity and category

All templates and extraction scripts reference these schemas as the single source of truth.

### FR-1: Reviewer Specialization Templates
Three specialized reviewer sub-prompts must be defined and stored as template files:
- `templates/reviewers/security-reviewer.md` — XSS, injection, auth, secrets, dependency vulnerabilities
- `templates/reviewers/correctness-reviewer.md` — edge cases, null paths, off-by-one, race conditions, spec alignment
- `templates/reviewers/adversarial-reviewer.md` — shenanigan checklist §4.1–§4.5 from `skills/review/SKILL.md`

Each template MUST include **two mandatory structured output contracts**:
- ` ```json:coverage-manifest ` fenced block (schema: `schemas/coverage-manifest.schema.json`)
- ` ```json:review-findings ` fenced block (schema: `schemas/review-finding.schema.json`)

Each template MUST also instruct the agent to write both blocks as JSON files to `superconductor/tracks/<track_id>/.manifests/`.

### FR-2: Deterministic Pre-Filter Stage
Before any LLM reviewer sees the diff, `scripts/deterministic-preflight.ts` MUST be executed by the agent (not suggested to the user):
- Detect primary language from `tech-stack.md`
- Execute the corresponding tool via `run_command` (TypeScript → `tsc --noEmit`, Python → `pyright`, Go → `go vet`, etc.)
- If no tool is detected for the language → write `{ status: "skipped" }` and proceed (never block on missing tool)
- Write `DiagnosticResult` JSON to `.manifests/preflight.json`
- If tool exits non-zero AND stderr contains error-level output → write `{ short_circuit: true }` → halt pipeline immediately with `Needs Fixes`

### FR-3: Parallel Isolated Reviewer Execution
- Each specialized reviewer runs in a **separate agent context** (no cross-contamination)
- Reviewers receive: the diff, deterministic tool output, and their specialization prompt
- Reviewers do NOT see each other's outputs until the aggregation step
- Execution: parallel fan-out (same pattern as existing swarm Processor phase)

### FR-4: Extraction, Aggregation & Deduplication
Two parallel extraction pipelines must run after all reviewers complete:

**Coverage Manifest Pipeline** (`scripts/aggregate-coverage-manifest.ts`):
- Tier 1: Extract ` ```json:coverage-manifest ` fenced block from agent output text via `scripts/extract-fenced-block.ts`
- Tier 2: Fallback — read `.manifests/<reviewer_id>.json` from disk
- Tier 3: Fail-safe — if both fail, mark reviewer as `not_examined: ["all files in diff"]` → guarantees residual pass
- Output: `ResidualCoverageMap` (union of all `not_examined`, deduplicated by `{file, line_range}`)

**Findings Pipeline** (`scripts/aggregate-findings.ts`):
- Tier 1: Extract ` ```json:review-findings ` fenced block from agent output text
- Tier 2: Fallback — read `.manifests/<reviewer_id>-findings.json` from disk
- Tier 3: Fail-safe — if both fail, escalate raw text to arbiter, never silently drop
- Deduplication: findings within ±3 lines of same file → merged, `reviewer_ids[]` unioned, `agreement_count` incremented

### FR-5: Targeted Residual Pass
- Dispatch a single additional Flash reviewer directed ONLY at the `ResidualCoverageMap` areas
- Prompt: "Examine ONLY these specific areas: [ResidualCoverageMap]. Do not re-examine areas already covered."
- This reviewer outputs both Coverage Manifest and Findings contracts
- Outputs merged into unified finding set via `aggregate-findings.ts`

### FR-6: Cascade Deferral Gate
Before invoking the reasoning-model arbiter:
- Check: do all reviewers agree on a finding? (unanimous) → include at stated severity
- Check: does finding appear in only 1 of N reviewers? → flag as `[disputed]`, include at one severity level lower
- Check: is any finding marked `[CRITICAL]` or `[Security]`? → bypass quorum, escalate immediately regardless of agreement
- If ALL findings are unanimous and none are disputed → offer user option to skip arbiter (token savings)

### FR-7: Reasoning-Model Arbiter
- Receives: diff, deterministic output, all reviewer findings (deduplicated), Coverage Manifest aggregate
- Runs: standard Oracle audit + adversarial audit (§6.0 Phase 2 from `skills/implement/SKILL.md`)
- Outputs: structured Oracle Audit Report + ABI Debrief answers (Q1/Q2/Q3)

### FR-8: Integration with `swarm-orchestrate`
- Add `review_panel` as a new execution mode in `swarm-orchestrate` (alongside existing `parallel` and `pipeline` modes)
- Mode selection: prompted to user alongside existing mode options
- Mode configuration stored in `swarm-config.json` alongside other swarm settings
- Backward compatible: existing single-reviewer Oracle path remains as default

### FR-9: Token Instrumentation & Efficiency Report
Each pipeline stage writes measured token counts to `.manifests/token-report.json`:
- Schema: `{ stage, model, input_tokens, output_tokens, cost_usd, timestamp }`
- `scripts/generate-token-report.ts` reads this file and outputs formatted markdown report
- Report includes: per-stage breakdown, findings per dollar, **actual** savings vs. single-arbiter baseline (not estimated)
- K/N threshold recommendation based on agreement rates observed in this run
- Token budget guardrail: if total cost would exceed 3× arbiter-only baseline, warn user and offer to skip to direct arbiter

---

## Non-Functional Requirements

- **NFR-1 Latency:** Panel (parallel) + residual pass should complete in ≤ 2× the time of a single reviewer, not N×
- **NFR-2 Graceful degradation:** If a specialized reviewer fails, the remaining reviewers proceed; the residual pass compensates
- **NFR-3 Token budget guardrail:** If total panel token spend would exceed 3× the arbiter-only baseline, warn the user and offer to skip to direct arbiter
- **NFR-4 No vendor lock-in:** Reviewer specialization templates must work with any model family; model selection is user-configurable

---

## Acceptance Criteria

- [ ] AC-0: `schemas/coverage-manifest.schema.json` and `schemas/review-finding.schema.json` exist and are valid JSON Schema
- [ ] AC-1: `swarm-orchestrate` accepts `review_panel` as a valid review mode
- [ ] AC-2: All three specialization templates contain both `json:coverage-manifest` and `json:review-findings` output contracts
- [ ] AC-3: Reviewers run in parallel with no cross-context contamination
- [ ] AC-4: Residual pass is dispatched iff Residual Coverage Map is non-empty
- [ ] AC-5: Cascade deferral gate correctly classifies unanimous vs. disputed findings
- [ ] AC-6: Security-critical findings bypass the quorum gate
- [ ] AC-7: Token Efficiency Report outputs **measured** (not estimated) per-stage token counts
- [ ] AC-8: ABI Debrief (§7.0) runs after arbiter completes
- [ ] AC-9: Existing single-reviewer Oracle path continues to work unchanged
- [ ] AC-10: Malformed reviewer output triggers fail-safe (residual pass or arbiter escalation) — never silent drop
- [ ] AC-11: Deterministic pre-filter tool is RUN by the agent via `run_command`, not just suggested
- [ ] AC-12: End-to-end smoke test against fixture diff writes all expected `.manifests/` files
- [ ] AC-9: Existing single-reviewer Oracle path continues to work unchanged

---

## Out of Scope

- Multi-vendor model orchestration (cross-provider API routing) — configuration only
- Real LSP server integration (tool detection uses `tech-stack.md`, actual LSP calls are advisory)
- Persistent calibration database (token efficiency data is reported, not stored automatically)
- Homogeneous quorum mode (explicitly excluded based on research findings)
