# Specification: Autonomous Track Lifecycle, Dynamic Target Integration, Intelligence Auto-Sync & Command/Skill Streamlining

**Track ID:** `autonomous_lifecycle_intelligence_sync_20260820`  
**Priority:** P0  
**Target Branch:** Configurable (Resolved from `tech-stack.md` -> CLI/Prompt override -> `main`)  
**Status:** Planned

---

## 1. Overview & Vision
Superconductor delivers a spec-driven multi-agent framework, but currently suffers from critical workflow gaps and structural debt:
1. **Intelligence Snapshot Drift:** Codebase intelligence manifests fall hundreds of commits behind HEAD because incremental sync is not hooked into agent checkpoint commits or headless runs.
2. **Fragmented Merging & Archival:** Merging hardcodes `main`, and track archival is split between `superconductor/archive/` and `superconductor/tracks/archive/`, while headless mode stalls at sign-off gates.
3. **Review Protocol Loopholes & Path Failures:** Permissive language in review skills allows LLMs to simulate reviews in-process, and relative script paths fail in external user repositories.
4. **Command & Skill Duplication / Drift:** 9 command TOML files contain ~121 KB (1,704 lines) of duplicate, drifting prompts with 68 legacy `ask_user` invocations, deprecated Plan Mode tools, and monolithic single-agent prompts that contradict the 4-agent swarm architecture.
5. **Skill Catalog Desynchronization & Fragmentation:** 26 of 40 local skills are missing from `catalog.md`, deprecated skills (`swarm-orchestrate`) compete with modern replacements (`swarm-execute`), review skills are triplicated (`review`, `standalone-review`, `code-review-skill`), and 11 Design OS micro-skills invoke obsolete `astryx` CLI commands.

This track establishes a **Zero-Touch Autonomous Track Lifecycle and Streamlined Command/Skill Architecture**:
- **Continuous 5-Tier Code Intelligence Auto-Sync:** Keeps snapshots permanently fresh (<10 commits drift).
- **Dynamic Branch Integration & Canonical Archiving:** Merges into the project-configured target branch (`main`, `dev`, `release`) and archives completed tracks transactionally into `superconductor/tracks/archive/<track_id>`.
- **Zero-Touch Headless Execution:** Unifies interactive and headless execution so that a green 4-agent Quorum (`security`, `correctness`, `adversarial`, `regression`) + Oracle `READY` automatically triggers HMAC sign-off, git merge, and archival.
- **Thin Command Architecture:** Refactors all 9 `commands/superconductor/*.toml` files into lightweight delegates pointing directly to canonical `skills/*/SKILL.md` files (96.5% reduction in prompt duplication).
- **Consolidated Skills Suite & Synchronized Catalog:** Prunes deprecated skills and duplicate `.skill` binary archives, unifies review skills into a canonical dual-mode engine, modernizes Design OS skills to use `superconductor-kernel` MCP tools, and synchronizes `skills/catalog.md`.

---

## 2. Architecture Committee Recommendations & Synthesis
- **Oracle Recommendations:**
  - Implement `IntelligenceAutoSyncEngine` hooked directly into `CheckpointOrchestrator` after each phase commit; introduce `SignOffGate.recordAutonomousSignOff()` for unblocked headless factory runs.
  - Consolidate the 40-skill suite into 4 clean domains (Core Lifecycle, Reviewer Personas, Design OS Suite, Support/Utilities) with standardized frontmatter and synchronized `catalog.md`.
- **Reviewer Recommendations:**
  - Eliminate *"or execute their roles directly in parallel"* from review skills; mandate `invoke_subagent` for all 4 roles (`security-reviewer`, `correctness-reviewer`, `adversarial-reviewer`, `regression-reviewer`).
  - Adopt the "Thin Command" delegate pattern established by `models.toml` across all 9 TOML commands to eliminate 1,704 lines of duplicate prompts and eradicate legacy `ask_user` schemas.
  - Dynamically resolve script paths via `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}`.
- **Dreamer Recommendations:**
  - Implement Unified Command Dispatcher with sub-10ms deterministic preflight and universal flag matrix (`--fast`, `--headless`, `--grill`, `--target=<ref>`, `--dry-run`).
  - Introduce 3-tier merge conflict resolution (Git -> AST-level -> Semantic LLM arbiter) and real-time ANSI/JSONL telemetry streaming.
- **Research Findings:**
  - Unify `ArchiveManager` to `superconductor/tracks/archive/`, integrate `GitWorkflowManager` target branch resolution with `tech-stack.md`, and expose `kernel_intelligence_refresh` via MCP.

---

## 3. Research Notes (State-of-the-Art Agentic Engineering)
- **Shared State Management:** Autonomous multi-agent swarms require explicit write-time mediation and worktree isolation to prevent merge chaos.
- **Continuous Intelligence:** Code intelligence must be incrementally re-indexed at sub-second speeds per checkpoint commit to prevent stale graph queries during planning and review.
- **Thin Command Dispatch:** Modern CLI architectures decouple slash command entrypoints from operational logic, treating skills as the single source of truth to avoid prompt drift.
- **Progressive Token Optimization:** Tiered skill injection (L0 Invariant rules, L1 Operational guides, L2 Deep references) reduces token burn by >40% across multi-agent loops.

---

## 4. Functional Requirements

### FR-1: Command Streamlining ("Thin Command" Architecture)
- **FR-1.1:** Refactor all 9 command TOML files in `commands/superconductor/` (`setup.toml`, `newTrack.toml`, `implement.toml`, `review.toml`, `revert.toml`, `status.toml`, `triage.toml`, `models.toml`, `yolo.toml`) to use the lightweight delegate pattern.
- **FR-1.2:** Eliminate all 68 occurrences of legacy `ask_user` multi-field JSON schema structures and deprecated Plan Mode tool references from the TOML commands.
- **FR-1.3:** Fix `yolo.toml` to include a valid prompt delegation block.

