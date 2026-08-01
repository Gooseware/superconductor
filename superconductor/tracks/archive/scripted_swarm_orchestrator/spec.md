# Specification: Scripted Swarm Orchestrator

## Overview
Move the swarm orchestration state machine from the root LLM model's decision-making into a deterministic CLI process (`orchestrate.ts`). The root model in swarm mode should only delegate execution and go idle. The CLI script handles spawning implementors, collecting quorum outputs, gating transitions strictly on quorum consensus, and enforcing permission boundaries for the root agent.

## Core Requirements

### 1. Direct Implementor Spawning via AGY SDK
The `orchestrate.ts` script must directly invoke Implementor subagents using the AGY SDK. The root orchestrating model should no longer use `invoke_subagent` to orchestrate work units manually. The orchestrator delegates to `npx superconductor swarm-execute <track_id>`.

### 2. Quorum Output Collection
Implementor outputs and subsequent quorum review findings must be collected and saved as JSON files written strictly to `.superconductor/quorum/<wu_id>/`.

### 3. Unskippable 4-Agent Quorum
The `SwarmOrchestratorCLI` must always spawn the full 4-agent Quorum (Security, Correctness, Adversarial, Regression) for every work unit review. This bypasses the dynamic `wu.reviewers` mapping from the topography map and enforces the complete quorum review panel, mitigating the risk of models rationalizing skipped reviews.

### 4. Deterministic Gating
The transition to `WorkUnitState.DONE` (and any subsequent `git merge` or integration) must be strictly gated on the condition `ConsensusArtifact.allGreen === true`. The consensus artifact is derived from the aggregated quorum JSON files on disk.

### 5. Root Agent Permission Revocation
When swarm mode is active, the root model's `write_file` and `run_command` permissions must be revoked. A permission policy evaluator should read the configured bounds from `agent-config.md` to prevent the delegator model from sidestepping the process by writing code directly.

### 6. Embedded Shenanigan Checklist
The Shenanigan Checklist (8 specific items derived from `standalone-review/SKILL.md`) must be baked permanently into the `superconductor-reviewer` subagent's system prompt (or configuration). It should no longer be injected on a per-prompt basis by the orchestrating model, ensuring consistent enforcement against implementation drift, phantom logic, or test theater.

## Acceptance Criteria
- `SwarmOrchestratorCLI` (in `orchestrate.ts`) initializes subagents directly via the AGY SDK.
- JSON output files corresponding to work unit quorum reviews are correctly structured and persisted in `.superconductor/quorum/<wu_id>/`.
- The CLI hardcodes the required 4-agent quorum (`superconductor-reviewer` instantiated with Security, Correctness, Adversarial, Regression roles/profiles).
- Unit tests verify that a work unit cannot reach the `DONE` state if any quorum reviewer returns a finding, requiring an explicit true signal from all four files on disk.
- Unit tests verify `agent-config.md` dictates permission revocation for the root agent when swarm mode triggers.
- `superconductor-reviewer` initialization inherently contains the Shenanigan Checklist in its system prompt template.
