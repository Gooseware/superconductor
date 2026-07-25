# Specification: Headless Batch Track Executor
## Overnight autonomous execution of all pending tracks

---

## 1. Overview

Superconductor can already execute a single track headlessly. This track adds the ability
to **batch-execute all pending tracks sequentially, overnight, without supervision**.

### Design Philosophy: Failures Are Presents

The batch executor uses a `continue-on-failure` policy by design. Humans need sleep.
When the batch finishes, every failed track is a **gift** — a well-scoped, well-logged problem
waiting in the morning briefing. The swarm works while you rest; you wake to a clean summary
of wins and interesting puzzles.

**The morning briefing is the product.** Every run produces a `batch_run_<timestamp>.md`
that reads like a handoff note from a night-shift team:

```
✅ Track: Dynamic Skill Trigger Engine    — Oracle 9/10  — merged to main
✅ Track: Pipeline Swarm Mode             — Oracle 8/10  — merged to main
🎁 Track: Headless Batch Executor         — Oracle blocked on Phase 2 (type error in batch-runner.ts)
```

---

## 2. Invocation

A new skill: `batch-execute` — invoked via `/superconductor:batch`.

The skill:
1. Reads `superconductor/tracks.md`
2. Collects all entries marked `[ ]` (pending) in document order
3. Executes each track using the existing `implement` flow with `--headless` and pipeline swarm mode
4. Continues to the next track regardless of failure
5. Writes the morning briefing to `superconductor/batch_run_<ISO-timestamp>.md`

---

## 3. Functional Requirements

### FR-1: Queue Resolution
- Read `superconductor/tracks.md` and extract all tracks with status `[ ]` (pending), in document order.
- Skip `[x]` (complete) and `[~]` (in-progress) entries.
- Log the resolved queue at batch start: `"Batch queue: [track-a, track-b, track-c]"`

### FR-2: Sequential Execution with Continue-on-Failure
- Execute each queued track using the `implement` skill with `--headless` and pipeline swarm mode active.
- On any failure (Oracle verdict: NEEDS FIXES, unresolved escalation, crash):
  - Mark the track as `🎁` (needs attention) in the batch log
  - Capture the failure summary (last Oracle verdict, last error, phase that blocked)
  - **Continue to the next track immediately** — no human prompt, no halt
- On success:
  - Mark the track as `✅` in the batch log
  - Record the Oracle score
  - Merge to `main` automatically (standard headless merge behaviour)

### FR-3: Morning Briefing Report
The batch run produces `superconductor/batch_run_<ISO-timestamp>.md` with:

```markdown
# Batch Run — 2026-07-23T06:00:00+04:00
**Tracks attempted:** 3  |  **Succeeded:** 2  |  **Needs attention:** 1

## Results

| Track | Status | Oracle Score | Notes |
|---|---|---|---|
| pipeline_swarm_20260722 | ✅ Merged | 9/10 | Clean — merged to main |
| skill_trigger_20260722  | ✅ Merged | 10/10 | Perfect run |
| headless_batch_20260722 | 🎁 Needs Attention | blocked | Type error in Phase 2, batch-runner.ts:42 |

## 🎁 Presents for the Morning

### headless_batch_20260722
**Blocked at:** Phase 2 — Verification  
**Last error:** `TS2345: Argument of type 'string' is not assignable to parameter of type 'TrackEntry'`  
**File:** `packages/engine/src/batch/batch-runner.ts:42`  
**Suggested fix:** Cast the parsed entry through `TrackEntry` schema validator before passing to executor.
```

### FR-4: Track Status Updates
- When a track begins batch execution: update `tracks.md` status to `[~]` (in-progress)
- On success: update to `[x]` (complete)
- On failure: revert to `[ ]` (pending) — so the next batch run will retry it

### FR-5: Batch Log Persistence
- All batch runs are retained in `superconductor/` — never overwritten
- Naming: `batch_run_YYYYMMDD_HHMMSS.md`
- The most recent batch run is symlinked as `batch_run_latest.md`

---

## 4. Non-Functional Requirements

| NFR | Requirement |
|---|---|
| **No supervision** | Zero human prompts during execution — all decisions are autonomous |
| **Idempotent queue** | Re-running batch after a partial failure retries only `[ ]` tracks |
| **Log completeness** | Every track attempt, Oracle invocation, and failure is logged before moving on |
| **Skill line budget** | `batch-execute/SKILL.md` ≤ 500 lines |
| **No new engine code** | The batch runner is a SKILL.md orchestration protocol, not a TypeScript module — it uses the existing `implement` + `swarm-orchestrate` flow |

---

## 5. Acceptance Criteria

- [ ] `skills/batch-execute/SKILL.md` exists and is ≤ 500 lines
- [ ] Skill documents the queue resolution protocol (reads `tracks.md`, filters `[ ]` entries)
- [ ] Skill documents `continue-on-failure` policy with present-framing for failures
- [ ] Skill documents the morning briefing report format and filename convention
- [ ] Skill documents track status lifecycle (`[ ]` → `[~]` → `[x]` / `[ ]` on failure)
- [ ] `skill-line-count.test.ts` covers `batch-execute/SKILL.md` (or existing test auto-picks it up)
- [ ] All 171 existing tests pass
- [ ] `tracks.md` is updated with the new track entry

---

## 6. Out of Scope

- Parallel batch execution (tracks run sequentially — parallel-within-track is handled by pipeline swarm)
- A CLI flag to override failure policy (continue-on-failure is the only policy)
- A dashboard or web UI for batch progress
- Scheduling / cron triggering (use the system's `/schedule` command for that)
