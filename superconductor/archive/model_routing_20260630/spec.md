# Specification: Multi-Tier Model Routing

## Overview

Introduce a structured 4-tier model routing system into Superconductor. Tasks are annotated with a routing tier in `plan.md`. The `implement` command respects these tiers: Tier-1 tasks run as shell commands (zero inference cost) with output fed back to the LLM for interpretation; Tier-4 tasks explicitly flag a reasoning-heavy operation to the user. Model preferences are configured globally in `~/.gemini/agent-config.md` with per-project overrides in `superconductor/agent-config.md`.

## Motivation

Based on research (UPDATES.md) showing 40–85% inference cost reduction with intelligent routing while preserving 90–95% quality. Aligns with Superconductor's goal of economically sustainable, high-quality development workflows.

## Functional Requirements

### FR-1: Agent Config File (Global + Per-Project)

- A global `~/.gemini/agent-config.md` MUST be created/updated during `setup` with user-selected model preferences per tier.
- If `superconductor/agent-config.md` exists in the project, its values MUST override the global config (same pattern as workflow.md).
- The file MUST define: Tier 2 model (triage), Tier 3 model (standard code gen), Tier 4 model (frontier/reasoning), and an optional proxy endpoint.

### FR-2: Model Routing Reference Document

- A `superconductor/model-routing.md` document MUST be created as a reference, defining the 4 tiers with Gemini-specific model examples and mapping each Superconductor workflow phase to a recommended tier.

### FR-3: Tier Annotations in Generated Plans

- `newTrack.toml` MUST append a `[TIER-N]` hint to each task line in the generated `plan.md`.
- Annotation rules:
  - `[TIER-1]`: File existence checks, git ops, test runners, regex validation, shell-executable operations
  - `[TIER-2]`: Plan parsing, intent classification, routing decisions, simple summaries
  - `[TIER-3]`: Code generation, applying style guides, writing tests, semantic judgment
  - `[TIER-4]`: Complex architectural refactoring, cascading failure resolution, multi-file structural changes

### FR-4: Tier-Aware Execution in `implement.toml`

- Before executing each task, the agent MUST read the `[TIER-N]` annotation.
- `[TIER-1]` tasks: Execute via `run_shell_command`. Feed the output back as structured context for LLM interpretation of the next step (shell-for-execution, LLM-for-interpretation pattern).
- `[TIER-4]` tasks: Announce to the user: "This task requires deep reasoning (Tier 4). Using [configured Tier 4 model]." Then proceed.
- `[TIER-2]` and `[TIER-3]`: Standard execution with no special announcement.

### FR-5: Setup Integration

- `setup.toml` MUST include a new "Agent Model Configuration" section that:
  - Asks the user which models they prefer for Tier 3 and Tier 4
  - Writes the result to `~/.gemini/agent-config.md` (global)
  - Optionally writes a project-level override to `superconductor/agent-config.md`
  - Skips this step gracefully if the user declines

### FR-6: Universal File Resolution Protocol Update

- `GEMINI.md` MUST be updated to register `agent-config.md` so it can be resolved by the Universal File Resolution Protocol.

## Non-Functional Requirements

- Tier annotations MUST NOT break existing plan parsing in `implement.toml`.
- The global config MUST be created idempotently (not overwritten if it already exists, unless user confirms).
- The feature MUST degrade gracefully if no `agent-config.md` exists — fall back to current single-model behaviour.

## Acceptance Criteria

- Running `/superconductor:setup` creates a global `~/.gemini/agent-config.md` with tier model preferences.
- Running `/superconductor:newTrack` generates a `plan.md` with `[TIER-N]` annotations on each task.
- Running `/superconductor:implement` on a plan with `[TIER-1]` tasks executes them via `run_shell_command` and passes results back as context.
- A `superconductor/agent-config.md` in the project directory overrides global model preferences.

## Out of Scope

- Actual API-level model switching (Superconductor instructs the agent; the platform handles model selection).
- LiteLLM/OpenRouter proxy configuration beyond storing the endpoint string.
- Cost tracking or token counting dashboards.
