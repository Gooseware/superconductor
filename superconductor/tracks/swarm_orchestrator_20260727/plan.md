# Implementation Plan: Swarm Orchestrator Protocol

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** dynamic (quorum-gated, domain-count-bounded)
**Oracle Cadence:** every 4 tasks
**Estimated Track Token Budget:** ~0.8M tokens · ~$0.04 at Flash rates

### Wave Schedule

| Wave | Phase | Tasks | Est. Duration |
|---|---|---|---|
| 1 | Phase 0 | Swarm Preflight | ~3 min |
| 2 | Phase 1 | Topography Map Infrastructure | ~25 min |
| 3 | Phase 2 | Keyhole Feedback Payload Generator | ~20 min |
| 4 | Phase 3 | Domain-Affinity Implementor Routing | ~25 min |
| 5 | Phase 4 | Inline Quorum Gate & Quorum-Gated Parallelism | ~20 min |
| 6 | Phase 5 | Root Agent Decoupling | ~15 min |
| 7 | Phase 6 | swarm-execute Skill & Command | ~15 min |
| 8 | Phase 7 | Integration & Finalization | ~10 min |

---

## Phase 0: Swarm Preflight
- [x] Task: Verify `swarm-orchestrate` skill is installed and loaded [TIER-2:TCS=2] [AGENT:superconductor-processor]
- [x] Task: Run full-repository baseline quorum review (Security + Correctness + Adversarial + Regression panels) to produce the initial Topography Map and Findings Queue [TIER-4:TCS=5] [AGENT:superconductor-reviewer]
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Topography Map Infrastructure
- [ ] Task: Write failing tests for `TopographyMap` data structure — must serialize domain partitions, dependency graph, hotspots, test coverage gaps, and findings queue [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Write failing tests for `DomainPartitioner` — must accept a repo scan result and produce non-overlapping domain boundaries with associated file lists [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Implement `TopographyMap` data model in `packages/superconductor-core/src/intelligence/` extending existing `codebase-chunker.ts` and `dependency-analyzer.ts` [TIER-3:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Implement `DomainPartitioner` that reads from `TopographyMap` and outputs an array of `DomainPartition` objects (id, files[], hotspotScore, coverageGap%) [TIER-3:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Integrate `TopographyMap` generation into the baseline review output — quorum review results must be serialized to `superconductor/tracks/<id>/topography.json` [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Topography Map Infrastructure' (Protocol in workflow.md)

## Phase 2: Keyhole Feedback Payload Generator
- [ ] Task: Write failing tests for `KeyholeFeedbackExtractor` — given a ReviewFinding + file content, must return only the finding message + ±50 lines context + original WorkUnit spec, nothing else [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Write failing tests asserting that the keyhole payload contains NO full-file content, NO branch diffs beyond the immediate finding scope, and NO cross-domain findings [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Implement `KeyholeFeedbackExtractor` in `packages/superconductor-core/src/review/` as an enhancement to `aggregate-findings.ts` [TIER-3:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Update `QuorumReviewLoop` in `packages/engine/src/verification/quorum-review-loop.ts` to use `KeyholeFeedbackExtractor` when calling `remediateFn` instead of passing full file/branch diffs [TIER-3:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Add state hash tracking to `QuorumReviewLoop` — detect thrashing (same diff hash recurring) and halt with `THRASH_DETECTED` status [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Keyhole Feedback Payload Generator' (Protocol in workflow.md)

## Phase 3: Domain-Affinity Implementor Routing
- [ ] Task: Write failing tests for `WorkUnit` data model — must have UnitID, DomainScope (file list), Spec, State machine, ImplementorID [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Write failing tests for `ImplementorRegistry` — must map ImplementorID → WorkUnit and support domain-affinity lookup (given a finding's file path, return the responsible ImplementorID) [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Implement `WorkUnit` and `WorkUnitStateMachine` in `packages/superconductor-core/src/track/` [TIER-3:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Implement `ImplementorRegistry` with domain-affinity routing in `packages/engine/src/dispatcher/` [TIER-3:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Wire `ImplementorRegistry` into `ParallelDispatcher` — when a finding arrives, pause ONLY the affected implementor and route the keyhole payload to them [TIER-4:TCS=5] [AGENT:superconductor-oracle]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Domain-Affinity Implementor Routing' (Protocol in workflow.md)

## Phase 4: Inline Quorum Gate & Quorum-Gated Parallelism
- [ ] Task: Write failing tests for inline quorum gate — a WorkUnit must NOT transition to `DONE` state without a `ConsensusArtifact` with `allGreen: true` [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Write failing tests for quorum-gated parallelism — when WorkUnit A receives a red finding, WorkUnit B (different domain) must continue executing [TIER-2:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Implement `ConsensusArtifact` schema in `packages/superconductor-core/src/track/swarm-authorizer.ts` (extend existing) [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Embed `QuorumReviewLoop` call directly into `ParallelDispatcher` worker stream — workers cannot mark tasks DONE without inline quorum approval [TIER-4:TCS=5] [AGENT:superconductor-oracle]
- [ ] Task: Implement hierarchical conflict arbitration — Security > Performance > UX — in Oracle escalation path, ruling documented in `ConsensusArtifact.arbitrations[]` [TIER-3:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Inline Quorum Gate & Quorum-Gated Parallelism' (Protocol in workflow.md)

## Phase 5: Root Agent Decoupling
- [ ] Task: Write failing tests for `SwarmOrchestratorCLI` — must accept a `topography.json` + `plan.md` and emit structured WorkUnit dispatch commands without requiring LLM prompt overhead [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Refactor `scripts/quorum-review.ts` to be a deterministic CLI harness (no LLM orchestration logic) that the root agent can delegate to via a single `execFile` call [TIER-3:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Implement `SwarmOrchestratorCLI` in `packages/superconductor-core/src/cli/` — reads topography map, dispatches work units, streams live swarm status to stdout [TIER-3:TCS=4] [AGENT:superconductor-processor]
- [ ] Task: Update `GEMINI.md` swarm guardrails to enforce root agent pure-delegator role (root agent calls `swarm-execute`, never directly modifies `packages/*/src/**`) [TIER-2:TCS=2] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Root Agent Decoupling' (Protocol in workflow.md)

## Phase 6: `swarm-execute` Skill & Command
- [ ] Task: Write failing tests for `swarm-execute` skill invocation — must accept a track ID, load the topography map, and orchestrate implementors + quorum reviewers [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Create `skills/swarm-execute/SKILL.md` defining the skill protocol: delegator entry point, topography map loading, implementor swarm dispatch, quorum-gated review loop, consensus artifact generation [TIER-3:TCS=4] [AGENT:superconductor-dreamer]
- [ ] Task: Publish `swarm-execute` skill to `~/.gemini/config/plugins/superconductor/skills/swarm-execute/` [TIER-2:TCS=2] [AGENT:superconductor-processor]
- [ ] Task: Add `/superconductor:swarm-execute` slash command entry in skill catalog and verify it is discoverable [TIER-2:TCS=2] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: `swarm-execute` Skill & Command' (Protocol in workflow.md)

## Phase 7: Integration & Finalization
- [ ] Task: Run end-to-end smoke test — invoke `/superconductor:swarm-execute` on a sample track, verify Topography Map is produced, implementors run concurrently, red findings route to correct agents, ConsensusArtifact is generated [TIER-4:TCS=5] [AGENT:superconductor-oracle]
- [ ] Task: Integrate track `swarm_orchestrator_20260727` into `main` branch [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Integration & Finalization' (Protocol in workflow.md)
