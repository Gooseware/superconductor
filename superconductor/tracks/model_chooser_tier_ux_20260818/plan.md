# Implementation Plan: Model Chooser — Tier-Based UX

**Track ID:** `model_chooser_tier_ux_20260818`
**Branch:** `track/model_chooser_tier_ux_20260818`
**Target Branch:** `main`
**Spec:** [spec.md](./spec.md)

---

## Phase 0: Swarm Preflight

- [x] Task: Verify `swarm-orchestrate` skill is installed and loaded [TIER-3] [AGENT:superconductor-processor] (SHA: 23eddaf)
    - [x] Check `~/.gemini/extensions/superconductor/skills/swarm-orchestrate/` exists
    - [x] If missing, surface install prompt to user before proceeding
- [x] Task: Create track branch `track/model_chooser_tier_ux_20260818` from `main` [TIER-3] [AGENT:superconductor-processor] (SHA: 23eddaf)
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) (SHA: 23eddaf)

---

## Phase 1: Types, Constants & New Public Methods (TDD)

> **Scope:** `packages/superconductor-core/src/models/model-chooser-dialog.ts`
> **Dispatched to:** Processor subagent — root agent MUST NOT write to `packages/*/src/**` directly.

- [x] Task: Write failing unit tests for `TierDefinition`, `SUPERCONDUCTOR_TIERS`, `buildModePrompt()`, and `buildTierPrompts()` [TIER-3] [AGENT:superconductor-processor] (SHA: 7cd4a0a)
    - [x] Test file: `packages/superconductor-core/src/models/__tests__/model-chooser-dialog-tiers.test.ts`
    - [x] Test AC-2: `buildTierPrompts()` returns array of exactly 3 items
    - [x] Test AC-13: `SUPERCONDUCTOR_TIERS` is exported and has 3 entries with correct role lists
    - [x] Test AC-14: `TierDefinition` interface is exported (compile-time check via import)
    - [x] Test: `buildModePrompt()` returns object with `name: 'mode'`, `type: 'select'`, 2 choices
    - [x] Test: tier pickers use `tier.id` as `name` and describe roles in `message`
    - [x] Test: initial index in tier picker resolves to first role's current model
    - [x] Run tests → confirm RED (failing) before implementation
- [x] Task: Implement `TierDefinition` interface export in `model-chooser-dialog.ts` [TIER-3] [AGENT:superconductor-processor] (SHA: 7cd4a0a)
- [x] Task: Implement `SUPERCONDUCTOR_TIERS` constant export in `model-chooser-dialog.ts` [TIER-3] [AGENT:superconductor-processor] (SHA: 7cd4a0a)
    - [x] Place immediately after `SUPERCONDUCTOR_ROLES` array
- [x] Task: Implement `buildModePrompt()` public method [TIER-3] [AGENT:superconductor-processor] (SHA: 7cd4a0a)
    - [x] Return single prompts-compatible `select` object per FR-2
- [x] Task: Implement `buildTierPrompts()` public method [TIER-3] [AGENT:superconductor-processor] (SHA: 7cd4a0a)
    - [x] Signature: `buildTierPrompts(models: DiscoveredModel[], currentAssignments: Record<string, string>): any[]`
    - [x] Uses `getRoleChoices()` for choices (reuse existing)
    - [x] Initial index resolves from first role in each tier's current assignment
- [x] Task: Run tests → confirm GREEN [TIER-3] [AGENT:superconductor-processor] (SHA: 7cd4a0a)
- [x] Task: Refactor: ensure no duplication with existing `buildRolePrompts()` logic [TIER-3] [AGENT:superconductor-processor] (SHA: 7cd4a0a)
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Types, Constants & New Public Methods' (Protocol in workflow.md) (SHA: 7cd4a0a)

---

## Phase 2: `run()` Method — CLI Flags & Mode Routing (TDD)

> **Scope:** `packages/superconductor-core/src/models/model-chooser-dialog.ts`
> **Dispatched to:** Processor subagent.

