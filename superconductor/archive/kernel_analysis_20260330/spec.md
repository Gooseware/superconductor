# Specification: design-os-kernel Inclusion Analysis

## Overview
Enhance the Superconductor workflow by adding an automatic analysis step at the end of each phase/track. This step will identify newly created componentry that could be added to the `design-os-kernel` to maintain a high-quality, reusable Golden Source of components.

## Functional Requirements
1. **Trigger:** Automatically trigger the analysis during the "Phase Completion Verification and Checkpointing Protocol" and the final track finalization.
2. **Identification Methods:**
    - **New Files Scan:** Scan for newly created files in source-code directories (e.g., `src/components`, `lib/ui`).
    - **Diff Analysis:** Analyze the `git diff` of the phase/track for new component, class, or function declarations.
    - **Theme Usage Scan:** Check if the identified components utilize `design-os` tokens, themes, or primitives.
3. **Draft Proposal:** If a candidate is identified, the agent must:
    - Explain the rationale for the recommendation.
    - Draft a proposal for `design-os-kernel` publication (ready for user approval).
4. **Workflow Integration:** Officially document this step in `superconductor/workflow.md`.

## Non-Functional Requirements
- **Low Noise:** The agent should use heuristics to avoid flagging trivial, project-specific, or low-quality components.
- **Transparency:** All analysis findings (including why something was *not* flagged) should be available if requested.

## Acceptance Criteria
- `superconductor/workflow.md` is updated to include the kernel analysis step in the "Phase Completion" protocol.
- The agent successfully identifies a new component in a test scenario and drafts a kernel publication proposal.
- The user is prompted for approval before any kernel publication action is taken.

## Out of Scope
- Automatic publication without human-in-the-loop approval.
- Deep refactoring of components to make them kernel-compatible (should be handled in a separate track if needed).
