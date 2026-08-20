# Specification: Autonomous Track Lifecycle, Dynamic Target Integration & Continuous Intelligence Auto-Sync

**Track ID:** `autonomous_lifecycle_intelligence_sync_20260820`  
**Priority:** P0  
**Target Branch:** Configurable (Resolved from `tech-stack.md` -> CLI/Prompt override -> `main`)  
**Status:** Planned

---

## 1. Overview & Vision
Superconductor delivers a spec-driven multi-agent framework, but currently suffers from three critical workflow gaps:
1. **Intelligence Snapshot Drift:** Codebase intelligence manifests fall hundreds of commits behind HEAD because incremental sync is not hooked into agent checkpoint commits or headless runs.
2. **Fragmented Merging & Archival:** Merging hardcodes `main`, and track archival is split between `superconductor/archive/` and `superconductor/tracks/archive/`, while headless mode stalls at sign-off gates.
3. **Review Protocol Loopholes & Path Failures:** Permissive language in review skills allows LLMs to simulate reviews in-process, and relative script paths fail in external user repositories.

This track establishes a **Zero-Touch Autonomous Track Lifecycle**:
- **Continuous 5-Tier Code Intelligence Auto-Sync:** Keeps snapshots permanently fresh (<10 commits drift).
- **Dynamic Branch Integration & Canonical Archiving:** Merges into the project-configured target branch (`main`, `dev`, `release`) and archives completed tracks transactionally into `superconductor/tracks/archive/<track_id>`.
- **Zero-Touch Headless Execution:** Unifies interactive and headless execution so that a green 4-agent Quorum (`security`, `correctness`, `adversarial`, `regression`) + Oracle `READY` automatically triggers HMAC sign-off, git merge, and archival.
- **Quorum Protocol Hardening:** Eliminates in-process review loopholes, mandates `invoke_subagent` for all 4 roles, and provides dynamic `$SUPERCONDUCTOR_DIR` script path resolution.

---

## 2. Architecture Committee Recommendations & Synthesis
- **Oracle Recommendation:** Implement `IntelligenceAutoSyncEngine` hooked directly into `CheckpointOrchestrator` after each phase commit; introduce `SignOffGate.recordAutonomousSignOff()` to enable unblocked headless factory runs.
- **Reviewer Recommendation:** Eliminate *"or execute their roles directly in parallel"* from `skills/standalone-review/SKILL.md`; modernize `commands/superconductor/review.toml` and `skills/review/SKILL.md` to mandate `invoke_subagent`; resolve scripts via `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}`.
- **Dreamer Recommendation:** Implement 3-tier merge resolution (Clean -> AST-Level -> LLM Arbiter) and unified ANSI/JSONL telemetry streamer.
- **Research Findings:** Unify `ArchiveManager` to `superconductor/tracks/archive/`, integrate `GitWorkflowManager` target branch resolution with `tech-stack.md`, and expose `kernel_intelligence_refresh` via MCP.

---

## 3. Research Notes (State-of-the-Art Agentic Engineering)
- **Shared State Management:** Autonomous multi-agent swarms require explicit write-time mediation and worktree isolation to prevent merge chaos.
- **Continuous Intelligence:** Code intelligence must be incrementally re-indexed at sub-second speeds per checkpoint commit to prevent stale graph queries during planning and review.
- **3-Tier Conflict Resolution:** Combining fast Git auto-merge with AST-level interface/type unioning and LLM semantic arbitration eliminates manual merge bottlenecks.

---

## 4. Functional Requirements

### FR-1: Review Protocol & Quorum Dispatch Hardening
- **FR-1.1:** Update `skills/standalone-review/SKILL.md` to remove all permissive in-process simulation language and mandate `invoke_subagent` for the 4 distinct review roles.
- **FR-1.2:** Update `commands/superconductor/review.toml` and `skills/review/SKILL.md` to orchestrate 4-agent Quorums via `invoke_subagent`.
- **FR-1.3:** Update all skill script references to resolve dynamically via `$SUPERCONDUCTOR_DIR` or the plugin root.

