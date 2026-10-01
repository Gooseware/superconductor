# Implementation Plan

**Status:** [x]
**Phase:** `core-foundation`

## Phase 0: Swarm Preflight
- [x] Task: Ensure no pending regressions exist in `superconductor-core` before starting [TIER-4:TCS=1] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: 
    PROTECTED: packages/superconductor-core/src/**/*.ts
    INVARIANT_AFTER: "Core packages MUST build successfully and pass all unit tests."
    REUSES: []

## Phase 1: Topological Wave Planner (`planWaves`) & Unit Tests
- [x] Task: Implement `ExecutionPlanner.planWaves` [TIER-2:TCS=3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/superconductor-core/src/track/execution-planner.spec.ts
    PROTECTED: packages/superconductor-core/src/track/execution-planner.ts
    INVARIANT_AFTER: "The planWaves output MUST partition tracks into strict topological antichains (waves)."
    REUSES: []
    - Extract wave partitioning logic.
    - Keep `plan()` backward-compatible (`planWaves(tracks).flat()`).
    - Add comprehensive unit tests.

## Phase 2: Worktrunk Configuration & Worktree Isolation Manager Fixes
- [x] Task: Configure `.wt` and `WorktreeIsolationManager` [TIER-2:TCS=2] [AGENT:superconductor-processor] [DOMAIN:orchestration]
    CREATES: .config/wt.toml, packages/superconductor-core/src/orchestration/worktree-isolation-manager.ts
    PROTECTED: packages/superconductor-core/src/orchestration/index.ts
    INVARIANT_AFTER: "WorktreeIsolationManager MUST query `.config/wt.toml` or `wt list` to resolve paths accurately."
    REUSES: []
    - Add `.config/wt.toml` for `{{ branch | sanitize }}` worktrees and symlinks.
    - Update `WorktreeIsolationManager.getWorktreePath()`.

## Phase 3: Multi-Track Swarm Orchestrator & Serial Merge Queue
- [x] Task: Implement `MergeQueueManager` and DMQ-POP namespacing [TIER-1:TCS=4] [AGENT:superconductor-processor] [DOMAIN:orchestration]
    CREATES: packages/superconductor-core/src/orchestration/merge-queue-manager.ts
    PROTECTED: packages/superconductor-core/src/quorum/quorum-store.ts
    INVARIANT_AFTER: "Quorum paths MUST be strictly namespaced by trackId, and merges MUST be linear."
    REUSES: []
    - Build `MergeQueueManager` with mutex for `wt step push --no-ff`.
    - Namespace QuorumStore and Preflight caches to `.superconductor/tracks/${trackId}/...`.
    - Implement Reviewer/Test semaphores.

## Phase 4: Skill & Dogma Amendments
- [x] Task: Update Execution Skills [TIER-3:TCS=2] [AGENT:superconductor-processor] [DOMAIN:skills]
    CREATES: 
    PROTECTED: skills/batch-execute/SKILL.md, skills/implement/SKILL.md, skills/swarm-execute/SKILL.md, superconductor/workflow.md
    INVARIANT_AFTER: "Execution skills MUST natively instruct parallel dependency wave execution via worktrees."
    REUSES: []
    - Remove explicit sequential directives from `batch-execute/SKILL.md` and `implement/SKILL.md`.
    - Instruct use of topological waves.

## Phase 5: Comprehensive Integration Testing & Verification
- [x] Task: Multi-track simulation test [TIER-2:TCS=3] [AGENT:superconductor-processor] [DOMAIN:qa]
    CREATES: packages/superconductor-core/tests/multi-track-orchestration.spec.ts
    PROTECTED: 
    INVARIANT_AFTER: "Simulated multi-track orchestrations MUST complete cleanly without state leakage."
    REUSES: []
    - Write e2e or integration simulation running 3 concurrent tracks.

## Phase 6: Final Review & Merge Gate
- [x] Task: Complete Flash Quorum and Oracle Gate [TIER-4:TCS=1] [AGENT:superconductor-processor] [DOMAIN:qa]
    CREATES: 
    PROTECTED: 
    INVARIANT_AFTER: "All core changes MUST be approved by the Oracle gate before final merge."
    REUSES: []
    - Verify speedup, isolation, and backward compatibility.
