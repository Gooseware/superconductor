---
name: batch-execute
description: Batch execution of pending tracks in the active phase (or targeted phase) in headless mode without supervision (overnight run). Continue-on-failure policy — generates a structured morning briefing report.
---

## 1.0 SYSTEM DIRECTIVE
You are the Batch Orchestrator for the Superconductor spec-driven development framework. Your task is to execute pending tracks within the targeted milestone phase in `superconductor/tracks.md` sequentially in headless mode (`--headless`).

### Design Philosophy: Failures Are Presents
This orchestrator operates under a strict **continue-on-failure** policy (`--phase-policy=continue`). Humans need sleep. When the batch run finishes, every failed track is a **gift** — a well-scoped, well-logged problem waiting in the morning briefing. The swarm works while you rest; you wake to a clean summary of wins and interesting puzzles.

All execution MUST be completely unprompted and autonomous. Zero human interventions in headless mode.

### Execution Flags
- `--phase=<N|phase_id>`: Target an explicit phase by runtime ordinal (`--phase=1`, `--phase=2`) or symbolic ID (`--phase=core-foundation`). Defaults to active Phase 1.
- `--phase-policy=<continue|halt>`: Failure handling policy. Defaults to `continue`. On track failure, reverts worktree cleanly, marks track as morning present, and proceeds to next pending track in phase without looping.
- `--auto-advance`: Automatically advances sliding window upon active phase completion and continues batch execution into the newly activated Phase 1. When omitted, stops and summarizes upon phase completion.
- `--headless`: Default execution mode. Bypasses all interactive user prompts.

---

## 1.1 QUEUE RESOLUTION
1. **Target Phase Resolution:**
   - If `--phase=<value>` is specified: Resolve target phase matching either dynamic ordinal `<N>` or symbolic identifier `<phase_id>` in `superconductor/tracks.md`.
   - If `--phase` is omitted: Default to the active Phase 1. Identify active phase by locating section heading `## Phase 1: <Name> (Active)` or the first non-completed phase in document order.
   - For legacy unsegmented registries (single `## Active Tracks` table), treat all pending tracks as a single default active phase.
2. **Phase Boundary Enforcement:**
   - Parse entries strictly within the resolved target phase section table.
   - **MUST IGNORE** tracks located in upstream completed phases, downstream pending phases, or any other phase sections.
3. **Filter Pending Tracks:**
   - Identify all tracks within the target phase having status `[ ]` (Pending), preserved in exact document order.
   - Ignore completed (`[x]`), absorbed/cancelled (`[-]`), and currently running (`[~]`) tracks.
4. **Announce Queue:**
   - Record resolved track queue in context and announce:
     `"Batch execution queue resolved for Phase <N> ('<phase_id>'): [<track_1>, <track_2>, ...]"`
   - If no pending tracks exist in the target phase, report:
     `"No pending tracks in Phase <N> ('<phase_id>')."`
     Proceed to evaluate sliding-window progression (Section 2.5).

---

## 2.0 BATCH EXECUTION LOOP

For each track in the resolved queue:

### 2.1 Track Initialization
1. Update `superconductor/tracks.md` to set track status to `[~]` (In Progress) in the target phase table.
2. Announce: `"Beginning batch execution for track: <track_id> (Phase <N>: <phase_name>)"`

### 2.2 Execution
1. Transition to the `/superconductor:implement` skill protocol with arguments:
   `--headless --track=<track_id>`
2. Ensure **Pipeline Swarm Mode** (`swarm-orchestrate`) is active.

### 2.3 Success Handling
If the track completes successfully (Oracle verdict: `READY`):
1. Update `superconductor/tracks.md` status to `[x]` (Completed).
2. Automatically merge the track branch to `main`.
3. Record `✅ <track_id>` and Oracle score (e.g. `9/10`) in the batch log buffer.

### 2.4 Failure & Present Handling (Continue-on-Failure: `--phase-policy=continue`)
Default failure policy is `--phase-policy=continue`.
If the track fails at any point (Oracle verdict: `NEEDS_FIXES` after iterations, unhandled error, build/type error, or test breakage):
1. **Interactive Continue Policy (`--phase-policy=continue`):**
   - **DO NOT HALT.** Do NOT deadlock or stall the batch runner.
   - If `--phase-policy=halt` was explicitly set, stop batch execution immediately and generate the briefing report.
