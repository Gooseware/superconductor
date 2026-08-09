# Implementation Plan: protocol_hardening_20260809

**Track:** Superconductor Protocol Hardening  
**Branch:** `track/protocol_hardening_20260809`  
**Target Branch:** `main`  
**Source Spec:** `superconductor/tracks/protocol_hardening_20260809/spec.md`

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify `swarm-orchestrate` / `swarm-remediation` skills are installed and loaded [TIER-1] [AGENT:superconductor-processor]
    - [ ] Check `.agents/skills/` and `~/.gemini/config/plugins/superconductor/skills/` for required skills
    - [ ] Confirm `standalone-review` SKILL.md §9.0 (Swarm Remediation Protocol) is present
    - [ ] Confirm branch `track/protocol_hardening_20260809` is created from `main`
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: QuorumValidator — Quorum Enforcement Guard

- [ ] Task: Write failing tests for `QuorumValidator` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: `validate([])` throws `QuorumInsufficientError` listing all 4 missing roles
    - [ ] Test: `validate([security, correctness, adversarial])` throws listing `regression-reviewer` missing
    - [ ] Test: `validate([all 4 roles])` returns `{ valid: true, panelComplete: true }`
    - [ ] Test: `validate([4 roles + extra])` passes (extra reviewers OK)
    - [ ] Test: `gateOracle({ quorumPassed: false })` throws `OracleGateError`
    - [ ] Test: `gateOracle({ quorumPassed: true })` returns true
    - [ ] Test: `QuorumPolicy` config: custom minimum count respected
    - [ ] Confirm all tests fail (Red)
- [ ] Task: Implement `QuorumValidator` in `packages/superconductor-core/src/orchestration/quorum-validator.ts` [TIER-3] [AGENT:superconductor-processor]
    - [ ] `QuorumInsufficientError` with `missingRoles: string[]` field
    - [ ] `OracleGateError` with `reason: string` field
    - [ ] `QuorumPolicy` Zod schema with defaults
    - [ ] `validate(panel: ReviewerRole[])` method
    - [ ] `gateOracle(state: { quorumPassed: boolean })` method
    - [ ] Run tests — all must pass (Green)
    - [ ] Refactor (Strict Refactor Phase) — no new features
    - [ ] Coverage check (>85%)
    - [ ] Commit: `track(protocol_hardening_20260809): phase1 - QuorumValidator implementation`
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: QuorumValidator' (Protocol in workflow.md)

---

## Phase 2: WorkspaceGuard — Pre-Commit Branch & Type Safety Enforcer

- [ ] Task: Write failing tests for `WorkspaceGuard` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: `preCommitCheck({ assigned: 'main', current: 'other' })` throws `BranchMismatchError`
    - [ ] Test: `preCommitCheck({ assigned: 'main', current: 'main', tscExitCode: 0 })` returns `{ ok: true }`
    - [ ] Test: `preCommitCheck({ tscExitCode: 1, tscOutput: '...' })` throws `TypeScriptError` with output
    - [ ] Test: `detectSharedSingletonOverwrite(['MockFeedService.ts'], diff)` returns finding when diff replaces array entirely
    - [ ] Test: `detectSharedSingletonOverwrite` returns empty for additive changes
    - [ ] Test: `commitToMain({ trailerPresent: false })` throws `UnauthorizedMergeError`
    - [ ] Test: `commitToMain({ trailerPresent: true })` succeeds
    - [ ] Confirm all tests fail (Red)
- [ ] Task: Implement `WorkspaceGuard` in `packages/superconductor-core/src/orchestration/workspace-guard.ts` [TIER-3] [AGENT:superconductor-processor]
    - [ ] `BranchMismatchError`, `TypeScriptError`, `UnauthorizedMergeError` error types
    - [ ] `preCommitCheck(opts)` — shells out to `git branch --show-current` + `tsc --noEmit`
    - [ ] `detectSharedSingletonOverwrite(sharedFiles, diffContent)` — heuristic diff analysis
    - [ ] `commitToMain(opts)` — SwarmAuthorizer trailer gate
    - [ ] Injectable `ShellRunner` interface for testability (mock in tests)
    - [ ] Run tests — all must pass (Green)
    - [ ] Coverage check (>85%)
    - [ ] Commit: `track(protocol_hardening_20260809): phase2 - WorkspaceGuard implementation`
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: WorkspaceGuard' (Protocol in workflow.md)

---

## Phase 3: WorktreeIsolationManager — Parallel Agent Isolation

