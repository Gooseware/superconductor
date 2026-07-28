# Plan: Scripted Swarm Orchestrator

## Phase 1: Direct AGY SDK Integration & Quorum Persistence
- [ ] Task: Update `SwarmOrchestratorCLI` to use the Google Antigravity (AGY) SDK for spawning implementor subagents directly, replacing `ParallelDispatcher` placeholder tasks. [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Implement file-system persistence in `SwarmOrchestratorCLI` to write subagent outputs and review outputs to `.superconductor/quorum/<wu_id>/` as JSON. [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Add failing tests for agent spawning and file persistence. [TIER-2] [AGENT:superconductor-processor]

## Phase 2: Unskippable 4-Agent Quorum Enforcer
- [ ] Task: Modify the `QuorumReviewLoop` or orchestrator logic to hardcode the spawning of the 4-agent Quorum (Security, Correctness, Adversarial, Regression) for every Work Unit, overriding dynamic topography reviewers. [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Add failing tests to ensure the CLI throws or faults if the required 4 quorum agents are not successfully spawned. [TIER-2] [AGENT:superconductor-processor]

## Phase 3: Strict File-Based State Gating
- [ ] Task: Update the `WorkUnitStateMachine` and orchestrator transition logic to determine `ConsensusArtifact.allGreen` strictly by reading the quorum JSON files from disk (in `.superconductor/quorum/<wu_id>/`). [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Ensure that transitions to `WorkUnitState.DONE` are aborted and marked `FAILED` if disk-based quorum verification fails or is incomplete. [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Add failing tests verifying the deterministic gating logic based on JSON state. [TIER-2] [AGENT:superconductor-processor]

## Phase 4: Permission Management & Guardrails
- [ ] Task: Implement a permission evaluator that reads `agent-config.md` to check if swarm mode is active, and enforce tool permission revocation (`write_file`, `run_command`) on the root model session. [TIER-4] [AGENT:superconductor-oracle]
- [ ] Task: Add integration tests verifying that delegator models cannot mutate files directly during an active swarm phase. [TIER-3] [AGENT:superconductor-processor]

## Phase 5: Baking the Shenanigan Checklist
- [ ] Task: Extract the 8-item Shenanigan Checklist from `standalone-review/SKILL.md` and bake it permanently into the system prompt template for the `superconductor-reviewer` agent. [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Write tests to instantiate a `superconductor-reviewer` agent and assert the system prompt contains the checklist. [TIER-2] [AGENT:superconductor-processor]

## Phase 6: E2E Testing & Finalization
- [ ] Task: Write an E2E test verifying a full `swarm-execute` flow: implementors run via AGY SDK, output is persisted to disk, the 4-agent quorum runs automatically, and `allGreen` gating resolves correctly. [TIER-4] [AGENT:superconductor-oracle]
- [ ] Task: Integrate `scripted_swarm_orchestrator` branch into `main`. [TIER-3] [AGENT:superconductor-processor]
