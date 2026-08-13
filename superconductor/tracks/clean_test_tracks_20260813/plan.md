# Implementation Plan: Protocol Drift Remediation
**Track:** clean_test_tracks_20260813  
**Branch:** track/clean_test_tracks_20260813

## Phase 1: Protocol Drift Audit & Root Cause Analysis
- [x] Task: Audit skills/implement/SKILL.md for deprecated swarm-orchestrate reference [TIER-2]
- [x] Task: Audit workflow.md for manual check-in stalls (PAUSE at intermediate phases) [TIER-2]
- [x] Task: Audit finalization path for missing quorum gate [TIER-2]
- [x] Task: Audit swarm-execute/SKILL.md for absent remediation protocol [TIER-2]

## Phase 2: Core Protocol Fixes
- [x] Task: Replace deprecated swarm-orchestrate with swarm-execute dispatch in skills/implement/SKILL.md [TIER-2]
- [x] Task: Add AUTO-ADVANCE rule (task completion -> task_query -> begin next, no user prompt) [TIER-2]
- [x] Task: Add Quorum HARD GATE enforcement before finalization in skills/implement/SKILL.md [TIER-2]
- [x] Task: Add domain-split remediation cross-ref and hero-agenting prohibition in skills/implement/SKILL.md [TIER-2]
- [x] Task: Add full Remediation Protocol section to skills/swarm-execute/SKILL.md [TIER-2]
- [x] Task: Restrict PAUSE to final phase only in superconductor/workflow.md [TIER-2]

## Phase 3: Adversarial Hardening (ADV-001 through ADV-010)
- [x] Task: ADV-001 — Replace phantom TypeScript gate calls with CLI commands [TIER-2]
- [x] Task: ADV-002 — Resolve headless mode deadlock on missing swarm-execute [TIER-2]
- [x] Task: ADV-003 — Enforce commit trailer validation via script [TIER-2]
- [x] Task: ADV-004 — Add error branch to AUTO-ADVANCE (only advance on task success) [TIER-2]
- [x] Task: ADV-005 — Normalize remediation cycle cap to 3 across all files [TIER-2]
- [x] Task: ADV-006 — Add Oracle cadence scope annotation (Gate Oracle vs advisory) [TIER-2]
- [x] Task: ADV-007 — Add shell assertions to AUTO-GATE verification tasks in plan.md [TIER-2]
- [x] Task: ADV-008 — Enforce schema mutual exclusivity in reviewer-response-broker.ts [TIER-2]
- [x] Task: ADV-009 — Create scripts/quorum-gate.mjs as real CLI gate runner [TIER-2]
- [x] Task: ADV-010 — Replace all stale quorum-validator.js references with quorum-gate.mjs [TIER-2]

## Phase 4: Track Cleanup
- [ ] Task: Superconductor - User Manual Verification 'Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=3]
  - Shell assertions:
    ```bash
    # Verify all protocol drift files are modified
    git diff main...HEAD --name-only | grep -q 'skills/implement/SKILL.md' && echo 'PASS: implement SKILL.md modified' || (echo 'FAIL' && exit 1)
    git diff main...HEAD --name-only | grep -q 'skills/swarm-execute/SKILL.md' && echo 'PASS: swarm-execute SKILL.md modified' || (echo 'FAIL' && exit 1)
    git diff main...HEAD --name-only | grep -q 'superconductor/workflow.md' && echo 'PASS: workflow.md modified' || (echo 'FAIL' && exit 1)
    git diff main...HEAD --name-only | grep -q 'scripts/quorum-gate.mjs' && echo 'PASS: quorum-gate.mjs created' || (echo 'FAIL' && exit 1)
    # Verify no swarm-orchestrate references remain active in implement SKILL
    ! grep -q 'swarm-orchestrate.*available\|transition.*swarm-orchestrate' skills/implement/SKILL.md && echo 'PASS: no active swarm-orchestrate dispatch' || (echo 'FAIL' && exit 1)
    # Verify quorum-gate.mjs exits non-zero without state
    node scripts/quorum-gate.mjs --gate 2>&1; test $? -ne 0 && echo 'PASS: gate exits non-zero without state' || (echo 'FAIL: gate is a phantom' && exit 1)
    ```
