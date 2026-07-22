# Implementation Plan: Swarm Excellence Engine

> **CRITICAL DIRECTIVE FOR ALL IMPLEMENTING AGENTS**: Before writing any code for any task in this plan, you MUST read the existing module listed in the "Existing Framework" table in `spec.md`. This track extends existing infrastructure — it does NOT rebuild it. If a class, method, or interface already exists, extend it. Do not create a parallel implementation.

---

## Phase 0: Swarm Preflight

- [ ] Task: Read and map existing engine infrastructure before any implementation begins [TIER-1] [AGENT:caduceus-oracle]
    - [ ] Read `packages/engine/src/engine.ts`, `escalation-router.ts`, `SmartModelResolver.ts`, `cache-manager.ts`, `storm.ts`, `verification-pipeline.ts`, `event-store.ts`
    - [ ] Confirm all existing tests pass: `cd packages/engine && CI=true npm test`
    - [ ] Document the current public API surface of each module in `swarm_log.md`
- [ ] Task: Verify environment readiness and skill availability [TIER-1] [AGENT:caduceus-oracle]
    - [ ] Check `swarm-orchestrate` skill loading and subagent tool registrations
    - [ ] Verify test runner and build tools environment setup (`tsc --noEmit`, `npm test`)
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Skill Standardisation & Marketplace Alignment

- [ ] Task: Create canonical `skill-rules.json` JSON schema and place in `superconductor/schema/` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Write `superconductor/schema/skill-rules.schema.json` matching the schema defined in `spec.md` §5.1 FR2
    - [ ] Write unit test validating schema structure with `ajv` or equivalent
