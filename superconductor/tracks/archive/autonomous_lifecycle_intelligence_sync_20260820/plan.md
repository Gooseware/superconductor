# Implementation Plan: Autonomous Track Lifecycle, Dynamic Target Integration, Intelligence Auto-Sync & Command/Skill Streamlining

**Track ID:** `autonomous_lifecycle_intelligence_sync_20260820`  
**Priority:** P0  
**Target Branch:** `main`

---

## Phase 0: Swarm Preflight & Protocol Verification
- [x] Task: Verify `swarm-orchestrate` / `swarm-execute` and `superconductor-agents` skills and environment preflight [TIER-1] [AGENT:superconductor-processor] (SHA: 044c1495)
    - [x] Check skill files and dependencies
    - [x] Validate Node.js, Git, and MCP tool availability
- [x] Task: Run preflight intelligence drift check and initial sync [TIER-2] [AGENT:superconductor-processor] (SHA: 044c1495)
    - [x] Query `kernel_intelligence_status`
    - [x] Log initial drift status
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Command Streamlining ("Thin Command" Architecture) & Skill Cleanup
- [x] Task: Write unit tests for command TOML validation and delegation schemas [TIER-2] [AGENT:superconductor-processor] (SHA: 044c1495)
    - [x] Test assertion that all TOML commands have valid prompt delegation blocks
    - [x] Test assertion that legacy `ask_user` and Plan Mode tool calls are absent from TOMLs
- [x] Task: Refactor all 9 `commands/superconductor/*.toml` files to lightweight prompt delegates [TIER-1] [AGENT:superconductor-processor] (SHA: 044c1495)
    - [x] Refactor `setup.toml`, `newTrack.toml`, `implement.toml`, `review.toml`, `revert.toml`, `status.toml`, `triage.toml`, `models.toml`, `yolo.toml`
    - [x] Forward user arguments `{{args}}` cleanly to backing `SKILL.md` files
- [x] Task: Clean up deprecated artifacts and prune duplicate archives [TIER-1] [AGENT:superconductor-processor] (SHA: 044c1495)
    - [x] Remove `skills/superconductor-kernel-dogma.skill` binary zip duplicate
    - [x] Deprecate/redirect `skills/swarm-orchestrate/` to `skills/swarm-execute/`
- [x] Task: Modernize Design OS skills to use `superconductor-kernel` MCP server tools [TIER-2] [AGENT:superconductor-processor] (SHA: 044c1495)
    - [x] Replace legacy `npx astryx` commands in `design-os-*` skills with MCP tools (`registry_list_blocks`, `registry_install`, `registry_fix_dogma`)
- [x] Task: Synchronize and regenerate `skills/catalog.md` with standardized YAML frontmatter [TIER-2] [AGENT:superconductor-processor] (SHA: 044c1495)
    - [x] Update `catalog.md` to index all active local skills and ecosystem extensions
    - [x] Standardize frontmatter across all `SKILL.md` files
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Command Streamlining & Skill Cleanup' (Protocol in workflow.md)

---

## Phase 2: Quorum Review Hardening & Script Path Resolution (Recommended Fixes)
- [x] Task: Write failing tests for review skill parsing and quorum subagent dispatch invariants [TIER-2] [AGENT:superconductor-processor] (SHA: 279d85d0)
    - [x] Test assertion that in-process simulation language is rejected
    - [x] Test assertion that all 4 review roles are strictly required
- [x] Task: Refactor review skills to eliminate in-process simulation and mandate `invoke_subagent` [TIER-2] [AGENT:superconductor-processor] (SHA: 279d85d0)
    - [x] Unify `skills/review/` and `skills/standalone-review/` into canonical dual-mode `skills/review/SKILL.md`
    - [x] Require `invoke_subagent` for all 4 roles (`security`, `correctness`, `adversarial`, `regression`)
    - [x] Standardize structured `json:review-findings` output schema
- [x] Task: Update script path resolution across skills and hooks to use dynamic `$SUPERCONDUCTOR_DIR` [TIER-2] [AGENT:superconductor-processor] (SHA: 279d85d0)
    - [x] Update script invocations in `skills/review/SKILL.md` and `skills/implement/SKILL.md`
    - [x] Update hook paths in `scripts/hooks/install-hooks.sh` and `scripts/install-git-hook.sh`
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Quorum Review Hardening & Script Path Resolution' (Protocol in workflow.md)

---

## Phase 3: Continuous 5-Tier Code Intelligence Auto-Sync Engine
- [x] Task: Write unit tests for `IntelligenceAutoSyncEngine` (delta calculation, incremental update, manifest refresh) [TIER-2] [AGENT:superconductor-processor] (SHA: 279d85d0)
    - [x] Test incremental file detection from `git diff`
    - [x] Test manifest timestamp and commit hash updates
- [x] Task: Implement `IntelligenceAutoSyncEngine` in `packages/superconductor-core/src/intelligence/` [TIER-3] [AGENT:superconductor-processor] (SHA: 279d85d0)
    - [x] Create `auto-sync-engine.ts` with sub-second incremental updater
    - [x] Export synchronization methods
- [x] Task: Hook `IntelligenceAutoSyncEngine` into `CheckpointOrchestrator.run()` for phase checkpoint commits [TIER-3] [AGENT:superconductor-processor] (SHA: 279d85d0)
    - [x] Trigger incremental sync immediately after git commit & git notes attachment
- [x] Task: Implement `kernel_intelligence_refresh` tool in `packages/superconductor-kernel/` MCP server and CLI [TIER-3] [AGENT:superconductor-processor] (SHA: 279d85d0)
    - [x] Register MCP tool schema and handler
    - [x] Expose CLI command `npx superconductor intelligence --refresh`
