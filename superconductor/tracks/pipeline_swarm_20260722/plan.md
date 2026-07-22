# Implementation Plan: Pipeline Swarm Mode
**Track ID:** `pipeline_swarm_20260722`
**Spec:** [spec.md](./spec.md)

---

## Phase 0: Swarm Preflight

- [x] Task: Verify `swarm-orchestrate` skill is loaded and current line count leaves ≥ 200 lines of budget
    - [x] `wc -l skills/swarm-orchestrate/SKILL.md` → confirm < 300 lines (actual: 89)

---

## Phase 1: Design the Pipeline Mode Protocol

- [ ] Task: Write the pipeline mode section for `swarm-orchestrate/SKILL.md` [TIER-4] [AGENT:caduceus-oracle]
    - [ ] Add `## 2.1 Mode Auto-Detection` — rule: flat DAG → `parallel`, linear chain → `pipeline`
    - [ ] Add `## 2.2 Pipeline Mode — Assembly-Line Scheduling` with:
        - [ ] Sliding window dispatch: Coder N runs while Reviewer N-1 runs concurrently
        - [ ] Advisory injection: Reviewer output → `--- Advisory Review ---` block in Coder N+1 prompt
        - [ ] Oracle cadence: fires every `oracleCadence` tasks (default: 3), advisory-only score
        - [ ] CRITICAL escalation path: Reviewer severity `CRITICAL` → pause Coder, spawn remediation Coder
    - [ ] Update the mermaid diagram to show both modes (parallel branch + pipeline branch)
    - [ ] Update `swarm_log.md` schema section: add `pipeline_state` fields
- [ ] Task: Superconductor - User Manual Verification 'Phase 1 Protocol Design' (Protocol in workflow.md)

---

## Phase 2: Verification

- [ ] Task: Run `skill-line-count.test.ts` — assert `swarm-orchestrate/SKILL.md` ≤ 500 lines [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Run full test suite — all 171 existing tests must pass, 0 failures [TIER-1] [AGENT:caduceus-processor]
    - [ ] `CI=true npm test` from `packages/engine/`
    - [ ] `tsc --noEmit` clean
- [ ] Task: Superconductor - User Manual Verification 'Phase 2 Verification' (Protocol in workflow.md)

---

## Phase 3: Integration & Finalization

- [ ] Task: Commit with message `feat(superconductor): Add pipeline swarm mode to swarm-orchestrate skill` [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Update `superconductor/tracks/pipeline_swarm_20260722/plan.md` with completion SHA
- [ ] Task: Mark track complete in `superconductor/tracks.md`
- [ ] Task: Integrate track `pipeline_swarm_20260722` into `main` branch