- [ ] Task: Write failing tests for `WorktreeIsolationManager` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: `allocate(agentId, trackId)` calls `wt add <branch>` and returns worktree path
    - [ ] Test: `allocate` called twice with same agentId throws `WorktreeAlreadyAllocatedError`
    - [ ] Test: `release(agentId)` calls `wt remove <branch>` and clears allocation map
    - [ ] Test: `release(unknown agentId)` is a no-op (no throw)
    - [ ] Test: `releaseAll()` calls `wt remove` for all allocated worktrees
    - [ ] Test: SIGINT handler calls `releaseAll()` (mock signal)
    - [ ] Test: `getWorktreePath(agentId)` returns correct path after allocation
    - [ ] Test: `allocate` when `wt` binary not found throws `WorktrunkNotInstalledError` (no fallback to git worktree)
    - [ ] Confirm all tests fail (Red)
- [ ] Task: Implement `WorktreeIsolationManager` in `packages/superconductor-core/src/orchestration/worktree-isolation-manager.ts` [TIER-3] [AGENT:superconductor-processor]
    - [ ] `WorktreeAlreadyAllocatedError`, `WorktrunkNotInstalledError` error types
    - [ ] On construction: verify `wt` binary exists at `/home/gooseware/.cargo/bin/wt` (or PATH) — throw `WorktrunkNotInstalledError` if missing, log hint to run `scripts/install-worktrunk.sh`
    - [ ] `allocate(agentId, trackId)` — shells `wt add <agentId-trackId-branch>` (wt manages `.worktrees/` and `.gitignore` automatically)
    - [ ] `release(agentId)` — shells `wt remove <branch>` (wt cleans up directory)
    - [ ] `releaseAll()` — iterate all allocations, call `wt remove` for each
    - [ ] SIGINT / SIGTERM process hooks registered at construction
    - [ ] Injectable `ShellRunner` for testability (mock wt binary in tests)
    - [ ] Run tests — all must pass (Green)
    - [ ] Coverage check (>85%)
    - [ ] Commit: `track(protocol_hardening_20260809): phase3 - WorktreeIsolationManager using wt (worktrunk)`
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: WorktreeIsolationManager' (Protocol in workflow.md)

---

## Phase 4: TestTheatreDetector — Zero-Assertion Test Auditor

- [ ] Task: Write failing tests for `TestTheatreDetector` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: File with `fireEvent.click(el)` and no `expect()` → returns CRITICAL finding
    - [ ] Test: File with `userEvent.type(el, 'x')` and no `expect()` → returns CRITICAL finding
    - [ ] Test: File with `fireEvent.click(el)` followed by `expect(el).toBeInTheDocument()` → no finding
    - [ ] Test: File with no events at all → no finding
    - [ ] Test: `scan(dir)` recursively finds all test files
    - [ ] Test: Finding includes file path, line number, test block name
    - [ ] Confirm all tests fail (Red)
- [ ] Task: Implement `TestTheatreDetector` using ts-morph AST in `packages/superconductor-core/src/review/test-theatre-detector.ts` [TIER-3] [AGENT:superconductor-processor]
    - [ ] AST visitor: find all `it()` / `test()` call expressions
    - [ ] For each: collect `fireEvent.*`, `userEvent.*`, `pointerEvent.*`, `dispatchEvent` calls
    - [ ] For each: collect `expect(...)` calls
    - [ ] Flag blocks where events present + no `expect()` → `TestTheatreFinding`
    - [ ] `scan(filePath)` and `scanDirectory(dir)` API
    - [ ] Run tests — all must pass (Green)
    - [ ] Coverage check (>85%)
    - [ ] Commit: `track(protocol_hardening_20260809): phase4 - TestTheatreDetector implementation`
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: TestTheatreDetector' (Protocol in workflow.md)

---

## Phase 5: CheckpointOrchestrator — Phase Completion Automation

- [ ] Task: Write failing tests for `CheckpointOrchestrator` (Red Phase) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Test: `run(phase, prevSha)` in dry-run mode returns `CheckpointReport` without side effects
    - [ ] Test: `run(phase, prevSha)` executes `git diff --name-only <prevSha> HEAD`
    - [ ] Test: `run(phase, prevSha)` generates `superconductor(checkpoint):` commit
    - [ ] Test: `run(phase, prevSha)` appends `[checkpoint: <sha>]` to plan.md phase header
    - [ ] Test: `run(phase, prevSha)` calls `git notes add -m <json> HEAD` for quality annotation
    - [ ] Test: `run(phase, prevSha)` returns structured `CheckpointReport` with all fields populated
    - [ ] Test: `QualityNote` JSON schema validates correctly (Zod)
    - [ ] Test: Missing test file for a changed code file triggers test-creation warning
    - [ ] Confirm all tests fail (Red)
- [ ] Task: Implement `CheckpointOrchestrator` in `packages/superconductor-core/src/orchestration/checkpoint-orchestrator.ts` [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] `QualityNote` Zod schema
    - [ ] `CheckpointReport` type
    - [ ] Steps 2–12 of Phase Completion Protocol implemented as sequential async methods
    - [ ] `dryRun` mode: skips shell mutations, returns report only
    - [ ] Integrates with `WorkspaceGuard` for pre-commit validation
    - [ ] `run(phase, prevSha, opts?)` public API
    - [ ] Run tests — all must pass (Green)
    - [ ] Coverage check (>85%)
    - [ ] Commit: `track(protocol_hardening_20260809): phase5 - CheckpointOrchestrator implementation`
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: CheckpointOrchestrator' (Protocol in workflow.md)

