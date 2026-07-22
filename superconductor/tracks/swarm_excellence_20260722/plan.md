# Implementation Plan: Swarm Excellence Engine

> **AGENT DIRECTIVE — Read Before Starting Any Task**: For every existing module you are asked to extend, you MUST first read its source, then log in `swarm_log.md`: (1) the case for extending it, (2) the case for replacing it, and (3) your decision with estimated token/time budget for each path. Silent extension or silent rebuilding without this reasoning is a workflow violation and grounds for Oracle rejection.

---

## Phase 0: Swarm Preflight

- [x] Task: Read and map existing engine infrastructure before any implementation begins [TIER-1] [AGENT:caduceus-oracle]
    - [x] Read `packages/engine/src/engine.ts`, `escalation-router.ts`, `SmartModelResolver.ts`, `cache-manager.ts`, `storm.ts`, `verification-pipeline.ts`, `event-store.ts`
    - [x] Confirm all existing tests pass: `cd packages/engine && CI=true npm test`
    - [x] Document the current public API surface of each module in `swarm_log.md`
- [x] Task: Verify environment readiness and skill availability [TIER-1] [AGENT:caduceus-oracle]
    - [x] Check `swarm-orchestrate` skill loading and subagent tool registrations
    - [x] Verify test runner and build tools environment setup (`tsc --noEmit`, `npm test`)
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)


---

## Phase 1: Skill Standardisation & Marketplace Alignment

- [x] Task: Create canonical `skill-rules.json` JSON schema and place in `superconductor/schema/` [TIER-2] [AGENT:caduceus-processor]
    - [x] Write `superconductor/schema/skill-rules.schema.json` matching the schema defined in `spec.md` §5.1 FR2
    - [x] Write unit test validating schema structure with `ajv` or equivalent
- [x] Task: Audit and refactor `setup/SKILL.md` (675 lines — primary violator, 35% over limit) [TIER-3] [AGENT:caduceus-processor]
    - [x] Write failing test: SKILL.md line count validator asserts `setup/SKILL.md` ≤ 500 lines
    - [x] Create `skills/setup/references/` directory
    - [x] Extract scaffolding step-by-step protocol (steps 3.x onwards) to `skills/setup/references/setup-protocol.md`
    - [x] Update `skills/setup/SKILL.md` to reference the auxiliary file with a link
    - [x] Confirm line count ≤ 500; run validator test to green
- [x] Task: Audit remaining skills and create `references/` directories for any future overflow [TIER-2] [AGENT:caduceus-processor]
    - [x] Confirm `implement/SKILL.md` (357 lines) and `review/SKILL.md` (241 lines) pass the 500-line test
    - [x] Create `skills/implement/references/` and `skills/review/references/` stubs for future use
- [x] Task: Implement `skill-rules.json` for all core Superconductor skills [TIER-2] [AGENT:caduceus-processor]
    - [x] Add `skill-rules.json` (validated against schema) to: `skills/implement/`, `skills/review/`, `skills/new-track/`, `skills/swarm-orchestrate/`, `skills/setup/`, `skills/revert/`, `skills/status/`
    - [x] Write integration test: skill trigger parser loads all files and validates against schema without errors
- [x] Task: Implement LobeHub / SkillsMP frontmatter metadata fields in each `SKILL.md` [TIER-2] [AGENT:caduceus-processor]
    - [x] Add `marketplace`, `version`, `triggers` YAML frontmatter fields to each core skill
    - [x] Write unit test for frontmatter parsing and validation
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Skill Standardisation' (Protocol in workflow.md)


---

## Phase 2: Pre-Computed Symbol Indexing & AST Context Builder

> **Note**: Extend `packages/engine/src/context/builder.ts`. Do NOT create a new context module.

- [x] Task: Extend `DagNode` type with `symbolDependencies` and `toolSurface` fields [TIER-3] [AGENT:caduceus-processor]
    - [x] Write failing test: `DagNode` with `symbolDependencies` array is accepted by type system
    - [x] Add to `packages/engine/src/types/dag.types.ts`:
        ```typescript
        symbolDependencies?: { file: string; symbol: string }[];
        toolSurface?: 'full' | 'readonly';
        ```
    - [x] Confirm all existing type tests still pass
