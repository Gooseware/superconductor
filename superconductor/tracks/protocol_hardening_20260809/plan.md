# Implementation Plan: protocol_hardening_20260809

**Track:** Superconductor Protocol Hardening  
**Branch:** `track/protocol_hardening_20260809`  
**Target Branch:** `main`  
**Source Spec:** `superconductor/tracks/protocol_hardening_20260809/spec.md`

---

## Phase 0: Swarm Preflight

- [x] Task: Verify `swarm-orchestrate` / `swarm-remediation` skills are installed and loaded [TIER-1] [AGENT:superconductor-processor]
    - [x] Check `.agents/skills/` and `~/.gemini/config/plugins/superconductor/skills/` for required skills
    - [x] Confirm `standalone-review` SKILL.md §9.0 (Swarm Remediation Protocol) is present
    - [x] Confirm branch `track/protocol_hardening_20260809` is created from `main`
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: QuorumValidator — Quorum Enforcement Guard

- [x] Task: Write failing tests for `QuorumValidator` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [x] Test: `validate([])` throws `QuorumInsufficientError` listing all 4 missing roles
    - [x] Test: `validate([security, correctness, adversarial])` throws listing `regression-reviewer` missing
    - [x] Test: `validate([all 4 roles])` returns `{ valid: true, panelComplete: true }`
    - [x] Test: `validate([4 roles + extra])` passes (extra reviewers OK)
    - [x] Test: `gateOracle({ quorumPassed: false })` throws `OracleGateError`
    - [x] Test: `gateOracle({ quorumPassed: true })` returns true
    - [x] Test: `QuorumPolicy` config: custom minimum count respected
    - [x] Confirm all tests fail (Red)
- [x] Task: Implement `QuorumValidator` in `packages/superconductor-core/src/orchestration/quorum-validator.ts` [TIER-3] [AGENT:superconductor-processor]
    - [x] `QuorumInsufficientError` with `missingRoles: string[]` field
    - [x] `OracleGateError` with `reason: string` field
    - [x] `QuorumPolicy` Zod schema with defaults
    - [x] `validate(panel: ReviewerRole[])` method
    - [x] `gateOracle(state: { quorumPassed: boolean })` method
    - [x] Run tests — all must pass (Green)
    - [x] Refactor (Strict Refactor Phase) — no new features
    - [x] Coverage check (>85%)
    - [x] Commit: `track(protocol_hardening_20260809): phase1 - QuorumValidator implementation`
- [x] Task: Superconductor - User Manual Verification 'Phase 1: QuorumValidator' (Protocol in workflow.md)

---

## Phase 2: WorkspaceGuard — Pre-Commit Branch & Type Safety Enforcer

- [x] Task: Write failing tests for `WorkspaceGuard` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [x] Test: `preCommitCheck({ assigned: 'main', current: 'other' })` throws `BranchMismatchError`
    - [x] Test: `preCommitCheck({ assigned: 'main', current: 'main', tscExitCode: 0 })` returns `{ ok: true }`
    - [x] Test: `preCommitCheck({ tscExitCode: 1, tscOutput: '...' })` throws `TypeScriptError` with output
    - [x] Test: `detectSharedSingletonOverwrite(['MockFeedService.ts'], diff)` returns finding when diff replaces array entirely
    - [x] Test: `detectSharedSingletonOverwrite` returns empty for additive changes
    - [x] Test: `commitToMain({ trailerPresent: false })` throws `UnauthorizedMergeError`
    - [x] Test: `commitToMain({ trailerPresent: true })` succeeds
    - [x] Confirm all tests fail (Red)
- [x] Task: Implement `WorkspaceGuard` in `packages/superconductor-core/src/orchestration/workspace-guard.ts` [TIER-3] [AGENT:superconductor-processor]
    - [x] `BranchMismatchError`, `TypeScriptError`, `UnauthorizedMergeError` error types
    - [x] `preCommitCheck(opts)` — shells out to `git branch --show-current` + `tsc --noEmit`
    - [x] `detectSharedSingletonOverwrite(sharedFiles, diffContent)` — heuristic diff analysis
    - [x] `commitToMain(opts)` — SwarmAuthorizer trailer gate
    - [x] Injectable `ShellRunner` interface for testability (mock in tests)
    - [x] Run tests — all must pass (Green)
    - [x] Coverage check (>85%)
    - [x] Commit: `track(protocol_hardening_20260809): phase2 - WorkspaceGuard implementation`
