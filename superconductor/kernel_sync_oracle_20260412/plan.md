# Implementation Plan: Kernel Tool Synchronization in Oracle Fix Loop

## Phase 1: Core Analysis Scripts [checkpoint: ]
- [ ] Task: Create `superconductor/analyze_kernel_origin.js`.
    - [ ] Script should accept a file path or directory and scan for `@design-os/kernel` headers.
    - [ ] Script should look for `sourceUrl` in the track's `metadata.json`.
    - [ ] Output a JSON report of all kernel-sourced files.
- [ ] Task: Create `superconductor/analyze_impact.js`.
    - [ ] Use a lightweight AST parser (like `acorn` or simple regex for common export patterns).
    - [ ] Compare current state against the "original" (if available in a cache) or analyze the `git diff`.
    - [ ] Output a classification: `patch`, `minor`, `major` with a brief rationale.
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Core Analysis Scripts' (Protocol in workflow.md)

## Phase 2: Oracle & Logic Integration [checkpoint: ]
- [ ] Task: Update `templates/oracle_review_prompt.md`.
    - [ ] Add instructions for the Oracle to identify "Kernel Sync Candidates" using the analysis scripts.
    - [ ] Define the prompt for the "Hybrid Decision Logic" (Oracle suggests, user confirms).
- [ ] Task: Update `commands/superconductor/implement.toml`.
    - [ ] Integrate the execution of `analyze_kernel_origin.js` and `analyze_impact.js` into the `6.0 ORACLE CODE REVIEW LOOP`.
    - [ ] Update the **Auto-Fix Loop & Remediation** section.
    - [ ] Add a conditional step: IF local tests have passed AND kernel sync candidate is found, propose `mcp_design-os-kernel_registry_propose_publish`.
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Oracle & Logic Integration' (Protocol in workflow.md)

## Phase 3: Verification & Finalization [checkpoint: ]
- [ ] Task: Verify the full flow with a mock kernel component.
    - [ ] Install a mock component.
    - [ ] Apply an enhancement (e.g., add an optional prop).
    - [ ] Run `/superconductor:implement`.
    - [ ] Confirm Oracle identifies it as a `patch` or `minor` update.
    - [ ] Confirm `propose_publish` is suggested AFTER tests pass.
- [ ] Task: Verify a "breaking" change scenario (e.g., rename an export).
    - [ ] Confirm Oracle correctly flags it as a `major` change.
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Verification & Finalization' (Protocol in workflow.md)
