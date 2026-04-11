# Implementation Plan: Iterative Code Review & Remediation Workflow

## Phase 0: Proactive Abstractions
- [x] Task: Implement ReviewTriggerDetector [9dc90a8]
    - [x] Sub-task: Write unit tests for trigger parsing (Git commit parser, CLI command parser, plan.md status reader).
    - [x] Sub-task: Implement `ReviewTriggerDetector` logic.
- [ ] Task: Implement PhaseGenerator Utility
    - [ ] Sub-task: Write unit tests for dynamically appending phases to a markdown file string.
    - [ ] Sub-task: Implement `PhaseGenerator` to safely append "Review Remediation" phases to `plan.md`.
- [ ] Task: Implement ReviewApprovalState Manager
    - [ ] Sub-task: Write unit tests for state transitions (Oracle Approval, User Approval, Rejected).
    - [ ] Sub-task: Implement `ReviewApprovalState` logic.
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Proactive Abstractions' (Protocol in workflow.md)

## Phase 1: Iterative Review Loop Logic
- [ ] Task: Integrate Trigger Detection
    - [ ] Sub-task: Write tests for listening to trigger events in the track lifecycle.
    - [ ] Sub-task: Integrate `ReviewTriggerDetector` into the main track lifecycle engine.
- [ ] Task: Implement Remediation Phase Generation
    - [ ] Sub-task: Write tests for generating a new remediation phase upon an Oracle rejection.
    - [ ] Sub-task: Wire up `PhaseGenerator` to update the actual track's `plan.md` file when a review fails.
- [ ] Task: Implement Re-review Cycle
    - [ ] Sub-task: Write tests for looping the workflow back to the "Review" state from a "Remediation" state upon a trigger.
    - [ ] Sub-task: Implement the iterative loop transition logic.
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Iterative Review Loop Logic' (Protocol in workflow.md)

## Phase 2: Two-Stage Approval Process
- [ ] Task: Implement Oracle Automated Approval Gate
    - [ ] Sub-task: Write tests for blocking the cleanup phase if the Oracle hasn't approved.
    - [ ] Sub-task: Integrate the Oracle's static analysis/checks into the `ReviewApprovalState`.
- [ ] Task: Implement User Manual Approval Gate
    - [ ] Sub-task: Write tests for prompting the user for final approval after Oracle approval.
    - [ ] Sub-task: Integrate the User approval step into the `ReviewApprovalState` to unblock the cleanup phase.
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Two-Stage Approval Process' (Protocol in workflow.md)