# Implementation Plan: Review Panel Mode with Coverage-Aware Residual Passes

## Phase 0: Swarm Preflight
- [ ] Task: Verify `swarm-orchestrate` skill is loaded and available [TIER-1]
- [ ] Task: Verify `skills/review/SKILL.md` §4.5 shenanigan checklist is accessible [TIER-1]
- [ ] Task: Confirm `templates/` directory exists at superconductor root [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Reviewer Specialization Templates
- [ ] Task: Create `templates/reviewers/` directory [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Write `templates/reviewers/security-reviewer.md` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Role definition: XSS, injection, auth bypass, secrets in code, insecure dependencies
    - [ ] Coverage Manifest contract (` ```json:coverage-manifest ` fenced block + file artifact write instruction)
    - [ ] Severity schema aligned with adversarial-audit.md
- [ ] Task: Write `templates/reviewers/correctness-reviewer.md` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Role definition: edge cases, null/undefined paths, off-by-one, race conditions, spec AC alignment
    - [ ] Coverage Manifest contract (` ```json:coverage-manifest ` fenced block + file artifact write instruction)
    - [ ] Explicit instruction: output `NOT examined` list honestly even if it means admitting gaps
- [ ] Task: Write `templates/reviewers/adversarial-reviewer.md` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Role definition: load full `skills/review/SKILL.md §4.5` shenanigan checklist
    - [ ] Run all 8 shenanigan checks as mandatory output sections
    - [ ] Coverage Manifest contract (` ```json:coverage-manifest ` fenced block + file artifact write instruction)
    - [ ] Include instruction: "You are looking for what the other reviewers will miss"
- [ ] Task: Write tests verifying all three templates contain Coverage Manifest contract headers [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Reviewer Specialization Templates' (Protocol in workflow.md)

## Phase 2: Deterministic Pre-Filter Stage
- [ ] Task: Write `templates/deterministic-preflight.md` — prompt fragment injected into each reviewer context [TIER-3] [AGENT:caduceus-processor]
    - [ ] Language detection logic from `tech-stack.md`
    - [ ] Tool suggestion map: TypeScript → `tsc --noEmit`, Python → `pyright`, Go → `go vet`, etc.
    - [ ] Output format: structured diagnostic block prepended to reviewer prompt
- [ ] Task: Add deterministic pre-filter invocation to `swarm-orchestrate` skill review phase documentation [TIER-3] [AGENT:caduceus-processor]
    - [ ] Short-circuit rule: if compiler/linter reports critical errors → emit immediate `Needs Fixes`, skip LLM panel
- [ ] Task: Write tests for short-circuit logic (mock critical diagnostic → verify panel is skipped) [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Deterministic Pre-Filter Stage' (Protocol in workflow.md)

## Phase 3: Coverage Manifest Aggregation Engine & Extraction Protocol
- [ ] Task: Define Coverage Manifest JSON schema & extraction parser [TIER-3] [AGENT:caduceus-processor]
    - [ ] Fields: `reviewer_id`, `examined[]`, `skimmed[]`, `not_examined[]`
    - [ ] Each entry: `{ file, line_range, concern }` 
- [ ] Task: Write `scripts/aggregate-coverage-manifest.ts` [TIER-3] [AGENT:caduceus-processor]
    - [ ] **Tier 1 Extraction:** Fenced Code Block Regex (`json:coverage-manifest`) from agent output text
    - [ ] **Tier 2 Extraction:** Read fallback artifact JSON files from `superconductor/tracks/<track_id>/.manifests/`
    - [ ] **Tier 3 Fail-Safe:** If parsing fails or manifest missing, mark reviewer coverage as `not_examined: ["all files in diff"]` (guarantees residual pass dispatch)
    - [ ] Output: `ResidualCoverageMap` = union of all `not_examined` entries, deduplicated
    - [ ] Output: `CoverageStats` = { files_examined, files_not_examined, total_lines_covered }
- [ ] Task: Write unit tests for extraction and aggregation engine [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test Tier 1 fenced JSON extraction from raw agent text
    - [ ] Test Tier 2 file artifact reading fallback
    - [ ] Test Tier 3 fail-safe default when output is malformed
    - [ ] Test three manifests with overlapping `not_examined` → correct deduplication
    - [ ] Test all manifests fully covered → empty residual map
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Coverage Manifest Aggregation Engine' (Protocol in workflow.md)

## Phase 4: Cascade Deferral Gate
- [ ] Task: Define finding classification schema [TIER-3] [AGENT:caduceus-processor]
    - [ ] Fields: `finding_id`, `reviewer_ids[]`, `agreement_count`, `is_disputed`, `severity`, `is_security_critical`
    - [ ] Rule: `is_disputed` = true if agreement_count < N reviewers
    - [ ] Rule: `is_security_critical` bypasses quorum
- [ ] Task: Write `scripts/cascade-deferral-gate.ts` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Input: all reviewer findings + agreement matrix
    - [ ] Output: `EscalateToArbiter` flag, classified findings list, `ArbiterBriefing` document
    - [ ] Unanimous + no security critical → set `CanSkipArbiter: true` flag for user prompt
- [ ] Task: Write unit tests for deferral gate [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: all unanimous, no critical → `CanSkipArbiter: true`
    - [ ] Test: one security-critical finding → always escalate regardless of unanimity
    - [ ] Test: disputed finding → severity downgraded one level
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Cascade Deferral Gate' (Protocol in workflow.md)

## Phase 5: `swarm-orchestrate` Review Panel Mode Integration
- [ ] Task: Read current `swarm-orchestrate` SKILL.md review phase section [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Add `review_panel` execution mode to swarm mode selection prompt [TIER-3] [AGENT:caduceus-processor]
    - [ ] Option: "Review Panel (Heterogeneous Flash + Arbiter)" with description of the pipeline
    - [ ] Note: "Recommended for tracks touching security-sensitive or complex multi-file changes"
- [ ] Task: Add `review_panel` protocol section to `swarm-orchestrate` SKILL.md [TIER-3] [AGENT:caduceus-processor]
    - [ ] Step 1: Run deterministic pre-filter
    - [ ] Step 2: Fan-out to three specialized Flash reviewers (parallel, isolated)
    - [ ] Step 3: Aggregate Coverage Manifests → Residual Coverage Map
    - [ ] Step 4: If residual non-empty → dispatch residual pass reviewer
    - [ ] Step 5: Run cascade deferral gate
    - [ ] Step 6: If `CanSkipArbiter` → offer user option to skip (with token savings estimate)
    - [ ] Step 7: Arbiter synthesises → Oracle Audit Report
    - [ ] Step 8: ABI Debrief (§7.0)
    - [ ] Step 9: Token Efficiency Report
- [ ] Task: Verify backward compatibility — existing single-reviewer Oracle path untouched [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: swarm-orchestrate Integration' (Protocol in workflow.md)

## Phase 6: Token Efficiency Report
- [ ] Task: Write `templates/token-efficiency-report.md` — output template [TIER-3] [AGENT:caduceus-processor]
    - [ ] Sections: Stage Breakdown, Findings per Stage, Estimated Savings vs. Baseline, Calibration Notes
    - [ ] Include K/N threshold recommendation based on agreement rates observed in this run
- [ ] Task: Add Token Efficiency Report emission to `swarm-orchestrate` review panel protocol (Step 9) [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Token Efficiency Report' (Protocol in workflow.md)

## Phase 7: Integration & Finalization
- [ ] Task: Run full engine test suite [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Verify skill line count budget (implement.md ≤ 500, swarm-orchestrate.md within budget) [TIER-1]
- [ ] Task: Integrate track 'review_panel_20260722' into main branch [TIER-3] [AGENT:caduceus-oracle]
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Integration & Finalization' (Protocol in workflow.md)
