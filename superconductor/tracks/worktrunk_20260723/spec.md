# Specification: Adopt Worktrunk for Workspaces Workflow

## Overview
This track replaces the legacy native Git worktrees bash workflow with `worktrunk` (https://github.com/max-sixty/worktrunk). Worktrunk is a CLI tool optimized for parallel AI agent workflows and offers built-in session tracking. 

## Architectural Committee Recommendations
- Commit fully to `worktrunk` rather than maintaining a dual-path (fallback) system to minimize script complexity.
- Superconductor should enforce `worktrunk` as a core dependency and automate its installation.

## Research Notes
- Worktrunk is written in Rust and manages Git worktrees dynamically.
- Native installation often utilizes `cargo` or precompiled binaries. The automation should handle the detection of `wt` (the binary) and trigger an installation if missing.

## Functional Requirements
1. **Skill Refactor:** Refactor the `using-git-worktrees` skill (`~/.gemini/config/skills/using-git-worktrees/SKILL.md`) to execute `wt` commands instead of raw `git worktree add`.
2. **Auto-Installation Mechanism:** Enhance the Superconductor setup command (e.g. `superconductor/commands/superconductor/setup.toml` or core setup scripts) to automatically detect if `wt` is missing and install it (via `cargo install worktrunk` or script) without interrupting the workflow.
3. **Skill Cleanup:** Remove outdated bash script safety verifications that `worktrunk` handles natively.
4. **Documentation Updates:** Update `tech-stack.md` and `workflow.md` to list `worktrunk` as the standard workspace backend.

## Out of Scope
- Migrating existing legacy `.worktrees` to the `worktrunk` database (developers will manually adopt it for new feature branches).
