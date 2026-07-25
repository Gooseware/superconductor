# Implementation Plan: Review Panel Mode with Coverage-Aware Residual Passes

## Phase 0: Swarm Preflight & Schema Definitions
- [ ] Task: Verify `swarm-orchestrate` skill is loaded and available [TIER-1]
- [ ] Task: Verify `skills/review/SKILL.md` §4.5 shenanigan checklist is accessible [TIER-1]
- [ ] Task: Confirm `templates/` directory exists at superconductor root [TIER-1]
- [ ] Task: Define and write `schemas/coverage-manifest.schema.json` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Fields: `reviewer_id`, `examined[]`, `skimmed[]`, `not_examined[]`
    - [ ] Each entry: `{ file, line_range, concern }`
    - [ ] Include JSON Schema validation rules (required fields, type constraints)
- [ ] Task: Define and write `schemas/review-finding.schema.json` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Fields: `finding_id`, `reviewer_id`, `file`, `line_range`, `severity`, `category`, `description`, `recommendation`, `is_security_critical`
    - [ ] Severity enum: `critical | high | medium | low | advisory`
    - [ ] Category enum: `security | correctness | adversarial | architecture | style`
    - [ ] Include JSON Schema validation rules
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight & Schema Definitions' (Protocol in workflow.md)

