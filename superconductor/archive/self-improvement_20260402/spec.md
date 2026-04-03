# Specification: Self-Improvement (self-improvement)

## Overview
Enable the Superconductor extension to continuously self-improve, self-heal, and proactively identify opportunities for optimization within itself, the `design-os-kernel` MCP tool, and the application it is currently working on. This includes the ability to self-suggest, self-initiate tracks, and operate in an "internal yolo" mode with appropriate safeguards.

## Functional Requirements
- **Continuous Analysis**: The agent must continuously analyze its own performance, errors reported within the harness, and the codebase it is interacting with.
- **Error Identification & Healing**: Automatically detect errors in the extension or the target application and propose/execute tracks to fix them.
- **Proactive Optimization**: Identify where existing components in `design-os-kernel` can be leveraged or improved.
- **Self-Directed Tracks**: The agent should be able to suggest and initiate new Superconductor tracks on its own.
- **Internal YOLO Mode**: Support an unsupervised mode where the agent can work tirelessly on a series of improvements, guided by internal benchmarks.
- **Safeguards & HITL**: Implement safeguards to prevent wasted effort on low-benefit tasks. Include a self-review process and optional Human-in-the-loop (HITL) checkpoints.
- **Cross-Platform Dependency Management**: 
    - The system must detect if external CLI tools (e.g., `ripgrep`) are installed.
    - If a tool is missing, provide a cross-platform installation path or strategy.
    - If a tool cannot be installed, flag it as "uninstallable" in the project metadata to prevent redundant user prompts.
    - Provide a Node.js-native fallback for critical operations when CLI tools are unavailable.

## Non-Functional Requirements
- **Strict TDD**: All self-initiated improvements must follow strict Test-Driven Development (TDD) principles.
- **Unsupervised Code Review**: Implement a mechanism for the agent to review its own changes before finalizing them.
- **Benefit Validation**: The agent must validate the expected benefit of a proposed improvement before starting a track.

## Acceptance Criteria
- The agent can self-direct continuous improvement across the extension, `design-os-kernel`, and the current application.
- The agent can successfully suggest, initiate, and complete tracks autonomously in YOLO mode.
- All changes are verified through TDD and a self-review process.
- Safeguards successfully prevent the agent from pursuing tasks with negligible benefit.

## Retrospective Findings (Session: 2026-04-02)
- **Tool Hallucination**: I called `exit_plan_mode`, which does not exist in the current harness. This indicates a need for better tool discovery or an internal registry of available capabilities.
- **Path Resolution Confusion**: Files intended for `superconductor/tracks/...` were initially written to `superconductor/` (root), overwriting critical project files like `index.md`.
- **Inefficient `replace` Operations**: Multiple failed attempts with `replace` occurred due to incorrect assumptions about whitespace and exact string matches. This highlights a need for a more robust "read-before-edit" protocol.
- **Git State Mismanagement**: Attempted to stage files that were not yet created or were in the wrong directory, leading to `git` command failures.

## Out of Scope
- Direct modification of third-party dependencies outside the project's direct control.
- Changes that violate the core Superconductor protocol or product guidelines.
