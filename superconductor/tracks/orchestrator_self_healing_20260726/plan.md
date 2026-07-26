# Implementation Plan: Orchestrator Self-Healing & Brownfield Quorum Reviews

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 4 tasks)
**Estimated Track Token Budget:** ~0.2M tokens · ~$0.01 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify `swarm-orchestrate` skill is insta... | flash_lite | 19K | ~6 min |
| 2 | Task: Write failing unit tests for the recovery... | flash_lite | 28K | ~9 min |
| 3 | Task: Write failing tests for triggering a full... | flash_lite | 38K | ~12 min |
| 4 | Task: Write failing tests for semantically chun... | flash_lite | 28K | ~9 min |
| 5 | Task: Write failing tests for `generateSyntheti... | flash_lite | 28K | ~9 min |
| 6 | Task: Integrate track 'orchestrator_self_healin... | flash_lite | 9K | ~3 min |

## Phase 0: Swarm Preflight
- [x] Task: Verify `swarm-orchestrate` skill is installed and loaded [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 1: Recovery Daemon (Orchestrator)
- [x] Task: Write failing unit tests for the recovery daemon logic in orchestrator [TIER-2:TCS=3] [AGENT:superconductor-processor] b213828
- [x] Task: Write failing tests for recovery daemon retry/escalation limit — daemon must stop re-injecting after N attempts and gracefully escalate [TIER-2:TCS=3] [AGENT:superconductor-processor] b213828
- [x] Task: Implement the recovery daemon to detect missing track context and re-inject `plan.md` [TIER-3:TCS=3] [AGENT:superconductor-processor] 9761576
- [x] Task: Implement configurable max re-injection retry limit and graceful escalation path on daemon (Spec §3 Reviewer, §5 NFR Safety) [TIER-3:TCS=3] [AGENT:superconductor-processor] 9761576
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Recovery Daemon (Orchestrator)' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 2: Quorum Review & Remediation Loop
- [ ] Task: Write failing tests for triggering a full 4-panel Quorum Review (Correctness, Security, Adversarial, Regression) via `/superconductor:review` [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Write failing tests for configurable max iteration limit on QuorumReviewLoop (e.g. assert loop halts after 3 remediation cycles) [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Implement QuorumReviewLoop class handling `review > remediate > review` cycle (Oracle Suggestion) [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Add configurable `maxIterations` parameter to QuorumReviewLoop (Spec §5 NFR Safety) [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Integrate QuorumReviewLoop into the `/superconductor:review` command [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Quorum Review & Remediation Loop' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 3: Brownfield Codebase Chunking
- [ ] Task: Write failing tests for semantically chunking a codebase using DependencyAnalyzer [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Write failing tests asserting chunk token budget is enforced (max 100k tokens per chunk, Spec §5 NFR Perf) [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Implement dependency-based codebase chunking logic [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Enforce 100k token cap in chunking logic; split oversized chunks by secondary dependency boundary [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Brownfield Codebase Chunking' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 4: Synthetic Onboarding Generator
- [ ] Task: Write failing tests for `generateSyntheticContext()` method in `IntelligenceSnapshotReader` (Oracle Suggestion) [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Write failing tests asserting generated `product.md`/`tech-stack.md` contain no secrets, env vars, or credentials (Spec §3 Security) [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Implement synthetic `product.md` and `tech-stack.md` generation for brownfield projects [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Implement secret/env-var scrubbing pass on synthetic output before persisting to `superconductor/` (Spec §3 Reviewer) [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Synthetic Onboarding Generator' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 5: Integration & Finalization
- [ ] Task: Run end-to-end smoke test validating all 4 Acceptance Criteria (Spec §6) on a sample project [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Integrate track 'orchestrator_self_healing_20260726' into main branch. [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=3]