---

## Phase 6: ModelRoutingEnforcer + DomainSplitRemediationDispatcher

- [ ] Task: Write failing tests for `ModelRoutingEnforcer` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: `resolveModel('superconductor-oracle', any)` always returns `'pro'`
    - [ ] Test: `resolveModel('superconductor-dreamer', any)` always returns `'pro'`
    - [ ] Test: `resolveModel('superconductor-processor', { complexity: 'high' })` returns `'pro'` if no worktree
    - [ ] Test: `resolveModel('superconductor-processor', { complexity: 'low', worktreeIsolated: true })` returns `'flash'`
    - [ ] Test: `escalate(agentId, failCount: 2)` returns `'pro'`
    - [ ] Test: `escalate(agentId, failCount: 1)` returns `'flash'` (still within budget)
- [ ] Task: Write failing tests for `DomainSplitRemediationDispatcher` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: `dispatch([3 findings across 3 domains])` spawns 3 parallel agents
    - [ ] Test: `dispatch([findings all same domain])` spawns 1 agent
    - [ ] Test: `dispatch([>6 domains worth of findings])` caps at 6 parallel, queues rest
    - [ ] Test: Each spawned agent receives only its domain's findings
    - [ ] Test: `dispatch` calls `WorktreeIsolationManager.allocate` per agent
    - [ ] Confirm all tests fail (Red)
- [ ] Task: Implement `ModelRoutingEnforcer` in `packages/superconductor-core/src/orchestration/model-routing-enforcer.ts` [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Implement `DomainSplitRemediationDispatcher` in `packages/superconductor-core/src/remediation/domain-split-remediation-dispatcher.ts` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Integrates with `DomainClassifier` from `swarm_remediation_20260809`
    - [ ] Integrates with `WorktreeIsolationManager` (auto-allocate/release per agent)
    - [ ] Integrates with `ModelRoutingEnforcer.resolveModel` for each agent
    - [ ] Run tests — all must pass (Green)
    - [ ] Coverage check (>85%)
    - [ ] Commit: `track(protocol_hardening_20260809): phase6 - ModelRoutingEnforcer + DomainSplitRemediationDispatcher`
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Routing + Dispatcher' (Protocol in workflow.md)

---

## Phase 7: Integration & SKILL.md Updates

- [ ] Task: Update `standalone-review` SKILL.md to reference enforcement guardrails [TIER-3] [AGENT:superconductor-processor]
    - [ ] Add §10.0: Quorum Enforcement — reference `QuorumValidator`, document the 4 required roles
    - [ ] Add §11.0: Worktree Isolation — reference `WorktreeIsolationManager`, note mandatory for parallel Flash processors
    - [ ] Add §12.0: Model Routing Rules — codify tier table from FR-6
    - [ ] Update §9.x Swarm Remediation to reference `DomainSplitRemediationDispatcher`
- [ ] Task: Update `workflow.md` — add enforcement references to Phase Completion Checkpointing section [TIER-3] [AGENT:superconductor-processor]
    - [ ] Step 8 references `CheckpointOrchestrator.run()` as the canonical implementation
    - [ ] Step 7 (Swarm Phase Gate) references `QuorumValidator.validate()`
- [ ] Task: Export all new classes from `packages/superconductor-core/src/index.ts` [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Run full test suite — all 506+ tests must pass [TIER-2] [AGENT:superconductor-processor]
    - [ ] `CI=true npx vitest run` from `packages/superconductor-core/`
    - [ ] Coverage check across all new modules
- [ ] Task: Commit all integration changes [TIER-2] [AGENT:superconductor-processor]
    - [ ] `track(protocol_hardening_20260809): phase7 - Integration and SKILL.md enforcement references`
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Integration & SKILL.md Updates' (Protocol in workflow.md)

---

## Phase 8: Integration & Finalization

- [ ] Task: Run final quorum review on all changes (4 reviewers: Security, Correctness, Adversarial, Regression) [TIER-4] [AGENT:superconductor-reviewer]
- [ ] Task: Apply quorum findings via `DomainSplitRemediationDispatcher` if any findings present [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Re-run quorum until green (quorum → remediate → quorum loop) [TIER-4] [AGENT:superconductor-reviewer]
- [ ] Task: Integrate track `protocol_hardening_20260809` into `main` branch [TIER-3] [AGENT:superconductor-processor]
    - [ ] `SwarmAuthorizer.generateTrailer()` called — trailer appended to merge commit
    - [ ] `WorkspaceGuard.commitToMain({ trailerPresent: true })` gate passes
- [ ] Task: Superconductor - User Manual Verification 'Phase 8: Integration & Finalization' (Protocol in workflow.md)

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