- [x] Task: Superconductor - User Manual Verification 'Phase 2: WorkspaceGuard' (Protocol in workflow.md)

---

## Phase 3: WorktreeIsolationManager — Parallel Agent Isolation

- [x] Task: Write failing tests for `WorktreeIsolationManager` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [x] Test: `allocate(agentId, trackId)` calls `wt add <branch>` and returns worktree path
    - [x] Test: `allocate` called twice with same agentId throws `WorktreeAlreadyAllocatedError`
    - [x] Test: `release(agentId)` calls `wt remove <branch>` and clears allocation map
    - [x] Test: `release(unknown agentId)` is a no-op (no throw)
    - [x] Test: `releaseAll()` calls `wt remove` for all allocated worktrees
    - [x] Test: SIGINT handler calls `releaseAll()` (mock signal)
    - [x] Test: `getWorktreePath(agentId)` returns correct path after allocation
    - [x] Test: `allocate` when `wt` binary not found throws `WorktrunkNotInstalledError` (no fallback to git worktree)
    - [x] Confirm all tests fail (Red)
- [x] Task: Implement `WorktreeIsolationManager` in `packages/superconductor-core/src/orchestration/worktree-isolation-manager.ts` [TIER-3] [AGENT:superconductor-processor]
    - [x] `WorktreeAlreadyAllocatedError`, `WorktrunkNotInstalledError` error types
    - [x] On construction: verify `wt` binary exists at `/home/gooseware/.cargo/bin/wt` (or PATH) — throw `WorktrunkNotInstalledError` if missing, log hint to run `scripts/install-worktrunk.sh`
    - [x] `allocate(agentId, trackId)` — shells `wt add <agentId-trackId-branch>` (wt manages `.worktrees/` and `.gitignore` automatically)
    - [x] `release(agentId)` — shells `wt remove <branch>` (wt cleans up directory)
    - [x] `releaseAll()` — iterate all allocations, call `wt remove` for each
    - [x] SIGINT / SIGTERM process hooks registered at construction
    - [x] Injectable `ShellRunner` for testability (mock wt binary in tests)
    - [x] Run tests — all must pass (Green)
    - [x] Coverage check (>85%)
    - [x] Commit: `track(protocol_hardening_20260809): phase3 - WorktreeIsolationManager using wt (worktrunk)`
- [x] Task: Superconductor - User Manual Verification 'Phase 3: WorktreeIsolationManager' (Protocol in workflow.md)

---

## Phase 4: TestTheatreDetector — Zero-Assertion Test Auditor

- [x] Task: Write failing tests for `TestTheatreDetector` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [x] Test: File with `fireEvent.click(el)` and no `expect()` → returns CRITICAL finding
    - [x] Test: File with `userEvent.type(el, 'x')` and no `expect()` → returns CRITICAL finding
    - [x] Test: File with `fireEvent.click(el)` followed by `expect(el).toBeInTheDocument()` → no finding
    - [x] Test: File with no events at all → no finding
    - [x] Test: `scan(dir)` recursively finds all test files
    - [x] Test: Finding includes file path, line number, test block name
    - [x] Confirm all tests fail (Red)
- [x] Task: Implement `TestTheatreDetector` using ts-morph AST in `packages/superconductor-core/src/review/test-theatre-detector.ts` [TIER-3] [AGENT:superconductor-processor]
    - [x] AST visitor: find all `it()` / `test()` call expressions
    - [x] For each: collect `fireEvent.*`, `userEvent.*`, `pointerEvent.*`, `dispatchEvent` calls
    - [x] For each: collect `expect(...)` calls
    - [x] Flag blocks where events present + no `expect()` → `TestTheatreFinding`
    - [x] `scan(filePath)` and `scanDirectory(dir)` API
    - [x] Run tests — all must pass (Green)
    - [x] Coverage check (>85%)
    - [x] Commit: `track(protocol_hardening_20260809): phase4 - TestTheatreDetector implementation`
