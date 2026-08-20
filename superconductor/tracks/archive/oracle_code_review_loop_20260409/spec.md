# Specification: Oracle Code Review Loop

## Overview
The **Oracle Code Review Loop** is an advanced, high-fidelity verification phase for the Superconductor framework. It leverages the "Pro" model (when selected by the user) to perform a final, comprehensive audit of a completed Track before it is finalized and archived. Unlike standard reviews, the Oracle focuses on deep semantic alignment with the specification, adherence to the technology stack, and proactive architectural improvements, such as identifying and reducing code duplication (DRY principle).

## Functional Requirements
- **Interactive Trigger:** At the end of the `implement` command (during the track cleanup phase), the agent must prompt the user to initiate an "Oracle Code Review."
- **Model Selection:** The user should be able to select between "Pro" (recommended) and "Flash" models for the review at runtime.
- **Comprehensive Audit Scope:**
    - **Spec Alignment:** Compare the final implementation against the `spec.md` to ensure all requirements are met.
    - **Plan Verification:** Verify that every task and sub-task in `plan.md` has been fully addressed.
    - **Style & Tech Compliance:** Ensure strict adherence to `superconductor/code_styleguides/` and the `tech-stack.md`.
    - **Feature Gap Identification:** Identify any missing edge cases or subtle functional gaps not explicitly captured in the initial plan but necessary for the features success.
    - **DRY Methodology Enhancement:** Analyze the changes for repeated code blocks and suggest refactoring to improve reusability and maintainability.
- **Auto-Fix Loop:** If the Oracle identifies issues, the agent should automatically attempt to apply fixes using the established TDD-style workflow (Red-Green-Refactor) and then re-verify the changes.
- **Proactive Planning (NewTrack Extension):** During the `newTrack` planning phase, the Oracle should encourage the creation of small, reusable code units for common patterns identified in the specification.

## Non-Functional Requirements
- **High Signal-to-Noise Ratio:** The Oracles findings must be actionable and clearly categorized by severity.
- **Context Preservation:** The review must maintain the full project context (Product Definition, Guidelines, etc.).

## Acceptance Criteria
- [ ] The user is prompted for an Oracle review after all implementation tasks are marked complete.
- [ ] The review process correctly identifies violations of the style guide and tech stack.
- [ ] The Oracle successfully identifies duplicated code and proposes a reusable abstraction.
- [ ] The Auto-Fix loop applies at least one corrective change that passes subsequent verification.
- [ ] The `newTrack` command includes a "Proactive Planning" tip when generating a plan.

## Out of Scope
- Automated deployment after the Oracle review.
- Support for non-Git version control systems.