- [x] Task: Write failing unit tests for updated `run()` method [TIER-3] [AGENT:superconductor-processor] (SHA: 8b020ea)
    - [x] Test file: `packages/superconductor-core/src/models/__tests__/model-chooser-dialog-run.test.ts`
    - [x] Test AC-1: `run([])` (interactive, no flags) calls `promptFn` with mode-select prompt first
    - [x] Test AC-3: `run([])` with mode answer `'individual'` calls `buildRolePrompts()`
    - [x] Test AC-4: tier answers expand to all 5 role assignments (flash model maps to 3 roles)
    - [x] Test AC-5: `run(['--tier-mode'])` does NOT call mode prompt; goes directly to tier pickers
    - [x] Test AC-6: `run(['--individual-mode'])` does NOT call mode prompt; goes to role pickers
    - [x] Test AC-7: `run(['--tier-mode', '--individual-mode'])` uses tier mode + logs warning
    - [x] Test AC-8: `promptFn` returning `{}` at mode step => `{ cancelled: true }`
    - [x] Test AC-9: `promptFn` returning `{}` at tier step => `{ cancelled: true }`
    - [x] Test: existing flag short-circuit (`hasRoleFlags && presetScope`) still fires unchanged
    - [x] Test: `--list` and `--refresh-models` still work unchanged
    - [x] Run tests → confirm RED before implementation
- [x] Task: Add `--tier-mode` / `--individual-mode` flag parsing in `run()` CLI args loop [TIER-3] [AGENT:superconductor-processor] (SHA: 8b020ea)
    - [x] Mutual-exclusivity: both flags present => `forceMode = 'tier'` + warning log
- [x] Task: Implement mode-select step in `run()` interactive flow [TIER-3] [AGENT:superconductor-processor] (SHA: 8b020ea)
    - [x] Only fires when `forceMode` not set AND `hasRoleFlags` is false
    - [x] Cancellation returns `{ cancelled: true, scope: 'session', assignments: {} }`
- [x] Task: Implement tier-defaults path in `run()` [TIER-3] [AGENT:superconductor-processor] (SHA: 8b020ea)
    - [x] Call `buildTierPrompts()` then expand answers to 5-role map
    - [x] Cancellation handling consistent with existing role-cancel path
- [x] Task: Individual path remains unchanged — verify no regression in `run()` [TIER-3] [AGENT:superconductor-processor] (SHA: 8b020ea)
- [x] Task: Run tests → confirm GREEN [TIER-3] [AGENT:superconductor-processor] (SHA: 8b020ea)
- [x] Task: Refactor: extract tier-answer expansion into private helper `expandTierAnswers()` [TIER-3] [AGENT:superconductor-processor] (SHA: 8b020ea)
- [x] Task: Superconductor - User Manual Verification 'Phase 2: run() Method — CLI Flags & Mode Routing' (Protocol in workflow.md) (SHA: 8b020ea)

---

## Phase 3: Scope Prompt Description Clarification (TDD)

> **Scope:** `packages/superconductor-core/src/models/model-chooser-dialog.ts`

- [x] Task: Write failing test for updated `buildScopePrompt()` [TIER-3] [AGENT:superconductor-processor] (SHA: f2be054)
    - [x] Test AC-10: Global Default description contains "does NOT write to project file"
    - [x] Run test → confirm RED
- [x] Task: Update `buildScopePrompt()` Global Default description per FR-5 [TIER-3] [AGENT:superconductor-processor] (SHA: f2be054)
- [x] Task: Run test → confirm GREEN [TIER-3] [AGENT:superconductor-processor] (SHA: f2be054)
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Scope Prompt Description Clarification' (Protocol in workflow.md) (SHA: f2be054)

---

## Phase 4: Coverage Verification & TypeScript Compilation

- [x] Task: Run `pnpm -F superconductor-core test --coverage` and verify >= 80% for new code [TIER-3] [AGENT:superconductor-processor] (SHA: verified)
- [x] Task: Run `pnpm -F superconductor-core tsc --noEmit` and confirm zero errors [TIER-3] [AGENT:superconductor-processor] (SHA: verified)
- [x] Task: Run full existing test suite `pnpm -F superconductor-core test` and confirm AC-15 [TIER-3] [AGENT:superconductor-processor] (SHA: verified)
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Coverage & TypeScript' (Protocol in workflow.md) (SHA: verified)

---

