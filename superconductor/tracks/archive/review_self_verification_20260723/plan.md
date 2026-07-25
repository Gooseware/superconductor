# Implementation Plan: Review Self-Verification Gate

**Track ID:** review_self_verification_20260723
**Target Branch:** main

---

## Phase 0: Swarm Preflight
- [x] Task: Verify swarm-orchestrate skill is installed and loaded [TIER-1] [AGENT:caduceus-triage]
    - [x] Confirm scripts/ directory is accessible
    - [x] Confirm standalone-review/SKILL.md §6.0 is the target for integration update
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Verdict Certification Block Parser
- [x] Task: Write failing tests for §9.4 block detection and validation [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: valid certification block → exit 0
    - [x] Test: missing block → exit 1 with actionable stderr message
    - [x] Test: all-unchecked block → exit 1
    - [x] Test: missing terminal output → exit 2
    - [x] Test: --skip-self-check flag → exit 0, adds bypass annotation
- [x] Task: Implement `scripts/review-self-check.ts` parser (FR-1, FR-2) [TIER-2] [AGENT:caduceus-processor]
    - [x] Detect `## Execution Evidence` section presence
    - [x] Validate at least one `[x]` checked item
    - [x] Validate `Terminal output:` line is non-placeholder
    - [x] Return correct exit codes with clear stderr messages
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Block Parser' (Protocol in workflow.md)

## Phase 2: Bypass Flag & Integration
- [x] Task: Add --skip-self-check flag to input-resolution.ts [TIER-2] [AGENT:caduceus-processor]
    - [x] Parse flag in resolveReviewInput
    - [x] Add skipSelfCheck boolean to ResolvedInput interface
    - [x] Add test for --skip-self-check flag in standalone-review.test.ts
- [x] Task: Update standalone-review/SKILL.md §6.0 to invoke self-check (FR-3) [TIER-1] [AGENT:caduceus-triage]
    - [x] Add step: run `npx tsx scripts/review-self-check.ts <report-path>` after writing report
    - [x] Document failure path: announce reason, request re-run with execution evidence
    - [x] Document bypass path with --skip-self-check
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Bypass Flag & Integration' (Protocol in workflow.md)

## Phase 3: Integration & Finalization
- [x] Task: Run full test suite (engine + standalone + e2e) and confirm zero regressions [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Integrate track 'review_self_verification_20260723' into main branch [TIER-1] [AGENT:caduceus-triage]