### FR-2: 5-Tier Continuous Code Intelligence Auto-Sync
- **FR-2.1:** Implement `IntelligenceAutoSyncEngine` in `packages/superconductor-core/src/intelligence/` to compute commit deltas (`git diff <lastSha>..HEAD`) and incrementally update AST/complexity/symbols.
- **FR-2.2:** Hook `IntelligenceAutoSyncEngine` into `CheckpointOrchestrator.run()` to trigger incremental sync immediately after every phase checkpoint commit.
- **FR-2.3:** Add preflight auto-healing in `skills/implement/SKILL.md` and `skills/new-track/SKILL.md`: if `kernel_intelligence_status` reports `STALE`, auto-run sync before proceeding.
- **FR-2.4:** Expose `kernel_intelligence_refresh` in `superconductor-kernel` MCP server and CLI.
- **FR-2.5:** Run immediate intelligence sync to clear the existing 310-commit drift in the repository.

### FR-3: Dynamic Target Branch Integration & Git Reconciliation
- **FR-3.1:** Update `mergeTrack` CLI and `GitWorkflowManager` to resolve target branch dynamically from `tech-stack.md` (`Development Preferences -> Target Branch`), falling back to CLI flags or `main`.
- **FR-3.2:** Verify working tree cleanliness and enforce pre-merge test validations before performing `--no-ff` merge.
- **FR-3.3:** Inject cryptographic Swarm Authorizer trailers and Oracle verdicts into the merge commit body.

### FR-4: Canonical Track Archiving
- **FR-4.1:** Unify `ArchiveManager` canonical directory to `superconductor/tracks/archive/<track_id>`.
- **FR-4.2:** Provide auto-migration for legacy tracks located in `superconductor/archive/` to `superconductor/tracks/archive/` and update `superconductor/archive.md`.
- **FR-4.3:** Enforce transactional file-locking with rollback safety when moving tracks and modifying `tracks.md`.

### FR-5: Unified Headless Factory Pipeline & Sign-Off Gate
- **FR-5.1:** Update `SignOffGate` in `superconductor-core`: in headless mode, when Quorum is unanimous `RESOLVED` and Oracle is `READY`, issue verified autonomous HMAC sign-off record.
- **FR-5.2:** Implement `TrackLifecycleOrchestrator` to seamlessly chain: Preflight -> Tasks (TDD) -> Checkpoints + Git Notes + Auto-Sync -> Quorum -> Oracle -> Dynamic Merge -> Canonical Archival.

---

## 5. Acceptance Criteria
- [ ] **AC-1:** `skills/standalone-review/SKILL.md` and `skills/review/SKILL.md` strictly require `invoke_subagent` for all 4 reviewer roles with zero in-process simulation loopholes.
- [ ] **AC-2:** All script invocations across skills resolve properly in both internal and external target repository workspaces.
- [ ] **AC-3:** `IntelligenceAutoSyncEngine` executes incrementally on phase checkpoint commits and keeps `00_manifest.json` within 10 commits of HEAD.
- [ ] **AC-4:** `kernel_intelligence_status` MCP tool returns `LIVE` after repository re-indexing.
- [ ] **AC-5:** `mergeTrack` and `GitWorkflowManager` successfully merge into user-specified branches (`dev`, `main`, etc.) with valid swarm trailers.
- [ ] **AC-6:** `ArchiveManager` moves completed tracks to `superconductor/tracks/archive/<track_id>` and atomically updates `tracks.md` and `archive.md`.
- [ ] **AC-7:** In headless mode (`--headless`), tracks execute end-to-end through sign-off, merge, and archival without human blocking prompts.
- [ ] **AC-8:** All existing and new test suites pass with >80% code coverage.
