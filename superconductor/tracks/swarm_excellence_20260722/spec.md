# Specification: Swarm Excellence Engine
## Asymmetric Refinement, Token Budgeting & Progressive Quality Gates

## 1. Overview

This track implements the transformation blueprint defined in `WORKFLOW_EXCELLENCE_BLUEPRINT.md` and `deep_research.md` ("Architectural Optimization of Autonomous Software Engineering Swarms").

The core goal is to elevate Superconductor into a production-grade autonomous software engineering framework that reliably produces zero-defect code on an optimized token budget.

Key Objectives:
1. **500-Line Skill Progressive Disclosure**: Enforce strict 500-line limits across all skill specifications (`SKILL.md`) and introduce `skill-rules.json` intent triggers for dynamic loading.
2. **Pre-Computed Symbol Indexing & AST Context Builder**: Upgrade `packages/engine/src/context/builder.ts` to query AST call-graphs (`repowise`, `cclsp`) and pass diff-only payloads (~1-5k tokens) to Reviewer agents instead of dumping full file contents into LLM context windows.
3. **Stateful Asymmetric Refinement Engine**: Enhance `packages/engine/src/engine.ts` with explicit TypeScript state serialization (`TrackExecutionState`), strict read-only tool isolation for Reviewers via `ToolSurfaceFilter`, and automated checkpoint-commit + `git reset --hard` rollback when `iteration_count >= 3`.
4. **Dynamic 4-Tier Model Cascade & Escalation Router**: Wire the existing `EscalationRouter` (threshold: 3 failures) directly to `SmartModelResolver` tier switching based on failure signals and task blast radius.
5. **Progressive Definition of Done (DoD) & Tabula Rasa Gate**: Extend the existing `VerificationPipeline` (PBT, mutation, VLM) into a 4-tier DoD checklist validator scaling from basic compilation (Level 1) to clean-slate "Tabula Rasa" verification (Level 4).

---

## 2. Existing Framework — Extend, Never Reimpleiment

> **CRITICAL IMPLEMENTATION DIRECTIVE**: This track MUST build on top of the existing Superconductor engine infrastructure. Before writing any new code, the implementing agent MUST read and understand the following files. Do NOT duplicate their logic.

| Existing Module | File | What It Already Does | What This Track Extends It With |
|:---|:---|:---|:---|
| `EscalationRouter` | `packages/engine/src/routing/escalation-router.ts` | Signal history, 3-failure threshold, escalate/downshift lifecycle, event emission | Wire escalation signal → `SmartModelResolver.resolve(tier)` for live model switching |
| `SmartModelResolver` | `packages/engine/src/routing/SmartModelResolver.ts` | Tier-to-model mapping from `agent-config.md`, Caduceus history suggestion, atomic `active_model.json` write | Accept escalation events and re-resolve model tier dynamically during execution |
| `CacheManager` | `packages/engine/src/routing/cache-manager.ts` | LRU-evicting prefix cache, token budget accounting, hit ratio reporting | Wire into `ContextBuilder` output for per-task prompt caching |
| `StormController` | `packages/engine/src/concurrency/storm.ts` | Per-path file-owner locking, conflict detection, access release | Extend with Git worktree branch assignment per track for isolation |
| `VerificationPipeline` | `packages/engine/src/verification/verification-pipeline.ts` | PBT validation, mutation testing, VLM auditing, coverage parsing (80% threshold) | Add DoD level classification layer on top; reuse existing check methods |
| `EventStore` | `packages/engine/src/state/event-store.ts` | SQLite WAL event log, task-scoped query, timestamp-ordered replay | Persist `TrackExecutionState` transitions as event records |
| `Engine` | `packages/engine/src/engine.ts` | DAG scheduler, parallel dispatch, lock-aware task pumping, halt-on-failure | Add `TrackExecutionState` map, Reviewer tool surface assignment, rollback trigger |

---

## 3. Research Notes