2. **Worktree Hygiene:**
   - Cleanly revert dirty worktree state (`git reset --hard HEAD` / worktree release) to ensure no uncommitted artifacts leak into subsequent tracks.
3. **Revert Status to Morning Present:**
   - Revert `superconductor/tracks.md` status for `<track_id>` back to `[ ]` (Pending) so it can be retried or inspected.
   - Mark track as a **"morning present"** in batch state. Do NOT retry the failed track in the current batch pass to prevent infinite loops.
4. **Capture Failure Diagnostics:**
   - Blocked phase / task
   - Last error message & stack trace snippet
   - Target file and line number (if available)
   - Suggested fix / next steps
5. **Record in Batch Log Buffer:**
   - Record `🎁 <track_id>` in the batch log buffer with captured diagnostics.
6. **Advance Queue:**
   - **Immediately proceed to the next pending track in the active phase queue rather than halting or deadlocking.**

### 2.5 Sliding Window Progression
When all tracks in the active phase reach `[x]` (Completed):
1. **Phase Status Transition:**
   - Mark active phase heading in `superconductor/tracks.md` as `(Complete)`.
   - The sliding window advances: the next uncompleted phase (e.g., Phase 2) becomes the new active Phase 1.
   - Announce: `"Phase <N> complete! Sliding window advanced: Phase <next_N> is now active Phase 1."`
2. **Auto-Advance Evaluation:**
   - If `--auto-advance` is set: Resolve the new Phase 1 queue (Section 1.1) and continue the batch execution loop.
   - If `--auto-advance` is omitted (default): Finalize the run, generate the morning briefing report, and exit cleanly for developer inspection.

---

## 3.0 MORNING BRIEFING REPORT (`batch_run_<ISO-timestamp>.md`)

Upon completing all tracks in the targeted phase (or if queue is empty), generate the final morning briefing report:

1. **Create File:** Save report to `superconductor/batch_run_<YYYYMMDD_HHMMSS>.md`.
2. **Update Symlink:** Create or update relative symlink `superconductor/batch_run_latest.md` pointing to the newly created report using relative path target (`cd superconductor && ln -sf batch_run_<YYYYMMDD_HHMMSS>.md batch_run_latest.md`).

### Report Template

```markdown
# Morning Briefing — Batch Run (<ISO-timestamp>)

**Phase:** Phase <N> (<phase_id>) | **Tracks Attempted:** <total> | **Succeeded:** <success_count> | **Presents for Morning:** <failure_count>
**Sliding Window:** <Advanced to Phase <next_N> | Current Phase Complete | In Progress>

---

## Executive Summary

| Phase | Track ID | Status | Score | Verdict / Summary |
|---|---|---|---|---|
| Phase 1 | <track_1> | ✅ Merged | 9/10 | Clean execution — merged to main |
| Phase 1 | <track_2> | 🎁 Present | -- | Blocked at Phase 2 (Type error in `builder.ts`) |

---

## 🎁 Presents for the Morning

### <failed_track_id>
- **Phase:** Phase <N> (`<phase_id>`)
- **Status:** Pending `[ ]` (Reverted for morning review)
- **Blocked Phase / Task:** <blocked_task_or_phase>
- **Failure Summary:** `<error_message>`
- **Location:** `file:///<absolute_path_to_file>#L<line_number>`
- **Suggested Fix:** <brief actionable guidance>

---

## 📈 Run Details
- **Log File:** `superconductor/tracks/<track_id>/swarm_log.md`
- **Branch State:** `main` updated with <success_count> merged tracks.
- **Next Steps:** Review morning presents above or run `/superconductor:phase` to inspect phase state.
```

---

## 4.0 HEADLESS & CI INTEGRATION
1. The batch skill is inherently headless (`--headless` active by default).
2. All `ask_user` prompts are bypassed.
3. Respects `--phase-policy=continue` by default; failures do not exit with fatal codes, ensuring CI logs complete morning reports.
4. Upon batch completion, output summary to stdout and exit cleanly.
