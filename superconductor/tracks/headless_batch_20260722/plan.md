# Implementation Plan: Headless Batch Track Executor
**Track ID:** `headless_batch_20260722`
**Spec:** [spec.md](./spec.md)

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify `swarm-orchestrate` skill is loaded and `batch-execute` skill directory does not already exist
    - [ ] `ls skills/batch-execute/` → must return not-found

---

## Phase 1: Author `batch-execute` Skill

- [ ] Task: Create `skills/batch-execute/SKILL.md` [TIER-4] [AGENT:caduceus-oracle]
    - [ ] Section 1.0 — System Directive: batch executor philosophy, continue-on-failure, morning briefing framing
    - [ ] Section 1.1 — Queue Resolution: how to read `tracks.md`, filter `[ ]` pending entries, log the queue
    - [ ] Section 2.0 — Execution Loop:
        - [ ] For each queued track: update status to `[~]`, invoke `implement --headless` with pipeline swarm active
        - [ ] On success: update status `[x]`, record Oracle score, merge to main
        - [ ] On failure: revert status to `[ ]`, capture failure summary (phase, error, file:line), continue
    - [ ] Section 3.0 — Morning Briefing Report: filename convention, `✅` / `🎁` format, present description template
    - [ ] Section 4.0 — Symlink: `batch_run_latest.md` always points to most recent run
    - [ ] Confirm line count ≤ 500
- [ ] Task: Superconductor - User Manual Verification 'Phase 1 Skill Authoring' (Protocol in workflow.md)

---

## Phase 2: Verification

- [ ] Task: Run `skill-line-count.test.ts` — assert `batch-execute/SKILL.md` ≤ 500 lines [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Run full test suite — all 171 existing tests must pass [TIER-1] [AGENT:caduceus-processor]
    - [ ] `CI=true npm test` from `packages/engine/`
    - [ ] `tsc --noEmit` clean
- [ ] Task: Superconductor - User Manual Verification 'Phase 2 Verification' (Protocol in workflow.md)

---

## Phase 3: Integration & Finalization

- [ ] Task: Commit with message `feat(superconductor): Add batch-execute skill — headless overnight track executor` [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Update `superconductor/tracks/headless_batch_20260722/plan.md` with completion SHA
- [ ] Task: Mark track complete in `superconductor/tracks.md`
- [ ] Task: Integrate track `headless_batch_20260722` into `main` branch
