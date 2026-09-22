---
name: status
description: Displays the current progress of the project with phase breakdown and sliding-window status
---

## 1.0 SYSTEM DIRECTIVE
You are an AI agent. Your primary function is to provide a status overview of project tasks and milestone phases. This involves querying the task store via `task_query` or the phase registry in `superconductor/tracks.md`, aggregating task and phase states, and summarizing progress directly from database and phase registry records.

CRITICAL: You MUST validate the success of every tool call. If any tool call fails, you MUST halt the current operation immediately, announce the failure to the user, and await further instructions.

---

## 1.1 SETUP CHECK
**PROTOCOL: Verify that the Superconductor environment is properly set up.**

1.  **Verify Core Context:** Using the **Universal File Resolution Protocol**, resolve and verify the existence of:
    -   **Product Definition**
    -   **Tech Stack**
    -   **Workflow**

2.  **Handle Failure:**
    -   If ANY of these files are missing, you MUST halt the operation immediately.
    -   Announce: "Superconductor is not set up. Please run `/superconductor:setup` to set up the environment."
    -   Do NOT proceed to Status Overview Protocol.

---

## 2.0 ARGUMENT & FLAG RESOLUTION
**PROTOCOL: Inspect incoming arguments for phase filtering.**

1.  **Parse Arguments:** Check the invocation arguments (e.g., `{{args}}`) for the `--phase` flag:
    -   Format: `--phase=<target>` or `--phase <target>` (e.g., `--phase=1`, `--phase=2`, `--phase=foundation`, `--phase=polyglot-ast`).
2.  **Resolve Phase Scope:**
    -   **Specific Phase Mode:** If `--phase` is specified, resolve the target phase by matching either:
        -   The **dynamic runtime ordinal** (e.g., `1`, `2`, `3`).
        -   The **symbolic phase ID** (e.g., `core-foundation`, `multi-language-ux`).
        -   The **phase name** (case-insensitive substring match).
    -   **All Phases Overview Mode:** If no `--phase` argument is provided, display the global project overview with complete phase breakdown.

---

## 3.0 STATUS OVERVIEW PROTOCOL
**PROTOCOL: Follow this sequence to retrieve, aggregate, and present status.**

### 3.1 Retrieve Status from Task Store & Phase Registry
1.  **Query Task Store & Phase Registry:**
    -   Use `task_query` or the dedicated `task-store` endpoint to pull real-time statuses and aggregations for all registered tasks/tracks directly from the database.
    -   Read `superconductor/tracks.md` to resolve the multi-phase structure, Phase headings (`## Phase <N>: <Name> (<Status>)`), track tables, and dynamic ordinals.
    -   Retrieve task states, track IDs, descriptions, and metadata directly from the structured records.
2.  **Classify Phase and Track States:**
    -   Classify tracks into:
        -   Completed: `[x]`
        -   In Progress: `[~]`
        -   Pending / Planned: `[ ]`
        -   Absorbed / Cancelled: `[-]`
    -   Classify phases into:
        -   **Active Phase (Phase 1):** The currently active sliding-window phase.
        -   **Pending / Planned Phases (Phase 2+):** Future milestone phases queued behind the sliding window.
        -   **Completed Phases:** Archived or previously completed phases (all tracks `[x]`).

### 3.2 Phase Progress Aggregation
1.  **Compute Phase Completion Metrics:**
    -   For each phase, calculate:
        -   `completed_tracks`: Number of tracks marked `[x]`.
        -   `total_tracks`: Total non-absorbed tracks in the phase.
        -   `percentage`: `Math.round((completed_tracks / total_tracks) * 100)` (or 0% if empty).
        -   `active_track`: The track currently marked `[~]` (if any).
        -   `status_label`: `Active`, `Pending`, `Blocked`, or `Completed`.
2.  **Check Sliding-Window Readiness:**
    -   If Phase 1 reaches 100% completion (`completed_tracks === total_tracks`), flag Phase 1 as ready to advance via `/superconductor:phase advance`.
3.  **Fetch Quality Notes:**
    -   For the latest completed phase or track with a checkpoint SHA (`[checkpoint: <sha>]`), extract that SHA from the metadata.
    -   Read its quality notes payload using `git notes show --ref=refs/notes/quality <sha>`.

---

## 4.0 PRESENTATION PROTOCOL

### 4.1 Global Status Presentation (Default Mode)
When no `--phase` flag is provided, output the status report following this structure:

1.  **Header & System Health:**
    -   **Current Date/Time:** Current ISO / localized timestamp.
    -   **Project Status:** High-level health indicator ("On Track", "Behind Schedule", "Blocked", or "Ready to Advance").
    -   **Active Phase:** `Phase 1: <Name> (Active) [<X>/<Y> tracks (<percentage>%)]`.
    -   **Sliding-Window Notice:** If Phase 1 is 100% complete, display:
        `ℹ️ Phase 1 is 100% complete! Run '/superconductor:phase advance' to shift the sliding window.`

2.  **Phase Breakdown Section:**
    Group and format all tracks under their respective phases:

    -   **Active Phase (Phase 1):**
        -   Format: `### Phase 1: <Name> (Active) [<completed>/<total> tracks (<percentage>%)]`
        -   Track entries:
            -   `[x] <track_id>` — <Title> (<branch>)
            -   `[~] <track_id>` — <Title> (<branch>) [ACTIVE]
            -   `[ ] <track_id>` — <Title> (<branch>) [PENDING]

    -   **Pending / Planned Phases (Phase 2+):**
        -   Format: `### Phase <N>: <Name> (Pending) [<completed>/<total> tracks (<percentage>%)]`
        -   List member tracks in execution sequence.

    -   **Completed Phases (if any):**
        -   Format: `### Completed Phases`
        -   List completed phases with completion badge: `Phase <N>: <Name> (Completed) [<total>/<total> tracks]`.

3.  **Global Metrics & Summary:**
    -   **Total Phases:** `<active> active, <pending> pending, <completed> completed (<total> total)`.
    -   **Total Tracks:** `<completed>/<total> (<overall_percentage>%)`.
    -   **Current Track In Progress:** The specific track and task currently marked `in_progress`.
    -   **Next Action Needed:** The next pending task in Phase 1.
    -   **Blockers:** Any blocked tracks, morning presents (`🎁`), or active issues.
    -   **Latest Quality Report:** Key metrics from git quality notes if available (pass rate, findings, token spend).

### 4.2 Targeted Phase Inspection Mode (`--phase` flag)
When `--phase=<target>` is supplied:

1.  **Validate Target Phase:**
    -   Locate the requested phase by ordinal or symbolic ID.
    -   If not found, announce:
        `"Phase '<target>' not found. Available phases: <list_of_available_phases>."` and halt.

2.  **Output Phase Deep-Dive:**
    -   **Phase Title:** `Phase <Ordinal>: <Name> (<Status>)`
    -   **Symbolic Phase ID:** `<phase_id>`
    -   **Progress Bar & Stats:** `[<completed>/<total> tracks (<percentage>%)]`
    -   **Track Roster:**
        Detailed table or list of tracks in this phase:
        -   Track ID & Title
        -   Status (`[x]` Complete, `[~]` In Progress, `[ ]` Planned)
        -   Target Branch
        -   Active / Pending Tasks count
        -   Checkpoint SHA / Quality report link (for completed tracks)
    -   **Phase Blockers / Presents:** Any failed tracks or morning presents within this phase.
    -   **Navigation Hint:** `"To switch active phase to this phase, run: /superconductor:phase switch <phase_id>"`
