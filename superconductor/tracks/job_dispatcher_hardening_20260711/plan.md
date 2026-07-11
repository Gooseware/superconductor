# Implementation Plan: Hardening Improvements for Job Dispatcher

## Phase 0: Proactive Abstractions
- [x] Task: Create `TaskLockManager` for acquiring and releasing task-specific locks [TIER-3]
- [x] Task: Create `WorkspaceManager` to handle ephemeral git cloning, pushing, and cleanup [TIER-3]
- [x] Task: Create `DaemonHeartbeat` module to register heartbeats and perform health assertions [TIER-3]
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Proactive Abstractions' (Protocol in workflow.md)

## Phase 1: Task-Level Agent Concurrency
- [x] Task: Update Job Dispatcher to query `TaskLockManager` before launching an agent for a task [TIER-3]
- [x] Task: Ensure agents or the dispatcher safely release task locks upon completion or crash [TIER-3]
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Task-Level Agent Concurrency' (Protocol in workflow.md)

## Phase 2: Workspace Isolation
- [x] Task: Modify the `agy` spawn logic to use `WorkspaceManager` for an isolated repo clone instead of the primary worktree [TIER-4]
- [x] Task: Update the commit/push flow to synchronize from the clone to the remote and safely tear down [TIER-3]
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Workspace Isolation' (Protocol in workflow.md)

## Phase 3: Heartbeat Health Checks
- [x] Task: Integrate `DaemonHeartbeat` into the primary loop of the Job Dispatcher during headless mode [TIER-3]
- [x] Task: Implement recovery and termination logic if the dispatcher loop detects a frozen state [TIER-3]
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Heartbeat Health Checks' (Protocol in workflow.md)

## Phase 4: Integration & Finalization
- [x] Task: Integrate track 'job_dispatcher_hardening_20260711' into main branch. [TIER-1]
