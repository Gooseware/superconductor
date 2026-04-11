# Implementation Plan: Iterative Code Review & Remediation Workflow

## Phase 0: Proactive Abstractions [checkpoint: e91f612]
- [x] Task: Implement ReviewTriggerDetector [9dc90a8]
    - [x] Sub-task: Write unit tests for trigger parsing (Git commit parser, CLI command parser, plan.md status reader).
    - [x] Sub-task: Implement `ReviewTriggerDetector` logic.
- [x] Task: Implement PhaseGenerator Utility [cec55c0]
    - [x] Sub-task: Write unit tests for dynamically appending phases to a markdown file string.
    - [x] Sub-task: Implement `PhaseGenerator` to safely append "Review Remediation" phases to `plan.md`.
- [x] Task: Implement ReviewApprovalState Manager [dc8ca2a]
    - [x] Sub-task: Write unit tests for state transitions (Oracle Approval, User Approval, Rejected).
    - [x] Sub-task: Implement `ReviewApprovalState` logic.
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Proactive Abstractions' (Protocol in workflow.md) [e91f612]

## Phase 1: Iterative Review Loop Logic
- [x] Task: Integrate Trigger Detection [08062f6]
    - [x] Sub-task: Write tests for listening to trigger events in the track lifecycle.
    - [x] Sub-task: Integrate `ReviewTriggerDetector` into the main track lifecycle engine.
- [x] Task: Implement Remediation Phase Generation [c4d8db7]
    - [x] Sub-task: Write tests for generating a new remediation phase upon an Oracle rejection.
    - [x] Sub-task: Wire up `PhaseGenerator` to update the actual track's `plan.md` file when a review fails.
- [x] Task: Implement Re-review Cycle [6099de2]
    - [x] Sub-task: Write tests for looping the workflow back to the "Review" state from a "Remediation" state upon a trigger.
    - [x] Sub-task: Implement the iterative loop transition logic.
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Iterative Review Loop Logic' (Protocol in workflow.md)

## Phase 2: Two-Stage Approval Process
- [ ] Task: Implement Oracle Automated Approval Gate
    - [ ] Sub-task: Write tests for blocking the cleanup phase if the Oracle hasn't approved.
    - [ ] Sub-task: Integrate the Oracle's static analysis/checks into the `ReviewApprovalState`.
- [ ] Task: Implement User Manual Approval Gate
    - [ ] Sub-task: Write tests for prompting the user for final approval after Oracle approval.
    - [ ] Sub-task: Integrate the User approval step into the `ReviewApprovalState` to unblock the cleanup phase.
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Two-Stage Approval Process' (Protocol in workflow.md)