## Phase 5: Documentation Updates

> **Scope:** `commands/superconductor/models.toml`, `skills/models/SKILL.md`
> Note: These files are NOT under `packages/*/src/**` — Dreamer may plan content but Processor writes.

- [x] Task: Update `commands/superconductor/models.toml` prompt field per FR-6 [TIER-3] [AGENT:superconductor-processor] (SHA: e49af2a)
    - [x] Add `--tier-mode` to "Check Arguments" section
    - [x] Add `--individual-mode` to "Check Arguments" section
    - [x] Update "Interactive Selection" to describe two-mode flow
- [x] Task: Update `skills/models/SKILL.md` per FR-7 [TIER-3] [AGENT:superconductor-processor] (SHA: e49af2a)
    - [x] Add `--tier-mode` entry to section 2.0
    - [x] Add `--individual-mode` entry to section 2.0
    - [x] Update section 5.0 step 2 to describe mode-select => tier path OR individual path
- [x] Task: Verify AC-11 and AC-12 by file inspection [TIER-3] [AGENT:superconductor-reviewer] (SHA: e49af2a)
- [x] Task: Superconductor - User Manual Verification 'Phase 5: Documentation Updates' (Protocol in workflow.md) (SHA: e49af2a)

---

## Phase 6: Quorum Review

- [x] Task: Run Quorum (Security, Correctness, Adversarial, Regression) on track diff [TIER-3] [AGENT:superconductor-reviewer] (SHA: c40ec99)
    - [x] Security: no new attack surface from flag parsing (no path traversal, no exec)
    - [x] Correctness: tier expansion covers all 5 roles with no gaps
    - [x] Adversarial: both-flags-present path correctly uses tier mode
    - [x] Regression: existing `--processor`, `--reviewer`, `--scope` flags unchanged
- [x] Task: If NEEDS_FIXES — dispatch domain-split remediators (DO NOT self-fix) [TIER-4] [AGENT:superconductor-oracle] (SHA: c40ec99)
- [x] Task: Re-run Quorum until unanimous RESOLVED [TIER-3] [AGENT:superconductor-reviewer] (SHA: c40ec99)
- [x] Task: Invoke `QuorumValidator.gateOracle({ quorumPassed: true })` before Oracle [TIER-4] [AGENT:superconductor-oracle] (SHA: c40ec99)
- [x] Task: Oracle final sign-off [TIER-4] [AGENT:superconductor-oracle] (SHA: c40ec99)
- [x] Task: Superconductor - User Manual Verification 'Phase 6: Quorum Review' (Protocol in workflow.md) (SHA: c40ec99)

---

## Phase 7: Integration & Finalization

- [x] Task: Merge track `model_chooser_tier_ux_20260818` into `main` branch [TIER-4] [AGENT:superconductor-dreamer] (SHA: e137ad09)
    - [x] Use `GitWorkflowManager.mergeToTarget('main', 'track/model_chooser_tier_ux_20260818')`
    - [x] Append `SwarmAuthorizer` trailer to finalization commit message
- [x] Task: Integrate track 'model_chooser_tier_ux_20260818' into main branch. [TIER-4] [AGENT:superconductor-dreamer] (SHA: e137ad09)
- [x] Task: Update `superconductor/tracks.md` status to `[x]` [TIER-3] [AGENT:superconductor-processor] (SHA: e137ad09)
- [x] Task: Superconductor - User Manual Verification 'Phase 7: Integration & Finalization' (Protocol in workflow.md) (SHA: e137ad09)

---

## Swarm Blueprint

```
source: keyword-heuristics
waves: 3
token_budget_estimate: ~28k tokens
oracle_cadence: every 2 phases

Wave 1 (Parallel): Phase 1 + Phase 3
Wave 2 (Sequential): Phase 2
Wave 3 (Sequential): Phase 4 → Phase 5 → Phase 6 → Phase 7
```

> **Note:** Run `node ~/.gemini/config/plugins/superconductor/packages/superconductor-core/dist/intelligence/cli-blueprint.js superconductor/tracks/model_chooser_tier_ux_20260818/plan.md` to inject annotated Swarm Blueprint with hotspot data once Intelligence snapshot is available.