- **Asymmetric Refinement Loops**: Read-only validation prevents review agents from introducing unverified edits to pass their own checks. Multi-agent state isolation is essential for fault containment.
- **AST / LSP Proxying vs. Context Stuffing**: Injecting raw repository files rapidly exhausts token budgets and degrades reasoning quality. Querying pre-computed symbol graphs (`find_definition`, `find_references` via `cclsp` MCP) reduces context overhead by up to 90%.
- **Skill Progressive Disclosure**: Keeping core instruction files under 500 lines and offloading deep references to auxiliary files prevents prompt bloat while allowing on-demand retrieval. `setup/SKILL.md` at 675 lines is the primary violator.
- **Progressive Definition of Done**: Hardcoding static, complex quality gates for simple tasks causes unnecessary latency. Dynamic gating based on task scope (security files → Level 3+, auth/IAM → Level 4) optimizes velocity and safety.

---

## 4. Architecture Committee Report

### Dreamer's Structural Vision
- Add a `ToolSurfaceFilter` middleware layer in `Dispatcher` that intercepts tool calls and enforces per-role access policies.
- Extend `DagNode` type with `symbolDependencies: {file: string, symbol: string}[]` and `toolSurface: 'full' | 'readonly'` fields.
- Extend `ContextBuilder` to resolve `symbolDependencies` via `cclsp` MCP calls and concatenate with a `git diff HEAD -- <files>` payload.
- Add `TrackExecutionState` persistent map to `Engine` keyed by `taskId`.
- Classify DoD level at task dispatch time based on file path heuristics; route to `VerificationPipeline` accordingly.