- [x] Task: Superconductor - User Manual Verification 'Phase 4: TestTheatreDetector' (Protocol in workflow.md)

---

## Phase 5: CheckpointOrchestrator — Phase Completion Automation

- [x] Task: Write failing tests for `CheckpointOrchestrator` (Red Phase) [TIER-4] [AGENT:superconductor-dreamer]
    - [x] Test: `run(phase, prevSha)` in dry-run mode returns `CheckpointReport` without side effects
    - [x] Test: `run(phase, prevSha)` executes `git diff --name-only <prevSha> HEAD`
    - [x] Test: `run(phase, prevSha)` generates `superconductor(checkpoint):` commit
    - [x] Test: `run(phase, prevSha)` appends `[checkpoint: <sha>]` to plan.md phase header
    - [x] Test: `run(phase, prevSha)` calls `git notes add -m <json> HEAD` for quality annotation
    - [x] Test: `run(phase, prevSha)` returns structured `CheckpointReport` with all fields populated
    - [x] Test: `QualityNote` JSON schema validates correctly (Zod)
    - [x] Test: Missing test file for a changed code file triggers test-creation warning
    - [x] Confirm all tests fail (Red)
- [x] Task: Implement `CheckpointOrchestrator` in `packages/superconductor-core/src/orchestration/checkpoint-orchestrator.ts` [TIER-4] [AGENT:superconductor-dreamer]
    - [x] `QualityNote` Zod schema
    - [x] `CheckpointReport` type
    - [x] Steps 2–12 of Phase Completion Protocol implemented as sequential async methods
    - [x] `dryRun` mode: skips shell mutations, returns report only
    - [x] Integrates with `WorkspaceGuard` for pre-commit validation
    - [x] `run(phase, prevSha, opts?)` public API
    - [x] Run tests — all must pass (Green)
    - [x] Coverage check (>85%)
    - [x] Commit: `track(protocol_hardening_20260809): phase5 - CheckpointOrchestrator implementation`
- [x] Task: Superconductor - User Manual Verification 'Phase 5: CheckpointOrchestrator' (Protocol in workflow.md)

---

## Phase 6: ModelRoutingEnforcer + DomainSplitRemediationDispatcher

- [x] Task: Write failing tests for `ModelRoutingEnforcer` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [x] Test: `resolveModel('superconductor-oracle', any)` always returns `'pro'`
    - [x] Test: `resolveModel('superconductor-dreamer', any)` always returns `'pro'`
    - [x] Test: `resolveModel('superconductor-processor', { complexity: 'high' })` returns `'pro'` if no worktree
    - [x] Test: `resolveModel('superconductor-processor', { complexity: 'low', worktreeIsolated: true })` returns `'flash'`
    - [x] Test: `escalate(agentId, failCount: 2)` returns `'pro'`
    - [x] Test: `escalate(agentId, failCount: 1)` returns `'flash'` (still within budget)
- [x] Task: Write failing tests for `DomainSplitRemediationDispatcher` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [x] Test: `dispatch([3 findings across 3 domains])` spawns 3 parallel agents
    - [x] Test: `dispatch([findings all same domain])` spawns 1 agent
    - [x] Test: `dispatch([>6 domains worth of findings])` caps at 6 parallel, queues rest
    - [x] Test: Each spawned agent receives only its domain's findings
    - [x] Test: `dispatch` calls `WorktreeIsolationManager.allocate` per agent
    - [x] Confirm all tests fail (Red)
- [x] Task: Implement `ModelRoutingEnforcer` in `packages/superconductor-core/src/orchestration/model-routing-enforcer.ts` [TIER-3] [AGENT:superconductor-processor]
- [x] Task: Implement `DomainSplitRemediationDispatcher` in `packages/superconductor-core/src/remediation/domain-split-remediation-dispatcher.ts` [TIER-3] [AGENT:superconductor-processor]
    - [x] Integrates with `DomainClassifier` from `swarm_remediation_20260809`
    - [x] Integrates with `WorktreeIsolationManager` (auto-allocate/release per agent)
    - [x] Integrates with `ModelRoutingEnforcer.resolveModel` for each agent
    - [x] Run tests — all must pass (Green)
    - [x] Coverage check (>85%)
    - [x] Commit: `track(protocol_hardening_20260809): phase6 - ModelRoutingEnforcer + DomainSplitRemediationDispatcher`
