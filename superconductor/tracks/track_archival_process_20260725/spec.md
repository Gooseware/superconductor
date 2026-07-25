# Track: Track Archival Process & Regression Prevention

## Overview
Currently, completed Superconductor tracks pile up in the active `superconductor/tracks.md` registry and `superconductor/tracks/` folder, causing directory bloat and clutter. This track introduces an automated archival process that safely moves completed tracks to a dedicated archive directory (`superconductor/tracks/archive/`) and registry (`superconductor/tracks/archive/archive.md`). This process will trigger automatically during the "Finalize Track" step.

Additionally, because the archival function was previously an existing feature that was inadvertently lost, this track will introduce a **"Regression Reviewer"** to the review quorum. This new agent, alongside intelligence tooling, will monitor tracks for unintended loss of function, determining whether removed features were intentionally deprecated or accidentally dropped.

## Architectural Committee Recommendations
*   **Path Traversal Prevention:** The `track_id` must be strictly sanitized (`^[a-zA-Z0-9_-]+$`) before any filesystem operations.
*   **Transactional Safety:** The archival process must be idempotent and transaction-safe to prevent desyncs (copy folder -> append to archive -> remove from active registry -> delete original folder).
*   **Trigger Timing:** The automatic archival must happen at the very end of the `implement` skill's Finalize step, ensuring all prior reviews are fully resolved.
*   **Relative Link Preservation:** The archival script must either rewrite relative markdown links inside the track files to account for the extra `archive/` directory level, or we must mandate absolute repo paths in track plans.
*   **Regression Detection Intelligence:** The Regression Reviewer must be provided with Git diff context that highlights deleted or modified code, allowing it to specifically query the product guidelines, previous commits, and specs to deduce intent.

## Functional Requirements
*   **Archival Utility:**
    *   Create a `superconductor/tracks/archive/` directory structure.
    *   Create a track archiving script/utility (e.g. `ArchiveManager`).
    *   The script must safely append the track entry to `superconductor/tracks/archive/archive.md`, remove it from `tracks.md`, and move the physical track folder.
    *   The script must rewrite relative links in the archived `.md` files.
    *   The `/superconductor:implement` skill (or Finalize step) must automatically invoke this archiving script.
*   **Regression Reviewer Agent:**
    *   Add a new agent definition: `regression-reviewer` to the Superconductor review quorum.
    *   The agent's system prompt must instruct it to look specifically for "Loss of Function" by identifying deleted capabilities and checking them against the track `spec.md` to determine if the deletion was intentional.
    *   Integrate intelligence tooling (e.g., diff highlighting, git blame history checks) so the regression reviewer can accurately pinpoint lost functionality.

## Non-Functional Requirements
*   **Idempotency:** Re-running the archive script on an already-archived track should fail gracefully without corrupting data.
*   **Security:** Path traversal vulnerabilities must be mitigated.

## Acceptance Criteria
*   When a track completes, its folder is successfully moved to `archive/` and registry entries are updated.
*   Relative paths in the archived `plan.md` still resolve correctly.
*   The `regression-reviewer` is part of the standard review quorum and successfully flags unintended capability regressions.

## Out of Scope
*   Archiving of tracks that are still `[ ]` or `[~]`.
*   Retroactive archiving of previously completed tracks (this will be done manually or via a separate batch migration).