## Phase 1: Reviewer Specialization Templates
- [ ] Task: Create `templates/reviewers/` directory [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Write `templates/reviewers/security-reviewer.md` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Role definition: XSS, injection, auth bypass, secrets in code, insecure dependencies
    - [ ] Coverage Manifest contract: mandatory ` ```json:coverage-manifest ` fenced block (schema ref: `schemas/coverage-manifest.schema.json`)
    - [ ] Findings contract: mandatory ` ```json:review-findings ` fenced block (schema ref: `schemas/review-finding.schema.json`)
    - [ ] File artifact write instruction: save manifest to `superconductor/tracks/<track_id>/.manifests/<reviewer_id>.json`
    - [ ] Severity schema aligned with adversarial-audit.md
- [ ] Task: Write `templates/reviewers/correctness-reviewer.md` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Role definition: edge cases, null/undefined paths, off-by-one, race conditions, spec AC alignment
    - [ ] Coverage Manifest contract: mandatory ` ```json:coverage-manifest ` fenced block
    - [ ] Findings contract: mandatory ` ```json:review-findings ` fenced block
    - [ ] File artifact write instruction
    - [ ] Explicit instruction: output `NOT examined` list honestly even if it means admitting gaps
- [ ] Task: Write `templates/reviewers/adversarial-reviewer.md` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Role definition: load full `skills/review/SKILL.md §4.5` shenanigan checklist
    - [ ] Run all 8 shenanigan checks as mandatory output sections
    - [ ] Coverage Manifest contract: mandatory ` ```json:coverage-manifest ` fenced block
    - [ ] Findings contract: mandatory ` ```json:review-findings ` fenced block
    - [ ] File artifact write instruction
    - [ ] Include instruction: "You are looking for what the other reviewers will miss"
- [ ] Task: Write round-trip parser tests for template output contracts [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: sample agent output string containing ` ```json:coverage-manifest ` block → parsed correctly by Tier 1 extractor
    - [ ] Test: sample agent output string containing ` ```json:review-findings ` block → parsed correctly by Tier 1 extractor
    - [ ] Test: both blocks present in same output → both parsed independently without interference
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Reviewer Specialization Templates' (Protocol in workflow.md)

## Phase 2: Deterministic Pre-Filter Stage
- [ ] Task: Write `scripts/deterministic-preflight.ts` — executable script (not a prompt fragment) [TIER-3] [AGENT:caduceus-processor]
    - [ ] Language detection: read `tech-stack.md`, extract primary language(s)
    - [ ] Tool execution map: TypeScript → `tsc --noEmit`, Python → `pyright`, Go → `go vet`, Rust → `cargo check`, etc.
    - [ ] Execution: agent runs the detected tool via `run_command` and captures stdout/stderr
    - [ ] Fallback: if no matching tool in map → output `{ "status": "skipped", "reason": "no tool detected for <language>" }` and proceed (do NOT block)
    - [ ] Output format: structured `DiagnosticResult` JSON written to `.manifests/preflight.json`
    - [ ] Short-circuit rule: if exit code non-zero AND stderr contains error-level diagnostics → write `{ "short_circuit": true }` and halt pipeline
- [ ] Task: Add deterministic pre-filter invocation to `swarm-orchestrate` skill review phase documentation [TIER-3] [AGENT:caduceus-processor]
    - [ ] Document: agent reads `.manifests/preflight.json`; if `short_circuit: true` → emit immediate `Needs Fixes`, skip LLM panel
- [ ] Task: Write unit tests for `scripts/deterministic-preflight.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: mock `tsc --noEmit` returning exit code 1 with type error stderr → `short_circuit: true`
    - [ ] Test: mock `tsc --noEmit` returning exit code 0 → `short_circuit: false`, diagnostics injected into context
    - [ ] Test: tech-stack.md with unknown language → `status: "skipped"`, pipeline continues
    - [ ] Test: tech-stack.md missing → `status: "skipped"`, pipeline continues
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Deterministic Pre-Filter Stage' (Protocol in workflow.md)

## Phase 3: Extraction Parsers & Coverage Manifest Aggregation Engine
- [ ] Task: Write `scripts/extract-fenced-block.ts` — shared Tier 1 fenced block parser [TIER-3] [AGENT:caduceus-processor]
    - [ ] Input: raw agent output text, block language identifier (e.g. `coverage-manifest`, `review-findings`)
    - [ ] Output: parsed JSON object or `null` if block absent/malformed
    - [ ] Validate output against the corresponding schema from `schemas/`
    - [ ] Used by both manifest and findings extraction pipelines
- [ ] Task: Write `scripts/aggregate-coverage-manifest.ts` [TIER-3] [AGENT:caduceus-processor]
    - [ ] **Tier 1 Extraction:** Call `extract-fenced-block.ts` with `coverage-manifest` identifier on each agent output
    - [ ] **Tier 2 Extraction:** If Tier 1 returns null, read fallback artifact from `superconductor/tracks/<track_id>/.manifests/<reviewer_id>.json`
    - [ ] **Tier 3 Fail-Safe:** If both fail, mark reviewer coverage as `not_examined: [{ file: "all files in diff", line_range: "all", concern: "extraction failed" }]` — guarantees residual pass dispatch
    - [ ] Output: `ResidualCoverageMap` = union of all `not_examined` entries, deduplicated by `{ file, line_range }`
    - [ ] Output: `CoverageStats` = `{ files_examined, files_skimmed, files_not_examined, total_concerns_covered }`
- [ ] Task: Write `scripts/aggregate-findings.ts` [TIER-3] [AGENT:caduceus-processor]
    - [ ] **Tier 1 Extraction:** Call `extract-fenced-block.ts` with `review-findings` identifier on each agent output
    - [ ] **Tier 2 Extraction:** Read fallback artifact from `superconductor/tracks/<track_id>/.manifests/<reviewer_id>-findings.json`
    - [ ] **Tier 3 Fail-Safe:** If extraction fails, escalate all output to arbiter as unstructured text (never silently drop)
    - [ ] Deduplication: findings with same `file` + `line_range` within ±3 lines → merged, `reviewer_ids[]` union-ed, `agreement_count` incremented
- [ ] Task: Write unit tests for extraction and aggregation [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: Tier 1 fenced JSON extraction from raw agent text — valid block
    - [ ] Test: Tier 1 extraction from text with surrounding markdown prose — block isolated correctly
    - [ ] Test: Tier 2 file artifact reading fallback when Tier 1 returns null
    - [ ] Test: Tier 3 fail-safe when both Tier 1 and Tier 2 fail
    - [ ] Test: three manifests with overlapping `not_examined` → correct deduplication
    - [ ] Test: all manifests fully covered → empty residual map
    - [ ] Test: three findings from different reviewers at same file/line → merged into one finding with `agreement_count: 3`
    - [ ] Test: two findings at same file but line ranges differ by more than 3 → treated as separate findings
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Extraction Parsers & Coverage Manifest Aggregation Engine' (Protocol in workflow.md)

## Phase 4: Cascade Deferral Gate
- [ ] Task: Write `scripts/cascade-deferral-gate.ts` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Input: aggregated findings array from `aggregate-findings.ts`
    - [ ] Rule: `is_disputed` = true if `agreement_count < N` (N = number of reviewers that ran)
    - [ ] Rule: `is_security_critical` = true if `category === "security"` AND `severity` in `["critical", "high"]`
    - [ ] Rule: security-critical findings bypass quorum unconditionally → always escalate
    - [ ] Rule: disputed findings have severity downgraded one level in arbiter briefing
    - [ ] Output: `EscalateToArbiter` boolean, classified findings list, `ArbiterBriefing` markdown document
    - [ ] Output: `CanSkipArbiter: true` only if ALL findings unanimous AND no security-critical findings
- [ ] Task: Write unit tests for deferral gate [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: all findings unanimous, none security-critical → `CanSkipArbiter: true`
    - [ ] Test: one security-critical finding (any agreement level) → `CanSkipArbiter: false`, escalates
    - [ ] Test: disputed finding → severity downgraded one level in output
    - [ ] Test: zero findings from all reviewers → `CanSkipArbiter: true` (clean pass)
    - [ ] Test: N=1 reviewer (edge case, residual pass only) → all findings treated as `agreement_count: 1`, not unanimous
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Cascade Deferral Gate' (Protocol in workflow.md)

## Phase 5: `swarm-orchestrate` Review Panel Mode Integration
- [ ] Task: Read current `swarm-orchestrate` SKILL.md review phase section [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Add `review_panel` execution mode to swarm mode selection prompt [TIER-3] [AGENT:caduceus-processor]
    - [ ] Option: "Review Panel (Heterogeneous Flash + Arbiter)" with description of the pipeline
    - [ ] Note: "Recommended for tracks touching security-sensitive or complex multi-file changes"
- [ ] Task: Add `review_panel` protocol section to `swarm-orchestrate` SKILL.md [TIER-3] [AGENT:caduceus-processor]
    - [ ] Step 1: Run `scripts/deterministic-preflight.ts`; if `short_circuit: true` → halt with `Needs Fixes`
    - [ ] Step 2: Fan-out to three specialized Flash reviewers (parallel, isolated, each receives diff + preflight diagnostics)
    - [ ] Step 3: Run `scripts/aggregate-coverage-manifest.ts` → Residual Coverage Map
    - [ ] Step 4: If residual non-empty → dispatch residual pass reviewer directed ONLY at gap areas
    - [ ] Step 5: Run `scripts/aggregate-findings.ts` → unified finding set
    - [ ] Step 6: Run `scripts/cascade-deferral-gate.ts` → classified findings + `CanSkipArbiter` flag
    - [ ] Step 7: If `CanSkipArbiter: true` → offer user option to skip arbiter, display token savings estimate
    - [ ] Step 8: Arbiter receives `ArbiterBriefing` (pre-deduplicated findings) + raw diff → Oracle Audit Report
    - [ ] Step 9: ABI Debrief (§7.0 in `skills/implement/SKILL.md`)
    - [ ] Step 10: Token Efficiency Report (reads `.manifests/token-report.json`)
- [ ] Task: Verify backward compatibility — run existing Oracle path mock and assert output format unchanged [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: swarm-orchestrate Integration' (Protocol in workflow.md)

## Phase 6: Token Instrumentation & Efficiency Report
- [ ] Task: Add token count instrumentation hooks to each pipeline stage [TIER-3] [AGENT:caduceus-processor]
    - [ ] Each script (`deterministic-preflight`, `aggregate-coverage-manifest`, `aggregate-findings`, `cascade-deferral-gate`) writes its measured token counts to `.manifests/token-report.json`
    - [ ] Token report schema: `{ stage, model, input_tokens, output_tokens, cost_usd, timestamp }`
    - [ ] Arbiter call: agent records actual token usage from API response metadata
- [ ] Task: Write `scripts/generate-token-report.ts` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Reads `.manifests/token-report.json`
    - [ ] Computes: total cost, per-stage breakdown, findings per dollar, estimated savings vs. single-arbiter baseline
    - [ ] Outputs: formatted markdown report + K/N threshold recommendation based on agreement rates observed
- [ ] Task: Write `templates/token-efficiency-report.md` — output format template [TIER-2] [AGENT:caduceus-processor]
    - [ ] Sections: Stage Breakdown, Findings per Stage, Actual vs. Baseline Cost, Calibration Notes
- [ ] Task: Write unit test for `generate-token-report.ts` with fixture token data [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Token Instrumentation & Efficiency Report' (Protocol in workflow.md)

## Phase 7: Integration & Finalization
- [ ] Task: Run full engine test suite [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Run end-to-end smoke test: execute review panel against a fixture diff, assert all `.manifests/` outputs written [TIER-2] [AGENT:caduceus-oracle]
- [ ] Task: Verify skill line count budget (implement.md ≤ 500, swarm-orchestrate.md within budget) [TIER-1]
- [ ] Task: Integrate track 'review_panel_20260722' into main branch [TIER-3] [AGENT:caduceus-oracle]
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Integration & Finalization' (Protocol in workflow.md)

## Phase 8: Standalone `superconductor:review` Skill
- [ ] Task: Create `skills/standalone-review/` directory and scaffolding [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Write `skills/standalone-review/SKILL.md` — standalone review skill [TIER-4] [AGENT:caduceus-oracle]
    - [ ] §1.0 System Directive: zero-track-context mode, full panel pipeline
    - [ ] §2.0 Input Resolution Protocol:
        - [ ] Priority 1: resolve `{{args}}` for flags (`--staged`, `--branch`, `--pr`, `--file`, `--dir`, `--fast`, `--deep`, `--stats`)
        - [ ] Priority 2: if no args and stdin present → read stdin
        - [ ] Priority 3: if no args and no stdin → `git diff HEAD` as default
        - [ ] Priority 4: if not a git repo → prompt user to specify target explicitly
    - [ ] §3.0 Directory Triage Protocol (for `--dir` and large codebases):
        - [ ] Hot-path scoring: `git log --since=30.days --name-only` → rank by change frequency
        - [ ] Entry-point detection: file extension heuristics (`index.*`, `main.*`, `app.*`, `server.*`) + import fan-in count
        - [ ] Concern chunking: group by directory/module boundary → separate panel pass per concern group
        - [ ] Progressive output: write partial findings file per concern group as it completes
    - [ ] §4.0 No-Context Fallback Rules:
        - [ ] No `tech-stack.md` → use file extension map for language detection (`*.ts` → TypeScript, `*.py` → Python, etc.)
        - [ ] No `spec.md` → skip AC alignment checks; correctness panel uses generic coding standards only
        - [ ] No `adversarial-audit.md` → embed shenanigan checklist inline in adversarial reviewer prompt
    - [ ] §5.0 Depth Mode Dispatch:
        - [ ] `--fast`: Flash panel only (Security + Correctness + Adversarial), no residual pass, no arbiter → emit findings directly
        - [ ] default: Full pipeline (preflight → panel → residual → deferral gate → arbiter)
        - [ ] `--deep`: Full pipeline with explicit second residual pass after arbiter returns (arbiter gap analysis → second residual)
    - [ ] §6.0 Output Protocol:
        - [ ] Write report to `./review-<timestamp>.md` in CWD
        - [ ] Append Token Efficiency Report if `--stats` flag present
        - [ ] Exit code convention: `0` = clean / `1` = findings present / `2` = critical security findings
    - [ ] §7.0 PR Mode (`--pr <url>`):
        - [ ] Detect platform from URL (GitLab vs GitHub)
        - [ ] Fetch PR diff via GitLab-MCP `get_merge_request_diffs` or GitHub equivalent
        - [ ] Fetch PR description and use as lightweight spec context for AC alignment
- [ ] Task: Write tests for input resolution logic [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: no args + git repo → resolves to `git diff HEAD`
    - [ ] Test: no args + non-git dir → prompts for target
    - [ ] Test: `--staged` flag → resolves to `git diff --staged`
    - [ ] Test: `--file <nonexistent>` → error with clear message, non-zero exit
    - [ ] Test: `--dir` with large codebase → concern chunking produces ≥2 groups
- [ ] Task: Write smoke test: run standalone review on superconductor codebase itself (`--fast`) [TIER-2] [AGENT:caduceus-oracle]
    - [ ] Assert: report file written to CWD
    - [ ] Assert: exit code is 0 or 1 (not 2 — no critical security findings in our own skill files)
    - [ ] Assert: Coverage Manifest written to temp `.manifests/` dir
- [ ] Task: Superconductor - User Manual Verification 'Phase 8: Standalone Review Skill' (Protocol in workflow.md)