- [x] Task: Superconductor - User Manual Verification 'Phase 6: Routing + Dispatcher' (Protocol in workflow.md)

---

## Phase 7: Integration & SKILL.md Updates

- [x] Task: Update `standalone-review` SKILL.md to reference enforcement guardrails [TIER-3] [AGENT:superconductor-processor]
    - [x] Add §10.0: Quorum Enforcement — reference `QuorumValidator`, document the 4 required roles
    - [x] Add §11.0: Worktree Isolation — reference `WorktreeIsolationManager`, note mandatory for parallel Flash processors
    - [x] Add §12.0: Model Routing Rules — codify tier table from FR-6
    - [x] Update §9.x Swarm Remediation to reference `DomainSplitRemediationDispatcher`
- [x] Task: Update `workflow.md` — add enforcement references to Phase Completion Checkpointing section [TIER-3] [AGENT:superconductor-processor]
    - [x] Step 8 references `CheckpointOrchestrator.run()` as the canonical implementation
    - [x] Step 7 (Swarm Phase Gate) references `QuorumValidator.validate()`
- [x] Task: Export all new classes from `packages/superconductor-core/src/index.ts` [TIER-2] [AGENT:superconductor-processor]
- [x] Task: Run full test suite — all 506+ tests must pass [TIER-2] [AGENT:superconductor-processor]
    - [x] `CI=true npx vitest run` from `packages/superconductor-core/`
    - [x] Coverage check across all new modules
- [x] Task: Commit all integration changes [TIER-2] [AGENT:superconductor-processor]
    - [x] `track(protocol_hardening_20260809): phase7 - Integration and SKILL.md enforcement references`
- [x] Task: Superconductor - User Manual Verification 'Phase 7: Integration & SKILL.md Updates' (Protocol in workflow.md)

---

## Phase 8: Integration & Finalization

- [x] Task: Run final quorum review on all changes (4 reviewers: Security, Correctness, Adversarial, Regression) [TIER-4] [AGENT:superconductor-reviewer]
- [x] Task: Apply quorum findings via `DomainSplitRemediationDispatcher` if any findings present [TIER-3] [AGENT:superconductor-processor]
- [x] Task: Re-run quorum until green (quorum → remediate → quorum loop) [TIER-4] [AGENT:superconductor-reviewer]
- [x] Task: Integrate track `protocol_hardening_20260809` into `main` branch [TIER-3] [AGENT:superconductor-processor]
    - [x] `SwarmAuthorizer.generateTrailer()` called — trailer appended to merge commit
    - [x] `WorkspaceGuard.commitToMain({ trailerPresent: true })` gate passes
- [x] Task: Superconductor - User Manual Verification 'Phase 8: Integration & Finalization' (Protocol in workflow.md)

---

## Swarm Blueprint

> *Blueprint will be auto-injected by `cli-blueprint.js` after plan is saved.*

| Phase | Waves | Tier | Primary Agent | Model |
|-------|-------|------|---------------|-------|
| 0 | 1 | TIER-1 | superconductor-processor | flash |
| 1 | 2 | TIER-3 | superconductor-processor | flash |
| 2 | 2 | TIER-3 | superconductor-processor | flash |
| 3 | 2 | TIER-3 | superconductor-processor | flash |
| 4 | 2 | TIER-3 | superconductor-processor | flash |
| 5 | 2 | TIER-4 | superconductor-dreamer | pro |
| 6 | 2 | TIER-3 | superconductor-processor | flash |
| 7 | 1 | TIER-3 | superconductor-processor | flash |
| 8 | Oracle Cadence | TIER-4 | superconductor-reviewer | flash (quorum) + pro (oracle) |
