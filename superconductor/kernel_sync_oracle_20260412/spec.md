# Specification: Kernel Tool Synchronization in Oracle Fix Loop

## Overview
Enhance the Oracle Code Review Loop to automatically identify when a modified tool was originally installed from the `design-os-kernel`. It must then classify the modification (Enhancement vs. Breaking Change) and propose a synchronization update back to the kernel registry.

## Functional Requirements
1. **Origin Detection (Script-Based):** 
   - Develop `superconductor/analyze_kernel_origin.js` to scan for `@design-os/kernel` code headers and check the track's `metadata.json` for `sourceUrl`.
   - **Performance:** This must be a lightweight script to avoid bloating the agent's context.
2. **Impact Classification (Hybrid):**
   - Develop `superconductor/analyze_impact.js` (using an AST parser or simple diff logic) to categorize changes:
     - **Enhancement (Minor/Patch):** New optional props, improved internals, or additive JSX.
     - **Breaking Change (Major):** Removed/renamed exports, changed prop types, or significant behavioral shifts.
   - **Protocol:** The Oracle suggests a classification based on the script's output, and the user MUST confirm before any synchronization proposal is finalized.

3. **Oracle Integration & Timing:**
   - Update `templates/oracle_review_prompt.md` to instruct the Oracle to consider "Kernel Sync" as an objective during the audit.
   - Update `commands/superconductor/implement.toml` to call the analysis scripts.
   - **Timing:** The "Sync to Kernel" proposal MUST only be presented after the local tests for the modification have passed.

4. **Synchronization Proposal:**
   - If approved by the user during the "Auto-Fix Loop" (after successful local verification), use `mcp_design-os-kernel_registry_propose_publish` to push the update with the suggested version increment.

## Non-Functional Requirements
- **Efficiency:** Use localized scripts for parsing to preserve context window space.
- **Accuracy:** Minimize false positives for "Breaking Changes" to avoid unnecessary major version bumps.

## Acceptance Criteria
- A modified kernel component is correctly identified by the origin script.
- The impact script correctly suggests the version bump based on the type of change.
- A publication proposal is drafted only when the user approves the "Sync to Kernel" action.

## Out of Scope
- Automatic publication without user approval.
- Deep refactoring of existing project code to meet kernel dogma (should be a separate track).
