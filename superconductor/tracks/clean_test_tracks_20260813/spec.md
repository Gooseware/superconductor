# Specification: Clean Up Test Tracks

## Overview
The project currently has several "test" tracks in the tracks registry and task provider that are cluttering the environment. This chore track will remove these stale/test tracks to restore a clean state.

## Functional Requirements
- Identify all test tracks currently present in `superconductor/tracks.md`, `superconductor/tracks/`, and the local task database.
- The targeted test tracks include: `test_track_1786533675082`, `adv_test_track`, `test_phase4_track`, and `adv_sync_test_track`.
- Safely delete these tracks from the tracks registry (`superconductor/tracks.md`).
- Safely remove the corresponding track directories from `superconductor/tracks/`.
- Update or purge their associated tasks from the task database.

## Non-Functional Requirements
- Ensure no real (non-test) tracks or tasks are deleted.

## Acceptance Criteria
- [ ] `superconductor/tracks.md` no longer lists the test tracks.
- [ ] `superconductor/tracks/` no longer contains the directories for the test tracks.
- [ ] The task provider no longer returns pending tasks associated with these test tracks.

## Out of Scope
- Modifying any actual product features or codebase logic outside of the Superconductor management files.
