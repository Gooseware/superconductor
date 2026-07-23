# Implementation Plan: ABI Retrospective Protocol Formalization

**Track ID:** abi_retrospective_20260723
**Target Branch:** main

---

## Phase 0: Swarm Preflight
- [ ] Task: Verify swarm-orchestrate skill is installed and loaded [TIER-1] [AGENT:caduceus-triage]
    - [ ] Check skills/swarm-orchestrate/SKILL.md exists
    - [ ] Confirm adversarial-audit.md is accessible for read/write
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Artifact Scanner
- [ ] Task: Write failing tests for review artifact file discovery and finding extraction [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: scan with zero new findings → adversarial-audit.md unchanged
    - [ ] Test: extract findings from mock review artifact markdown
    - [ ] Test: correctly detect findings already in shenanigan table (no re-induction)
- [ ] Task: Implement `scripts/abi-retrospective.ts` artifact scanner (FR-1) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Discover all adversarial_code_review_vN.md files in artifacts dir
    - [ ] Parse finding severity labels (🟡/🔴)
    - [ ] Extract finding title and description
    - [ ] Compare against existing shenanigan table entries
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Artifact Scanner' (Protocol in workflow.md)

## Phase 2: Shenanigan Induction Engine
- [ ] Task: Write failing tests for induction row generation and duplicate detection [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: scan with 1 new finding → exactly 1 row appended
    - [ ] Test: duplicate induction → no second row written, idempotency confirmed
    - [ ] Test: inducted row format matches `<!-- Inducted: track_id — date — trigger -->` provenance pattern
- [ ] Task: Implement induction engine (FR-2) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Generate inducted row markdown with provenance comment
    - [ ] Append to shenanigan table in adversarial-audit.md
    - [ ] Guard: read existing table before write, skip if already present
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Shenanigan Induction Engine' (Protocol in workflow.md)

## Phase 3: Skill Update Propagation
- [ ] Task: Implement standalone-review embedded checklist sync (FR-3) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Compare inducted shenanigans against §4.1 embedded checklist
    - [ ] Append missing items to embedded checklist
- [ ] Task: Generate human-readable change summary [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Skill Update Propagation' (Protocol in workflow.md)

## Phase 4: Retrospective Report & CLI
- [ ] Task: Implement retrospective report writer (FR-4) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Write retrospective-<track_id>-<date>.md with findings, inductions, quality trend
- [ ] Task: Wire up CLI interface (FR-5) [TIER-1] [AGENT:caduceus-triage]
    - [ ] --track and --artifacts-dir flag parsing
    - [ ] Default artifacts-dir fallback
    - [ ] Stdout logging with ✅/⚠️/❌ prefixes
- [ ] Task: Smoke test: all 6 review_panel_20260722 shenanigans correctly identified as already-inducted [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Retrospective Report & CLI' (Protocol in workflow.md)

## Phase 5: Integration & Finalization
- [ ] Task: Run full test suite and confirm zero regressions [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Integrate track 'abi_retrospective_20260723' into main branch [TIER-1] [AGENT:caduceus-triage]