- [x] Task: Execute immediate repository re-indexing to clear the 310-commit drift and verify `kernel_intelligence_status` returns `LIVE` [TIER-2] [AGENT:superconductor-processor] (SHA: 279d85d0)
    - [x] Run full pipeline scan
    - [x] Verify `kernel_intelligence_status` reports `LIVE`
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Continuous 5-Tier Code Intelligence Auto-Sync Engine' (Protocol in workflow.md)

---

## Phase 4: Dynamic Target Branch Integration & Git Reconciliation
- [x] Task: Write unit tests for multi-target branch resolution and merge operations [TIER-2] [AGENT:superconductor-processor] (SHA: 158823c0)
    - [x] Test target branch resolution from `tech-stack.md`
    - [x] Test merge trailers and working copy cleanliness checks
- [x] Task: Enhance `GitWorkflowManager` and `mergeTrack` CLI to resolve target branch from `tech-stack.md` with CLI/prompt overrides [TIER-3] [AGENT:superconductor-processor] (SHA: 158823c0)
    - [x] Implement `resolveTargetBranch(projectRoot, overrideBranch)`
    - [x] Support custom branches (`main`, `dev`, `release`, etc.)
- [x] Task: Implement pre-merge working tree verification and `--no-ff` merge execution with cryptographic Swarm Authorizer trailers [TIER-3] [AGENT:superconductor-processor] (SHA: 158823c0)
    - [x] Verify clean git state before merge
    - [x] Embed Swarm-Authorized trailers and Oracle verdicts in merge commits
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Dynamic Target Branch Integration & Git Reconciliation' (Protocol in workflow.md)

---

## Phase 5: Canonical Track Archival & Registry Synchronization
- [x] Task: Write unit tests for transactional track archival and migration [TIER-2] [AGENT:superconductor-processor] (SHA: 158823c0)
    - [x] Test moving track directory with rollback on failure
    - [x] Test markdown table updates in `tracks.md` and `archive.md`
- [x] Task: Update `ArchiveManager` in `packages/superconductor-core/src/track/archive-manager.ts` to target `superconductor/tracks/archive/<track_id>` canonically with file locking and rollback safety [TIER-3] [AGENT:superconductor-processor] (SHA: 158823c0)
    - [x] Update canonical directory path
    - [x] Ensure atomic file locks on `tracks.md` and `archive.md`
- [x] Task: Implement legacy archive migration utility to relocate tracks from `superconductor/archive/` to `superconductor/tracks/archive/` and sync `archive.md` [TIER-2] [AGENT:superconductor-processor] (SHA: 158823c0)
    - [x] Move existing legacy archived tracks
    - [x] Update links and indices in `archive.md`
- [x] Task: Superconductor - User Manual Verification 'Phase 5: Canonical Track Archival & Registry Synchronization' (Protocol in workflow.md)

---

## Phase 6: Unified Autonomous Headless Factory Pipeline & Sign-Off Gate
- [x] Task: Write integration tests for end-to-end headless lifecycle execution [TIER-2] [AGENT:superconductor-processor] (SHA: 158823c0)
    - [x] Test headless auto-advance and HMAC sign-off generation
- [x] Task: Update `SignOffGate` with `recordAutonomousSignOff()` for unblocked headless execution upon unanimous Quorum + Oracle `READY` [TIER-3] [AGENT:superconductor-processor] (SHA: 158823c0)
    - [x] Implement automated sign-off generation in headless mode
- [x] Task: Implement `TrackLifecycleOrchestrator` to orchestrate: Preflight -> Tasks (TDD) -> Checkpoints + Auto-Sync -> Quorum -> Oracle -> Dynamic Merge -> Canonical Archival [TIER-4] [AGENT:superconductor-oracle] (SHA: 158823c0)
    - [x] Unify interactive and headless execution state machines
- [x] Task: Update `superconductor/workflow.md`, `skills/implement/SKILL.md`, and `skills/swarm-execute/SKILL.md` to document the unified lifecycle [TIER-2] [AGENT:superconductor-processor] (SHA: 158823c0)
    - [x] Document zero-touch headless execution and auto-archiving
- [x] Task: Superconductor - User Manual Verification 'Phase 6: Unified Autonomous Headless Factory Pipeline & Sign-Off Gate' (Protocol in workflow.md)

---

## Phase 7: Integration, Full Regression & Finalization
- [x] Task: Run full test suite across `superconductor-core`, `superconductor-kernel`, `quorum-fsm`, and `engine` (>80% coverage) [TIER-3] [AGENT:superconductor-processor] (SHA: 62c5f696)
    - [x] Run `npm test` across all workspaces
    - [x] Ensure zero test failures and coverage invariants
- [x] Task: Execute dry-run track execution in headless mode to verify zero-touch auto-signoff, merge, and archival [TIER-3] [AGENT:superconductor-processor] (SHA: 62c5f696)
    - [x] Verify clean end-to-end flow
- [x] Task: Run multi-agent Quorum Review panel and obtain Oracle sign-off [TIER-4] [AGENT:superconductor-oracle] (SHA: 62c5f696)
    - [x] Dispatch 4-reviewer swarm
    - [x] Verify Oracle readiness verdict
- [ ] Task: Integrate track 'autonomous_lifecycle_intelligence_sync_20260820' into main branch. [TIER-2] [AGENT:superconductor-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 7: Integration, Full Regression & Finalization' (Protocol in workflow.md)