### Reviewer's Hardening Requirements
- **Read-Only Enforcement**: Reviewer tool surface must deny `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `run_command` (with any write-flag invocation).
- **Circuit Breaker Ceiling**: Hard limit of 3 review loop iterations before rollback and Tier 4 escalation.
- **Checkpoint-Before Pattern**: Use `git commit -m "checkpoint: pre-task <task_id>"` (not `git stash`) before each Coding Agent turn. On circuit breaker: `git reset --hard <checkpoint_sha>`.
- **Atomic File State**: All cache and state persistence must use write-then-rename (atomic) patterns — already enforced in `SmartModelResolver.write()` and `StorageCacheManager`.
- **Graceful LSP Failure**: If `cclsp` MCP server is offline, fall back to targeted file section reads by line range.

---

## 5. Functional Requirements

### 5.1 Skill Modularization & Trigger Engine
- **FR1**: All `skills/*/SKILL.md` files must comply with the 500-line limit. `setup/SKILL.md` (675 lines) is the primary violator and must be refactored first.
- **FR2**: Each skill directory must contain a valid `skill-rules.json` conforming to the following canonical schema:
  ```json
  {
    "$schema": "superconductor/schema/skill-rules.schema.json",
    "version": "1.0",
    "triggers": {
      "keywords": ["string"],
      "fileGlobs": ["glob-string"],
      "intentPatterns": ["regex-string"],
      "executionEvents": ["UserPromptSubmit", "PreToolUse"]
    },
    "metadata": {
      "name": "string",
      "marketplace": "lobehub | skillsmp | 1p",
      "version": "semver-string"
    }
  }
  ```
- **FR3**: The engine must dynamically load skill context based on active task triggers at dispatch time.

### 5.2 AST Symbol Context Builder & Token Optimization
- **FR4**: `ContextBuilder` must be extended with a `resolveSymbols(deps: SymbolDependency[]): Promise<string>` method that calls `cclsp/find_definition` and `cclsp/find_references` MCP tools. The `DagNode` type must gain `symbolDependencies: {file: string, symbol: string}[]`.
  - **Offline fallback**: If `cclsp` is unavailable, read targeted file sections (line ranges) using `view_file` with `StartLine`/`EndLine`.
- **FR5**: `Reviewer` subagent payloads must contain only: `git diff HEAD -- <changed_files>` output + resolved symbol definitions. No full file dumps.
- **FR6**: `ContextBuilder` output must be processed through the existing `CacheManager.processPayload()` before dispatch to eliminate redundant prompt prefix costs.

### 5.3 Stateful Engine & Asymmetric Refinement Loop
- **FR7**: `Engine` must maintain a `Map<taskId, TrackExecutionState>` with the following interface:
  ```typescript
  interface ReviewComment {
    severity: 'critical' | 'major' | 'minor';
    file: string;
    line?: number;
    message: string;
  }
  interface TrackExecutionState {
    taskId: string;
    trackId: string;
    iteration_count: number;
    execution_errors: string[];
    review_comments: ReviewComment[];
    checkpointSha?: string;       // SHA of pre-task checkpoint commit
    model_tier: 1 | 2 | 3 | 4;
    escalated: boolean;
  }
  ```
- **FR8**: `Dispatcher` must enforce a `ToolSurfaceFilter` middleware:
  - Extend `SubagentConfig` / `DagNode` with `toolSurface: 'full' | 'readonly'` field (default: `'full'`).
  - `ToolSurfaceFilter` denies the following tool calls when `toolSurface === 'readonly'`: `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `run_command`.
  - All `DagNode`s with `role === 'reviewer'` must have `toolSurface: 'readonly'` set automatically at dispatch.
- **FR9**: Pre-task checkpoint and circuit-breaker rollback:
  - Before each Coding Agent turn begins: execute `git commit --allow-empty -m "checkpoint: pre-task <task_id>"` and record the resulting SHA in `TrackExecutionState.checkpointSha`.
  - When `iteration_count >= 3`: release `StormController` locks, execute `git reset --hard <checkpointSha>`, emit `red_green_failure` signal to existing `EscalationRouter`, await `EscalationRouter.processSignal()` return value of `'escalate'`, then re-dispatch task with `model_tier: 4`.

### 5.4 4-Tier Progressive Definition of Done Gate
- **FR10**: Extend (not replace) the existing `VerificationPipeline` with a `runDodGate(level: 1|2|3|4, taskId: string): Promise<VerificationPipelineResult>` method:
  - **Level 1**: Compilation without warnings + markdown lint (fast).
  - **Level 2**: Level 1 + `parseCoverage()` ≥ 80% + zero regression (already in `VerificationPipeline`).
  - **Level 3**: Level 2 + `validatePbtUsage()` + `verifyThreshold()` mutation score + zero high-severity security issues.
  - **Level 4**: Level 3 + isolated "Tabula Rasa" subagent (`invoke_subagent` with `Workspace: 'branch'`, zero inherited context) that compiles and runs the full test suite from scratch.
- **FR11**: Task classification heuristic (determines DoD level at dispatch):
  - Any task touching `*/auth/*`, `*/iam/*`, `*/security/*` → Level 4
  - Any task touching `*/migrations/*`, `*/api/*`, `*/schema/*` → Level 3
  - Any standard feature task → Level 2
  - Documentation/style-only tasks → Level 1

---

## 6. Non-Functional Requirements
- **NFR1 (Performance)**: Pre-task context assembly (symbol resolution + diff generation) must complete within 500ms. Cache hits should bring this below 50ms.
- **NFR2 (Security)**: `ToolSurfaceFilter` enforcement must be tested with adversarial tool calls in unit tests.
- **NFR3 (Maintainability)**: All changes to `engine.ts`, `builder.ts`, and `verification-pipeline.ts` must maintain full backward compatibility. Existing tests must continue to pass.
- **NFR4 (Atomicity)**: All state writes (checkpoint SHA, model tier, iteration count) must be atomic and survive process crashes.

---

## 7. Acceptance Criteria
- [ ] All `skills/*/SKILL.md` files are ≤ 500 lines. `setup/SKILL.md` is the last file to be brought into compliance.
- [ ] A canonical `superconductor/schema/skill-rules.schema.json` exists and all skill directories have a valid `skill-rules.json` validated against it.
- [ ] `ContextBuilder.resolveSymbols()` is implemented and has a working `cclsp` path and a line-range fallback path, each covered by tests.
- [ ] Reviewer-role `DagNode`s cannot invoke `write_to_file` or `run_command`. Enforced by `ToolSurfaceFilter` unit tests.
- [ ] `TrackExecutionState` is persisted in `EventStore` and survives engine restart (reconstructable from event log).
- [ ] Git checkpoint commit is created before each Coding Agent turn; `git reset --hard` is executed on circuit breaker, verified by integration test.
- [ ] `VerificationPipeline.runDodGate()` is implemented; Level 4 Tabula Rasa invokes a clean-branch subagent with zero inherited context.
- [ ] All existing engine tests continue to pass. No regressions.

---

## 8. Out of Scope
- Direct modification of external MCP server binaries (integrates via standard MCP protocols only).
- Support for non-Git version control systems.
- Rebuilding any module that already exists in `packages/engine/src/` — extend only.
