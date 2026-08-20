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
- [ ] Task: Write failing tests for review skill parsing and quorum subagent dispatch invariants [TIER-2] [AGENT:superconductor-processor]
    - [ ] Test assertion that in-process simulation language is rejected
    - [ ] Test assertion that all 4 review roles are strictly required
- [ ] Task: Refactor review skills to eliminate in-process simulation and mandate `invoke_subagent` [TIER-2] [AGENT:superconductor-processor]
    - [ ] Unify `skills/review/` and `skills/standalone-review/` into canonical dual-mode `skills/review/SKILL.md`
    - [ ] Require `invoke_subagent` for all 4 roles (`security`, `correctness`, `adversarial`, `regression`)
    - [ ] Standardize structured `json:review-findings` output schema
- [ ] Task: Update script path resolution across skills and hooks to use dynamic `$SUPERCONDUCTOR_DIR` [TIER-2] [AGENT:superconductor-processor]
    - [ ] Update script invocations in `skills/review/SKILL.md` and `skills/implement/SKILL.md`
    - [ ] Update hook paths in `scripts/hooks/install-hooks.sh` and `scripts/install-git-hook.sh`
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Quorum Review Hardening & Script Path Resolution' (Protocol in workflow.md)

---

## Phase 3: Continuous 5-Tier Code Intelligence Auto-Sync Engine
- [ ] Task: Write unit tests for `IntelligenceAutoSyncEngine` (delta calculation, incremental update, manifest refresh) [TIER-2] [AGENT:superconductor-processor]
    - [ ] Test incremental file detection from `git diff`
    - [ ] Test manifest timestamp and commit hash updates
- [ ] Task: Implement `IntelligenceAutoSyncEngine` in `packages/superconductor-core/src/intelligence/` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Create `auto-sync-engine.ts` with sub-second incremental updater
    - [ ] Export synchronization methods
- [ ] Task: Hook `IntelligenceAutoSyncEngine` into `CheckpointOrchestrator.run()` for phase checkpoint commits [TIER-3] [AGENT:superconductor-processor]
    - [ ] Trigger incremental sync immediately after git commit & git notes attachment
- [ ] Task: Implement `kernel_intelligence_refresh` tool in `packages/superconductor-kernel/` MCP server and CLI [TIER-3] [AGENT:superconductor-processor]
    - [ ] Register MCP tool schema and handler
    - [ ] Expose CLI command `npx superconductor intelligence --refresh`
- [ ] Task: Execute immediate repository re-indexing to clear the 310-commit drift and verify `kernel_intelligence_status` returns `LIVE` [TIER-2] [AGENT:superconductor-processor]
    - [ ] Run full pipeline scan
    - [ ] Verify `kernel_intelligence_status` reports `LIVE`
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Continuous 5-Tier Code Intelligence Auto-Sync Engine' (Protocol in workflow.md)

---

## Phase 4: Dynamic Target Branch Integration & Git Reconciliation
- [ ] Task: Write unit tests for multi-target branch resolution and merge operations [TIER-2] [AGENT:superconductor-processor]
    - [ ] Test target branch resolution from `tech-stack.md`
    - [ ] Test merge trailers and working copy cleanliness checks
- [ ] Task: Enhance `GitWorkflowManager` and `mergeTrack` CLI to resolve target branch from `tech-stack.md` with CLI/prompt overrides [TIER-3] [AGENT:superconductor-processor]
    - [ ] Implement `resolveTargetBranch(projectRoot, overrideBranch)`
    - [ ] Support custom branches (`main`, `dev`, `release`, etc.)
- [ ] Task: Implement pre-merge working tree verification and `--no-ff` merge execution with cryptographic Swarm Authorizer trailers [TIER-3] [AGENT:superconductor-processor]
    - [ ] Verify clean git state before merge
    - [ ] Embed Swarm-Authorized trailers and Oracle verdicts in merge commits
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Dynamic Target Branch Integration & Git Reconciliation' (Protocol in workflow.md)

---

## Phase 5: Canonical Track Archival & Registry Synchronization
- [ ] Task: Write unit tests for transactional track archival and migration [TIER-2] [AGENT:superconductor-processor]
    - [ ] Test moving track directory with rollback on failure
    - [ ] Test markdown table updates in `tracks.md` and `archive.md`
- [ ] Task: Update `ArchiveManager` in `packages/superconductor-core/src/track/archive-manager.ts` to target `superconductor/tracks/archive/<track_id>` canonically with file locking and rollback safety [TIER-3] [AGENT:superconductor-processor]
    - [ ] Update canonical directory path
    - [ ] Ensure atomic file locks on `tracks.md` and `archive.md`
- [ ] Task: Implement legacy archive migration utility to relocate tracks from `superconductor/archive/` to `superconductor/tracks/archive/` and sync `archive.md` [TIER-2] [AGENT:superconductor-processor]
    - [ ] Move existing legacy archived tracks
    - [ ] Update links and indices in `archive.md`
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Canonical Track Archival & Registry Synchronization' (Protocol in workflow.md)

---

## Phase 6: Unified Autonomous Headless Factory Pipeline & Sign-Off Gate
- [ ] Task: Write integration tests for end-to-end headless lifecycle execution [TIER-2] [AGENT:superconductor-processor]
    - [ ] Test headless auto-advance and HMAC sign-off generation
- [ ] Task: Update `SignOffGate` with `recordAutonomousSignOff()` for unblocked headless execution upon unanimous Quorum + Oracle `READY` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Implement automated sign-off generation in headless mode
- [ ] Task: Implement `TrackLifecycleOrchestrator` to orchestrate: Preflight -> Tasks (TDD) -> Checkpoints + Auto-Sync -> Quorum -> Oracle -> Dynamic Merge -> Canonical Archival [TIER-4] [AGENT:superconductor-oracle]
    - [ ] Unify interactive and headless execution state machines
- [ ] Task: Update `superconductor/workflow.md`, `skills/implement/SKILL.md`, and `skills/swarm-execute/SKILL.md` to document the unified lifecycle [TIER-2] [AGENT:superconductor-processor]
    - [ ] Document zero-touch headless execution and auto-archiving
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Unified Autonomous Headless Factory Pipeline & Sign-Off Gate' (Protocol in workflow.md)

---

## Phase 7: Integration, Full Regression & Finalization
- [ ] Task: Run full test suite across `superconductor-core`, `superconductor-kernel`, `quorum-fsm`, and `engine` (>80% coverage) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Run `npm test` across all workspaces
    - [ ] Ensure zero test failures and coverage invariants
- [ ] Task: Execute dry-run track execution in headless mode to verify zero-touch auto-signoff, merge, and archival [TIER-3] [AGENT:superconductor-processor]
    - [ ] Verify clean end-to-end flow
- [ ] Task: Run multi-agent Quorum Review panel and obtain Oracle sign-off [TIER-4] [AGENT:superconductor-oracle]
    - [ ] Dispatch 4-reviewer swarm
    - [ ] Verify Oracle readiness verdict
- [ ] Task: Integrate track 'autonomous_lifecycle_intelligence_sync_20260820' into main branch. [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Integration, Full Regression & Finalization' (Protocol in workflow.md)