- [x] Task: Extend `buildContext()` in `builder.ts` with `resolveSymbols()` LSP query method [TIER-3] [AGENT:caduceus-processor]
    - [x] Write failing test: `resolveSymbols([{file:'engine.ts', symbol:'Engine'}])` returns non-empty symbol definition string
    - [x] Implement `resolveSymbols()`: call `cclsp/find_definition` + `cclsp/find_references` MCP tools
    - [x] Implement offline fallback: if `cclsp` unavailable or throws, read targeted file sections (StartLine/EndLine via `view_file`)
    - [x] Run both test paths (online + offline fallback) to green
- [x] Task: Implement diff-only payload generator for Reviewer subagent turns [TIER-3] [AGENT:caduceus-processor]
    - [x] Write failing test: diff generator for a known change returns ≤ 5000 tokens of output
    - [x] Implement: run `git diff HEAD -- <contextFiles>` and concatenate with symbol resolution output
    - [x] Inject diff payload into `buildContext()` when `task.role === 'reviewer'` (full files never sent to Reviewer)
- [x] Task: Wire existing `CacheManager.processPayload()` into `startTask()` in `engine.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] The `Engine` already calls `cacheManager.processPayload()` in `startTask()` (line 144 of `engine.ts`) — verify this is correct and add the `hitRatio` to `TrackExecutionState` telemetry
    - [x] Write test confirming cache hit on second identical system prompt + tools invocation
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Pre-Computed Symbol Indexing' (Protocol in workflow.md)


---

## Phase 3: Stateful Engine & Asymmetric Refinement Loop

> **Note**: Extend `packages/engine/src/engine.ts` and `packages/engine/src/dispatcher/`. Do NOT create a parallel engine.

- [x] Task: Define `TrackExecutionState` interface and add state map to `Engine` [TIER-3] [AGENT:caduceus-processor]
    - [x] Write failing test: `engine.getTaskState(taskId)` returns `TrackExecutionState` object with correct fields
    - [x] Add `TrackExecutionState` interface to `packages/engine/src/types/engine.types.ts` (see spec §5.3 FR7)
    - [x] Add `private taskStates: Map<string, TrackExecutionState>` to `Engine` class
    - [x] Implement `getTaskState()`, `updateTaskState()`, `initTaskState()` methods
    - [x] Persist state transitions as events via existing `EventStore.append()` — do NOT create a separate persistence layer
- [x] Task: Implement `ToolSurfaceFilter` middleware in `Dispatcher` [TIER-3] [AGENT:caduceus-processor]
    - [x] Write failing test: dispatching a `DagNode` with `toolSurface: 'readonly'` and then attempting `write_to_file` returns a rejection/error
    - [x] Implement `ToolSurfaceFilter` class in `packages/engine/src/dispatcher/`
    - [x] Integrate filter into `Dispatcher.dispatch()`: apply filter before forwarding tool invocations
    - [x] Auto-assign `toolSurface: 'readonly'` to any `DagNode` where `role === 'reviewer'` at dispatch time
    - [x] Write adversarial test: Reviewer-role node cannot invoke `write_to_file`, `replace_file_content`, `multi_replace_file_content`, or `run_command`
- [x] Task: Implement pre-task checkpoint commit and circuit-breaker rollback [TIER-3] [AGENT:caduceus-processor]
    - [x] Write failing test: before Coding Agent task starts, a checkpoint commit exists with message `"checkpoint: pre-task <task_id>"`
    - [x] Implement `GitCheckpointManager` in `packages/engine/src/safety/`: `createCheckpoint(taskId)` → returns SHA
    - [x] Store SHA in `TrackExecutionState.checkpointSha`
    - [x] Implement `rollbackToCheckpoint(sha)`: `git reset --hard <sha>` — do NOT use `git stash`
    - [x] Trigger rollback in `handleDispatcherEvent` when `iteration_count >= 3` (extend existing `task_failed` handler in `engine.ts`)
- [x] Task: Wire `EscalationRouter` → `SmartModelResolver` for live model tier switching [TIER-3] [AGENT:caduceus-processor]
    - [x] Write failing test: after `EscalationRouter.processSignal()` returns `'escalate'`, the re-dispatched task uses `model_tier: 4`
    - [x] In `handleDispatcherEvent`'s escalation branch (already has `if (action === 'escalate')`), call `SmartModelResolver.resolve('tier4')` and update `TrackExecutionState.model_tier`
    - [x] The existing `SmartModelResolver` already handles this — wire it in, do not rewrite it
    - [x] Verify model escalation end-to-end in integration test
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Stateful Engine' (Protocol in workflow.md)


---

## Phase 4: Progressive Definition of Done (DoD) & Tabula Rasa Quality Gate

> **Note**: Extend `packages/engine/src/verification/verification-pipeline.ts`. The existing `parseCoverage()`, `validatePbtUsage()`, `verifyThreshold()`, and `iterativeAuditFix()` methods are already implemented — call them, do not rewrite them.

- [x] Task: Add task classification heuristic to determine DoD level at dispatch [TIER-2] [AGENT:caduceus-processor]
    - [x] Write failing test: task touching `*/auth/*` returns `dodLevel: 4`; standard feature task returns `dodLevel: 2`
    - [x] Implement `classifyDodLevel(contextFiles: string[]): 1|2|3|4` in `packages/engine/src/verification/`
    - [x] Heuristics (per spec §5.4 FR11): `*/auth/*` | `*/iam/*` | `*/security/*` → 4; `*/migrations/*` | `*/api/*` | `*/schema/*` → 3; standard → 2; docs/style → 1
    - [x] Store classified level in `TrackExecutionState`
- [x] Task: Extend `VerificationPipeline` with `runDodGate(level, taskId)` method [TIER-3] [AGENT:caduceus-processor]
    - [x] Write failing tests for `runDodGate()` Level 1 through Level 3 (Level 4 tested separately)
    - [x] Implement `runDodGate()` by composing existing pipeline methods (per spec §5.4 FR10):
        - L1: TS compile check + markdown lint
        - L2: L1 + `this.parseCoverage()` ≥ 80%
        - L3: L2 + `this.vlmAuditor` + `this.mutationAnalyzer.verifyThreshold()`
        - L4: L3 + Tabula Rasa subagent (see next task)
    - [x] All existing `runVerification()` and `runPhaseCheckpoint()` tests must continue to pass
- [x] Task: Build isolated "Tabula Rasa" clean-slate Level 4 verification runner [TIER-4] [AGENT:caduceus-oracle]
    - [x] Write failing test: `runDodGate(4, taskId)` invokes a subagent with `Workspace: 'branch'` and zero inherited context
    - [x] Implement Tabula Rasa runner: `invoke_subagent` with `Workspace: 'branch'`, prompt containing only the repo path + build/test commands derived from `tech-stack.md`
    - [x] Subagent runs: `tsc --noEmit && CI=true npm test` in a clean branch clone
    - [x] If subagent exits non-zero → `runDodGate` returns `passed: false` with stdout/stderr as feedback
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Progressive Definition of Done' (Protocol in workflow.md)

---

## Phase 5: Integration & Finalization

- [x] Task: Run full regression suite across all packages and verify all acceptance criteria [TIER-3] [AGENT:caduceus-processor]
    - [x] `cd packages/engine && CI=true npm test` — zero failures (44 test files, 159 tests passed)
    - [x] `tsc --noEmit` — zero type errors across engine package
    - [x] Confirm all 8 acceptance criteria in `spec.md` §7 are checkable/met
- [x] Task: Integrate track 'swarm_excellence_20260722' into main branch [TIER-3] [AGENT:caduceus-processor]
    - [x] Merge track branch `track/swarm_excellence_20260722` into `main`
    - [x] Tag release with appropriate version bump
- [x] Task: Superconductor - User Manual Verification 'Phase 5: Integration & Finalization' (Protocol in workflow.md)

