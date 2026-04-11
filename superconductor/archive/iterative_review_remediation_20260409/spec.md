# Specification: Iterative Code Review & Remediation Workflow

## Overview
Enhance the Superconductor track lifecycle to support an iterative code review and remediation process before the final cleanup phase. The Oracle (Code Reviewer) will review the changes, and any necessary modifications will be appended as new tasks to the track. The coding agent will complete these tasks, triggering subsequent reviews until the code is approved by both the Oracle and the User.

## Functional Requirements
1. **Remediation Phase Generation:** When the Oracle identifies necessary changes during a review, a new dedicated "Review Remediation" phase must be generated and appended to the track's `plan.md`.
2. **Iterative Review Loop:** If the Oracle rejects the modifications during a subsequent review, the system must generate another round of remediation tasks, creating an iterative loop.
3. **Trigger Mechanisms:** The coding agent must signal readiness for a re-review using multiple mechanisms:
   - Updating a specific status flag or section in `plan.md`.
   - Utilizing a custom CLI command (e.g., `/superconductor:review`).
   - Using a specific Git commit message convention (e.g., `ready-for-review`).
4. **Two-Stage Approval Process:** The final approval to proceed to the cleanup phase requires a two-stage process:
   - First, the Oracle must automatically approve the changes based on its checks.
   - Second, the User must manually review and provide final approval.

## Non-Functional Requirements
- The remediation loop should not overwrite the original track history; instead, it should append new phases to maintain an audit trail.

## Acceptance Criteria
- A failed Oracle review successfully generates a "Review Remediation" phase in `plan.md`.
- The coding agent can use the CLI command, git commit, and `plan.md` updates to trigger a re-review.
- A subsequent failed review generates another iteration of remediation tasks.
- The cleanup phase is strictly blocked until both the Oracle and the User approve the final state.

## Out of Scope
- Changes to the core functionality of the Oracle's static analysis or linting rules (this track focuses on the workflow/lifecycle logic).