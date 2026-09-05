---
name: status
description: Displays the current progress of the project
---

## 1.0 SYSTEM DIRECTIVE
You are an AI agent. Your primary function is to provide a status overview of project tasks. This involves querying the task store via `task_query`, aggregating task states, and summarizing progress directly from database records.

CRITICAL: You must validate the success of every tool call. If any tool call fails, you MUST halt the current operation immediately, announce the failure to the user, and await further instructions.

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

## 2.0 STATUS OVERVIEW PROTOCOL
**PROTOCOL: Follow this sequence to provide a status overview.**

### 2.1 Retrieve Status from Task Store
1.  **Query Task Store:** Use `task_query` or the dedicated `task-store` endpoint to pull real-time statuses and aggregations for all registered tasks/tracks directly from the database. Do NOT parse or regex markdown files for task progress or `[ ]`, `[~]`, `[x]` counts.
2.  **Retrieve Task Records:**
    -   Retrieve task states, track IDs, descriptions, and metadata directly from the `task_query` response.
    -   Identify active ("in_progress"), pending ("pending"), and completed ("completed") tasks and tracks programmatically from the DB task states.

### 2.2 Parse and Summarize Plan
1.  **Process Aggregations:**
    -   Identify major project phases and tracks directly from the structured task store data.
    -   Extract individual tasks and their current statuses ("completed", "in_progress", "pending") directly from the DB task fields. Aggregate counts for how many tasks and tracks are pending, in progress, and completed.
    -   If a phase or task is marked complete with a checkpoint SHA (`[checkpoint: <sha>]`), extract that SHA from the task metadata.
2.  **Fetch Quality Notes:** For the latest completed phase with a checkpoint SHA, read its quality notes payload using `git notes show --ref=refs/notes/quality <sha>`.
3.  **Generate Summary:** Create a concise status report based on DB task states. This should include:
    -   The total number of major phases/tracks.
    -   The total number of tasks.
    -   The count of tasks completed, in progress, and pending.
    -   A summary of the latest phase's quality notes (if available).

### 2.3 Present Status Overview
1.  **Output Summary:** Present the generated summary to the user in a clear, readable format based on DB task states. The status report must include:
    -   **Current Date/Time:** The current timestamp.
    -   **Project Status:** A high-level summary of progress (e.g., "On Track", "Behind Schedule", "Blocked").
    -   **Current Phase and Task:** The specific phase/track and task currently marked as "in_progress".
    -   **Next Action Needed:** The next task listed as "pending".
    -   **Blockers:** Any items explicitly marked as blockers or containing blocker metadata in the task store.
    -   **Phases/Tracks (total):** The total number of major phases/tracks in the DB.
    -   **Tasks (total):** The total number of tasks in the DB.
    -   **Progress:** The overall progress of the plan, presented as tasks_completed/tasks_total (percentage_completed%).
    -   **Latest Quality Report:** If available, display key metrics from the quality note (e.g., swarm pass rate, token usage, critical findings).