- [ ] Task: Audit and refactor `setup/SKILL.md` (675 lines — primary violator, 35% over limit) [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test: SKILL.md line count validator asserts `setup/SKILL.md` ≤ 500 lines
    - [ ] Create `skills/setup/references/` directory
    - [ ] Extract scaffolding step-by-step protocol (steps 3.x onwards) to `skills/setup/references/setup-protocol.md`
    - [ ] Update `skills/setup/SKILL.md` to reference the auxiliary file with a link
    - [ ] Confirm line count ≤ 500; run validator test to green
- [ ] Task: Audit remaining skills and create `references/` directories for any future overflow [TIER-2] [AGENT:caduceus-processor]
    - [ ] Confirm `implement/SKILL.md` (357 lines) and `review/SKILL.md` (241 lines) pass the 500-line test
    - [ ] Create `skills/implement/references/` and `skills/review/references/` stubs for future use
- [ ] Task: Implement `skill-rules.json` for all core Superconductor skills [TIER-2] [AGENT:caduceus-processor]
    - [ ] Add `skill-rules.json` (validated against schema) to: `skills/implement/`, `skills/review/`, `skills/new-track/`, `skills/swarm-orchestrate/`, `skills/setup/`, `skills/revert/`, `skills/status/`
    - [ ] Write integration test: skill trigger parser loads all files and validates against schema without errors
- [ ] Task: Implement LobeHub / SkillsMP frontmatter metadata fields in each `SKILL.md` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Add `marketplace`, `version`, `triggers` YAML frontmatter fields to each core skill
    - [ ] Write unit test for frontmatter parsing and validation
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Skill Standardisation' (Protocol in workflow.md)

---

## Phase 2: Pre-Computed Symbol Indexing & AST Context Builder

> **Note**: Extend `packages/engine/src/context/builder.ts`. Do NOT create a new context module.

- [ ] Task: Extend `DagNode` type with `symbolDependencies` and `toolSurface` fields [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test: `DagNode` with `symbolDependencies` array is accepted by type system
    - [ ] Add to `packages/engine/src/types/dag.types.ts`:
        ```typescript
        symbolDependencies?: { file: string; symbol: string }[];
        toolSurface?: 'full' | 'readonly';
        ```
    - [ ] Confirm all existing type tests still pass
- [ ] Task: Extend `buildContext()` in `builder.ts` with `resolveSymbols()` LSP query method [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test: `resolveSymbols([{file:'engine.ts', symbol:'Engine'}])` returns non-empty symbol definition string
    - [ ] Implement `resolveSymbols()`: call `cclsp/find_definition` + `cclsp/find_references` MCP tools
    - [ ] Implement offline fallback: if `cclsp` unavailable or throws, read targeted file sections (StartLine/EndLine via `view_file`)
    - [ ] Run both test paths (online + offline fallback) to green
- [ ] Task: Implement diff-only payload generator for Reviewer subagent turns [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test: diff generator for a known change returns ≤ 5000 tokens of output
    - [ ] Implement: run `git diff HEAD -- <contextFiles>` and concatenate with symbol resolution output
    - [ ] Inject diff payload into `buildContext()` when `task.role === 'reviewer'` (full files never sent to Reviewer)
- [ ] Task: Wire existing `CacheManager.processPayload()` into `startTask()` in `engine.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] The `Engine` already calls `cacheManager.processPayload()` in `startTask()` (line 144 of `engine.ts`) — verify this is correct and add the `hitRatio` to `TrackExecutionState` telemetry
    - [ ] Write test confirming cache hit on second identical system prompt + tools invocation
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Pre-Computed Symbol Indexing' (Protocol in workflow.md)

---

## Phase 3: Stateful Engine & Asymmetric Refinement Loop

> **Note**: Extend `packages/engine/src/engine.ts` and `packages/engine/src/dispatcher/`. Do NOT create a parallel engine.

- [ ] Task: Define `TrackExecutionState` interface and add state map to `Engine` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test: `engine.getTaskState(taskId)` returns `TrackExecutionState` object with correct fields
    - [ ] Add `TrackExecutionState` interface to `packages/engine/src/types/engine.types.ts` (see spec §5.3 FR7)
    - [ ] Add `private taskStates: Map<string, TrackExecutionState>` to `Engine` class
    - [ ] Implement `getTaskState()`, `updateTaskState()`, `initTaskState()` methods
    - [ ] Persist state transitions as events via existing `EventStore.append()` — do NOT create a separate persistence layer
- [ ] Task: Implement `ToolSurfaceFilter` middleware in `Dispatcher` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test: dispatching a `DagNode` with `toolSurface: 'readonly'` and then attempting `write_to_file` returns a rejection/error
    - [ ] Implement `ToolSurfaceFilter` class in `packages/engine/src/dispatcher/`
    - [ ] Integrate filter into `Dispatcher.dispatch()`: apply filter before forwarding tool invocations
    - [ ] Auto-assign `toolSurface: 'readonly'` to any `DagNode` where `role === 'reviewer'` at dispatch time
    - [ ] Write adversarial test: Reviewer-role node cannot invoke `write_to_file`, `replace_file_content`, `multi_replace_file_content`, or `run_command`
- [ ] Task: Implement pre-task checkpoint commit and circuit-breaker rollback [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test: before Coding Agent task starts, a checkpoint commit exists with message `"checkpoint: pre-task <task_id>"`
    - [ ] Implement `GitCheckpointManager` in `packages/engine/src/safety/`: `createCheckpoint(taskId)` → returns SHA
    - [ ] Store SHA in `TrackExecutionState.checkpointSha`
    - [ ] Implement `rollbackToCheckpoint(sha)`: `git reset --hard <sha>` — do NOT use `git stash`
    - [ ] Trigger rollback in `handleDispatcherEvent` when `iteration_count >= 3` (extend existing `task_failed` handler in `engine.ts`)
- [ ] Task: Wire `EscalationRouter` → `SmartModelResolver` for live model tier switching [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test: after `EscalationRouter.processSignal()` returns `'escalate'`, the re-dispatched task uses `model_tier: 4`
    - [ ] In `handleDispatcherEvent`'s escalation branch (already has `if (action === 'escalate')`), call `SmartModelResolver.resolve('tier4')` and update `TrackExecutionState.model_tier`
    - [ ] The existing `SmartModelResolver` already handles this — wire it in, do not rewrite it
    - [ ] Verify model escalation end-to-end in integration test
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Stateful Engine' (Protocol in workflow.md)

---

## Phase 4: Progressive Definition of Done (DoD) & Tabula Rasa Quality Gate

> **Note**: Extend `packages/engine/src/verification/verification-pipeline.ts`. The existing `parseCoverage()`, `validatePbtUsage()`, `verifyThreshold()`, and `iterativeAuditFix()` methods are already implemented — call them, do not rewrite them.

- [ ] Task: Add task classification heuristic to determine DoD level at dispatch [TIER-2] [AGENT:caduceus-processor]
    - [ ] Write failing test: task touching `*/auth/*` returns `dodLevel: 4`; standard feature task returns `dodLevel: 2`
    - [ ] Implement `classifyDodLevel(contextFiles: string[]): 1|2|3|4` in `packages/engine/src/verification/`
    - [ ] Heuristics (per spec §5.4 FR11): `*/auth/*` | `*/iam/*` | `*/security/*` → 4; `*/migrations/*` | `*/api/*` | `*/schema/*` → 3; standard → 2; docs/style → 1
    - [ ] Store classified level in `TrackExecutionState`
- [ ] Task: Extend `VerificationPipeline` with `runDodGate(level, taskId)` method [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing tests for `runDodGate()` Level 1 through Level 3 (Level 4 tested separately)
    - [ ] Implement `runDodGate()` by composing existing pipeline methods (per spec §5.4 FR10):
        - L1: TS compile check + markdown lint
        - L2: L1 + `this.parseCoverage()` ≥ 80%
        - L3: L2 + `this.vlmAuditor` + `this.mutationAnalyzer.verifyThreshold()`
        - L4: L3 + Tabula Rasa subagent (see next task)
    - [ ] All existing `runVerification()` and `runPhaseCheckpoint()` tests must continue to pass
- [ ] Task: Build isolated "Tabula Rasa" clean-slate Level 4 verification runner [TIER-4] [AGENT:caduceus-oracle]
    - [ ] Write failing test: `runDodGate(4, taskId)` invokes a subagent with `Workspace: 'branch'` and zero inherited context
    - [ ] Implement Tabula Rasa runner: `invoke_subagent` with `Workspace: 'branch'`, prompt containing only the repo path + build/test commands derived from `tech-stack.md`
    - [ ] Subagent runs: `tsc --noEmit && CI=true npm test` in a clean branch clone
    - [ ] If subagent exits non-zero → `runDodGate` returns `passed: false` with stdout/stderr as feedback
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Progressive Definition of Done' (Protocol in workflow.md)

---

## Phase 5: Integration & Finalization

- [ ] Task: Run full regression suite across all packages and verify all acceptance criteria [TIER-3] [AGENT:caduceus-processor]
    - [ ] `cd packages/engine && CI=true npm test` — zero failures
    - [ ] `tsc --noEmit` — zero type errors across engine package
    - [ ] Confirm all 8 acceptance criteria in `spec.md` §7 are checkable/met
- [ ] Task: Integrate track 'swarm_excellence_20260722' into main branch [TIER-3] [AGENT:caduceus-processor]
    - [ ] Merge track branch `track/swarm_excellence_20260722` into `main`
    - [ ] Tag release with appropriate version bump
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration & Finalization' (Protocol in workflow.md)
