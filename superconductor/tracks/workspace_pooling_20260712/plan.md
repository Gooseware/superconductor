# Implementation Plan

## Phase 1: Enhanced Worker Lock & Pool Manager
- [x] Task: Create `WorkerPoolManager` in `packages/engine/src/concurrency/worker-pool.ts` to manage worker allocation in `~/.gemini/superconductor/workspaces/` [TIER-3]
- [x] Task: Implement JSON-based lockfile logic in `WorkerPoolManager` to track `track_id`, `pid`, `timestamp`, and `progress` [TIER-3]
- [x] Task: Add methods to detect, read, and clear orphaned worker locks [TIER-3]
- [x] Task: Write unit tests for `WorkerPoolManager` [TIER-3]

## Phase 2: Structured Workspace Synchronization
- [x] Task: Implement a robust `syncAndCleanWorkspace(workerId)` method in `WorkerPoolManager` to reset the repository state (`git fetch`, `reset --hard`, `clean -fdx`) [TIER-3]
- [x] Task: Add tests ensuring `syncAndCleanWorkspace` handles edge cases (e.g., corrupted git state) gracefully [TIER-3]

## Phase 3: JobDispatcher Integration
- [x] Task: Refactor `JobDispatcher` to use `WorkerPoolManager` instead of the legacy `WorkspaceManager` [TIER-4]
- [x] Task: Update the `JobDispatcher` execution flow to update the worker lockfile `progress` during agent spawn/execution [TIER-3]
- [x] Task: Ensure the fallback/cleanup logic correctly handles orphaned track reconstruction and worker lock release [TIER-3]
- [x] Task: Ensure final task steps correctly push to origin and merge to parent branches as needed [TIER-3]

## Phase 4: Integration & Finalization
- [x] Task: Integrate track 'workspace_pooling_20260712' into main branch. [TIER-1]
