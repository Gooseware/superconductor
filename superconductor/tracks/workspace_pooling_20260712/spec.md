# Specification: Workspace Pooling for Job Dispatcher

## Overview
Optimize the `JobDispatcher` to use a pool of persistent, isolated workspaces stored outside the project repository (in `~/.gemini/superconductor/workspaces/`). Implement a robust worker lock mechanism with payload data to handle orphaned locks, workspace cleanup, and track reconstruction.

## Functional Requirements
1. **Workspace Location**: Workspaces must be stored in the user's home directory under `~/.gemini/superconductor/workspaces/` (e.g., `worker_0`, `worker_1`).
2. **Workspace Reuse & Provisioning**: 
   - `JobDispatcher` dynamically acquires an exclusive lock on an existing free worker directory.
   - If all are busy, dynamically provision a new worker directory (e.g., `worker_N`) by cloning the main repository.
3. **Enhanced Lockfiles (Orphan Handling)**:
   - Worker lockfiles must store JSON metadata containing: the assigned `track_id`, timestamp, and current progress.
   - Mechanism to identify and remove orphaned locks (e.g., if a process crashed).
   - Ability to read an orphaned lockfile to reconstruct and recover/resume the orphaned track if necessary.
4. **Structured Pre-Task Cleanup**:
   - Provide a dedicated, structured method to aggressively clean the workspace before reuse (`git fetch origin`, `git reset --hard origin/main`, `git clean -fdx`).
5. **Graceful Teardown & Merge**: After task completion (success or failure), the worker lock must be released and progress metadata updated, leaving the directory intact for future reuse. The final steps with the task will be merged into the appropriate branches of the parent repository and pushed to origin.
