# Implementation Plan: ABI Retrospective Protocol Formalization

**Track ID:** abi_retrospective_20260723
**Target Branch:** main

---

## Phase 0: Swarm Preflight
- [x] Task: Verify swarm-orchestrate skill is installed and loaded [TIER-1] [AGENT:caduceus-triage]
    - [x] Check skills/swarm-orchestrate/SKILL.md exists
    - [x] Confirm adversarial-audit.md is accessible for read/write
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Artifact Scanner
- [x] Task: Write failing tests for review artifact file discovery and finding extraction [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: scan with zero new findings → adversarial-audit.md unchanged
    - [x] Test: extract findings from mock review artifact markdown
    - [x] Test: correctly detect findings already in shenanigan table (no re-induction)
- [x] Task: Implement `scripts/abi-retrospective.ts` artifact scanner (FR-1) [TIER-2] [AGENT:caduceus-processor]
    - [x] Discover all adversarial_code_review_vN.md files in artifacts dir
    - [x] Parse finding severity labels (🟡/🔴)
    - [x] Extract finding title and description
    - [x] Compare against existing shenanigan table entries
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Artifact Scanner' (Protocol in workflow.md)

## Phase 2: Shenanigan Induction Engine
- [x] Task: Write failing tests for induction row generation and duplicate detection [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: scan with 1 new finding → exactly 1 row appended
    - [x] Test: duplicate induction → no second row written, idempotency confirmed
    - [x] Test: inducted row format matches `<!-- Inducted: track_id — date — trigger -->` provenance pattern
- [x] Task: Implement induction engine (FR-2) [TIER-2] [AGENT:caduceus-processor]
    - [x] Generate inducted row markdown with provenance comment
    - [x] Append to shenanigan table in adversarial-audit.md
    - [x] Guard: read existing table before write, skip if already present
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Shenanigan Induction Engine' (Protocol in workflow.md)

## Phase 3: Skill Update Propagation
- [x] Task: Implement standalone-review embedded checklist sync (FR-3) [TIER-2] [AGENT:caduceus-processor]
    - [x] Compare inducted shenanigans against §4.1 embedded checklist
    - [x] Append missing items to embedded checklist
- [x] Task: Generate human-readable change summary [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Skill Update Propagation' (Protocol in workflow.md)

## Phase 4: Retrospective Report & CLI
- [x] Task: Implement retrospective report writer (FR-4) [TIER-2] [AGENT:caduceus-processor]
    - [x] Write retrospective-<track_id>-<date>.md with findings, inductions, quality trend
- [x] Task: Wire up CLI interface (FR-5) [TIER-1] [AGENT:caduceus-triage]
    - [x] --track and --artifacts-dir flag parsing
    - [x] Default artifacts-dir fallback
    - [x] Stdout logging with ✅/⚠️/❌ prefixes
- [x] Task: Smoke test: all 6 review_panel_20260722 shenanigans correctly identified as already-inducted [TIER-2] [AGENT:caduceus-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Retrospective Report & CLI' (Protocol in workflow.md)

## Phase 5: Integration & Finalization
- [x] Task: Run full test suite and confirm zero regressions [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Integrate track 'abi_retrospective_20260723' into main branch [TIER-1] [AGENT:caduceus-triage]
