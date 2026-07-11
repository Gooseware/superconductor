# Specification: Hardening Improvements for Job Dispatcher

## Overview
This track addresses hardening suggestions for the Job Dispatcher to improve stability, concurrency safety, and process management during asynchronous headless workflows.

## Functional Requirements
1. **Task-Level Agent Concurrency:** Allow parallel `agy` agents to run simultaneously, provided they are executing mutually exclusive tasks. Implement task-level locking (not global process locking) to ensure two agents do not pick up the same task.
2. **Workspace Isolation:** Mitigate `git worktree` lock issues by implementing a robust workspace cloning system. The dispatcher/agents will:
   - Clone the repository into a separate ephemeral workspace.
   - Perform their work and push changes to the remote.
   - Safely tear down and remove the workspace upon completion.
3. **Heartbeat Health Checks:** Introduce health-check heartbeats into the dispatcher loop to ensure it does not hang in headless or daemon mode. The dispatcher must be able to report its status and cleanly recover or terminate if a hanging state is detected.

## Out of Scope
- Global locking preventing all parallel `agy` invocations.
- Changes to the underlying LLM models or routing logic.
