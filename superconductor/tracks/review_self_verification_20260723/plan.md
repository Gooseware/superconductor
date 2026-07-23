# Implementation Plan: Review Self-Verification Gate

**Track ID:** review_self_verification_20260723
**Target Branch:** main

---

## Phase 0: Swarm Preflight
- [ ] Task: Verify swarm-orchestrate skill is installed and loaded [TIER-1] [AGENT:caduceus-triage]
    - [ ] Confirm scripts/ directory is accessible
    - [ ] Confirm standalone-review/SKILL.md §6.0 is the target for integration update
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Verdict Certification Block Parser
- [ ] Task: Write failing tests for §9.4 block detection and validation [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: valid certification block → exit 0
    - [ ] Test: missing block → exit 1 with actionable stderr message
    - [ ] Test: all-unchecked block → exit 1
    - [ ] Test: missing terminal output → exit 2
    - [ ] Test: --skip-self-check flag → exit 0, adds bypass annotation
- [ ] Task: Implement `scripts/review-self-check.ts` parser (FR-1, FR-2) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Detect `## Execution Evidence` section presence
    - [ ] Validate at least one `[x]` checked item
    - [ ] Validate `Terminal output:` line is non-placeholder
    - [ ] Return correct exit codes with clear stderr messages
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Block Parser' (Protocol in workflow.md)

## Phase 2: Bypass Flag & Integration
- [ ] Task: Add --skip-self-check flag to input-resolution.ts [TIER-2] [AGENT:caduceus-processor]
    - [ ] Parse flag in resolveReviewInput
    - [ ] Add skipSelfCheck boolean to ResolvedInput interface
    - [ ] Add test for --skip-self-check flag in standalone-review.test.ts
- [ ] Task: Update standalone-review/SKILL.md §6.0 to invoke self-check (FR-3) [TIER-1] [AGENT:caduceus-triage]
    - [ ] Add step: run `npx tsx scripts/review-self-check.ts <report-path>` after writing report
    - [ ] Document failure path: announce reason, request re-run with execution evidence
    - [ ] Document bypass path with --skip-self-check
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Bypass Flag & Integration' (Protocol in workflow.md)

## Phase 3: Integration & Finalization
- [ ] Task: Run full test suite (engine + standalone + e2e) and confirm zero regressions [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Integrate track 'review_self_verification_20260723' into main branch [TIER-1] [AGENT:caduceus-triage]