### FR-2: Review Protocol & Quorum Dispatch Hardening
- **FR-2.1:** Update review skills to remove all permissive in-process simulation language and strictly mandate `invoke_subagent` for all 4 distinct review roles.
- **FR-2.2:** Unify `skills/review/` and `skills/standalone-review/` into a single canonical `skills/review/SKILL.md` supporting both Track-Aware Mode and Zero-Context Standalone Mode.
- **FR-2.3:** Update all skill script references to resolve dynamically via `$SUPERCONDUCTOR_DIR` or the plugin installation root.

### FR-3: Skills Catalog Synchronization & Lifecycle Pruning
- **FR-3.1:** Prune deprecated `skills/swarm-orchestrate/` and redirect all references to `skills/swarm-execute/`.
- **FR-3.2:** Delete stray duplicate archive `skills/superconductor-kernel-dogma.skill`.
- **FR-3.3:** Clean and modularize `skills/code-review-skill/`, extracting language reference sheets to `skills/references/languages/` and stripping repository overhead.
- **FR-3.4:** Modernize Design OS skills to utilize `superconductor-kernel` MCP server tools (`registry_list_blocks`, `registry_install`, `registry_fix_dogma`) instead of legacy `astryx` shell commands.
- **FR-3.5:** Standardize YAML frontmatter across all skills and regenerate `skills/catalog.md` to accurately index all active local and ecosystem skills.

### FR-4: 5-Tier Continuous Code Intelligence Auto-Sync
- **FR-4.1:** Implement `IntelligenceAutoSyncEngine` in `packages/superconductor-core/src/intelligence/` to compute commit deltas (`git diff <lastSha>..HEAD`) and incrementally update AST/complexity/symbols.
- **FR-4.2:** Hook `IntelligenceAutoSyncEngine` into `CheckpointOrchestrator.run()` to trigger incremental sync immediately after every phase checkpoint commit.
- **FR-4.3:** Add preflight auto-healing in `skills/implement/SKILL.md` and `skills/new-track/SKILL.md`: if `kernel_intelligence_status` reports `STALE`, auto-run sync before proceeding.
- **FR-4.4:** Expose `kernel_intelligence_refresh` in `superconductor-kernel` MCP server and CLI.
- **FR-4.5:** Run immediate intelligence sync to clear the existing 310-commit drift in the repository.

### FR-5: Dynamic Target Branch Integration & Git Reconciliation
- **FR-5.1:** Update `mergeTrack` CLI and `GitWorkflowManager` to resolve target branch dynamically from `tech-stack.md` (`Development Preferences -> Target Branch`), falling back to CLI flags or `main`.
- **FR-5.2:** Verify working tree cleanliness and enforce pre-merge test validations before performing `--no-ff` merge.
- **FR-5.3:** Inject cryptographic Swarm Authorizer trailers and Oracle verdicts into the merge commit body.

### FR-6: Canonical Track Archiving
- **FR-6.1:** Unify `ArchiveManager` canonical directory to `superconductor/tracks/archive/<track_id>`.
- **FR-6.2:** Provide auto-migration for legacy tracks located in `superconductor/archive/` to `superconductor/tracks/archive/` and update `superconductor/archive.md`.
- **FR-6.3:** Enforce transactional file-locking with rollback safety when moving tracks and modifying `tracks.md`.

### FR-7: Unified Autonomous Headless Factory Pipeline & Sign-Off Gate
- **FR-7.1:** Update `SignOffGate` in `superconductor-core`: in headless mode, when Quorum is unanimous `RESOLVED` and Oracle is `READY`, issue verified autonomous HMAC sign-off record.
- **FR-7.2:** Implement `TrackLifecycleOrchestrator` to seamlessly chain: Preflight -> Tasks (TDD) -> Checkpoints + Git Notes + Auto-Sync -> Quorum -> Oracle -> Dynamic Merge -> Canonical Archival.

---

## 5. Acceptance Criteria
- [ ] **AC-1:** All 9 `commands/superconductor/*.toml` files follow the lightweight delegate pattern with zero prompt duplication and zero legacy `ask_user` invocations.
- [ ] **AC-2:** `skills/review/SKILL.md` strictly requires `invoke_subagent` for all 4 reviewer roles with zero in-process simulation loopholes.
- [ ] **AC-3:** Deprecated `swarm-orchestrate/` and duplicate `.skill` archives are pruned; `skills/catalog.md` is 100% synchronized with the active skill set.
- [ ] **AC-4:** All script invocations across skills resolve properly in both internal and external target repository workspaces via `$SUPERCONDUCTOR_DIR`.
- [ ] **AC-5:** `IntelligenceAutoSyncEngine` executes incrementally on phase checkpoint commits and keeps `00_manifest.json` within 10 commits of HEAD.
- [ ] **AC-6:** `kernel_intelligence_status` MCP tool returns `LIVE` after repository re-indexing.
- [ ] **AC-7:** `mergeTrack` and `GitWorkflowManager` successfully merge into user-specified branches (`dev`, `main`, etc.) with valid swarm trailers.
- [ ] **AC-8:** `ArchiveManager` moves completed tracks to `superconductor/tracks/archive/<track_id>` and atomically updates `tracks.md` and `archive.md`.
- [ ] **AC-9:** In headless mode (`--headless`), tracks execute end-to-end through sign-off, merge, and archival without human blocking prompts.
- [ ] **AC-10:** All existing and new test suites pass with >80% code coverage.
