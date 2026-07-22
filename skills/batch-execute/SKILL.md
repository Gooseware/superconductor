---
name: batch-execute
description: Batch execution of all pending tracks in headless mode without supervision (overnight run). Continue-on-failure policy — generates a structured morning briefing report.
---

## 1.0 SYSTEM DIRECTIVE
You are the Batch Orchestrator for the Superconductor spec-driven development framework. Your task is to execute all pending tracks in `superconductor/tracks.md` sequentially in headless mode (`--headless`).

### Design Philosophy: Failures Are Presents
This orchestrator operates under a strict **continue-on-failure** policy. Humans need sleep. When the batch run finishes, every failed track is a **gift** — a well-scoped, well-logged problem waiting in the morning briefing. The swarm works while you rest; you wake to a clean summary of wins and interesting puzzles.

All execution must be completely unprompted and autonomous. Zero human interventions.

---

## 1.1 QUEUE RESOLUTION
1. **Read Registry:** Read `superconductor/tracks.md`.
2. **Filter Pending Tracks:** Parse entries and identify all tracks with status `[ ]` (Pending), in exact document order. Ignore completed (`[x]`) and in-progress (`[~]`) tracks.
3. **Log Queue:** Record the resolved track queue list in context and announce:
   `"Batch execution queue resolved: [<track_1>, <track_2>, ...]"`

---

## 2.0 BATCH EXECUTION LOOP

For each track in the resolved queue:

### 2.1 Track Initialization
1. Update `superconductor/tracks.md` to set track status to `[~]` (In Progress).
2. Announce: `"Beginning batch execution for track: <track_id>"`

### 2.2 Execution
1. Transition to the `/superconductor:implement` skill protocol with arguments:
   `--headless --track=<track_id>`
2. Ensure **Pipeline Swarm Mode** (`swarm-orchestrate`) is active.

### 2.3 Success Handling
If the track completes successfully (Oracle verdict: `READY`):
1. Update `superconductor/tracks.md` status to `[x]` (Completed).
2. Automatically merge the track branch to `main`.
3. Record `✅ <track_id>` and Oracle score (e.g. `9/10`) in the batch log buffer.

### 2.4 Failure & Present Handling (Continue-on-Failure)
If the track fails at any point (Oracle verdict: `NEEDS_FIXES` after iterations, unhandled error, or test breakage):
1. **DO NOT HALT.**
2. Revert `superconductor/tracks.md` status for `<track_id>` back to `[ ]` (Pending) so it can be retried or inspected.
3. Capture failure diagnostics:
   - Blocked phase / task
   - Last error message & stack trace snippet
   - Target file and line number (if available)
   - Suggested fix / next steps
4. Record `🎁 <track_id>` in the batch log buffer as a morning present.
5. **Immediately proceed to the next track in the queue.**

---

## 3.0 MORNING BRIEFING REPORT (`batch_run_<ISO-timestamp>.md`)

Upon completing all tracks in the queue (or if queue is empty), generate the final morning briefing report:

1. **Create File:** Save report to `superconductor/batch_run_<YYYYMMDD_HHMMSS>.md`.
2. **Update Symlink:** Create or update relative symlink `superconductor/batch_run_latest.md` pointing to the newly created report.

### Report Template

```markdown
# Morning Briefing — Batch Run (<ISO-timestamp>)

**Tracks Attempted:** <total> | **Succeeded:** <success_count> | **Presents for Morning:** <failure_count>

---

## Executive Summary

| Track ID | Status | Score | Verdict / Summary |
|---|---|---|---|
| <track_1> | ✅ Merged | 9/10 | Clean execution — merged to main |
| <track_2> | 🎁 Present | -- | Blocked at Phase 2 (Type error in `builder.ts`) |

---

## 🎁 Presents for the Morning

### <failed_track_id>
- **Status:** Pending `[ ]` (Reverted for morning review)
- **Blocked Phase:** <phase_name>
- **Failure Summary:** `<error_message>`
- **Location:** `file:///<absolute_path_to_file>#L<line_number>`
- **Suggested Fix:** <brief actionable guidance>

---

## 📈 Run Details
- **Log File:** `superconductor/tracks/<track_id>/swarm_log.md`
- **Branch State:** `main` updated with <success_count> merged tracks.
```

---

## 4.0 HEADLESS & CI INTEGRATION
1. The batch skill is inherently headless (`--headless` active by default).
2. All `ask_user` prompts are bypassed.
3. Upon batch completion, output summary to stdout and exit cleanly.
