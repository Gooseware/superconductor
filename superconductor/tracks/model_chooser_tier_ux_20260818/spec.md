# Specification: Model Chooser — Tier-Based UX

**Track ID:** `model_chooser_tier_ux_20260818`
**Type:** Feature
**Status:** Planned
**Created:** 2026-08-18

---

## 1. Overview

The current `ModelChooserDialog.run()` asks users to pick a model for each of the 5 swarm roles individually, then asks for a single persistence scope. This is verbose for users who simply want to change the tier-level (e.g. swap all Flash roles to a different Flash model).

This track introduces a **two-mode UX**: a fast "tier defaults" path that groups roles by logical tier and presents 3 pickers instead of 5, and an "individual" path that preserves the existing per-role flow. It also adds `--tier-mode` / `--individual-mode` CLI flags to allow headless callers to force a path without the mode-select prompt.

The scope-selection question (Step 3) is unchanged except for a clarification that **Global Default does NOT write to the project file** — it writes `~/.gemini/agent-config.md` only.

---

## 2. Research Notes

- **Existing art in `model-chooser-dialog.ts`:** The dialog already has clean separation between `buildRolePrompts()`, `buildScopePrompt()`, and `run()`. The new methods slot naturally alongside the existing public surface.
- **`prompts` library:** Already used for `select` prompts; no new dependencies needed.
- **Headless / flag-driven path:** The existing short-circuit (`hasRoleFlags && presetScope`) must remain intact; the new flags must not break it.
- **SWARM GUARDRAILS:** Root agent MUST NOT write to `packages/*/src/**` directly. Implementation dispatched to Processor subagent only.

---

## 3. Architecture Committee Recommendations

**Dreamer (Architecture):**
- Place `TierDefinition` type and `SUPERCONDUCTOR_TIERS` constant in `model-chooser-dialog.ts`, immediately after `SUPERCONDUCTOR_ROLES`, so both arrays live in the same module and remain co-located for future changes.
- `buildModePrompt()` and `buildTierPrompts()` follow the same pattern as `buildRolePrompts()` and `buildScopePrompt()` — returning plain prompt-definition objects, not side-effecting calls — so they are independently testable without invoking `promptFn`.
- The `run()` method orchestrates the new flow through a `mode` variable (`'tier' | 'individual'`) resolved from flags or the mode-select answer.

**Reviewer (Security & Robustness):**
- Cancellation handling must be uniform: if the user cancels the mode-select prompt, treat it identically to cancelling the role prompt (return `cancelled: true`).
- The `--tier-mode` and `--individual-mode` flags must be mutually exclusive; if both appear, `--tier-mode` wins and a warning is logged.
- Tier model application must expand from the 3 tier answers into the full 5-role `assignments` map before calling `persistAssignments` — no partial assignment must be persisted.

---

## 4. Functional Requirements

### FR-1 — `TierDefinition` Type & `SUPERCONDUCTOR_TIERS` Constant

Add the following types and constants **exported** from `model-chooser-dialog.ts`:

```typescript
export interface TierDefinition {
  id: string;
  label: string;       // e.g. 'Tier 3 / Flash'
  roles: string[];     // role IDs that belong to this tier
}

export const SUPERCONDUCTOR_TIERS: TierDefinition[] = [
  {
    id: 'flash',
    label: 'Tier 3 / Flash',
    roles: ['superconductor-processor', 'superconductor-reviewer', 'remediation-processor'],
  },
  {
    id: 'pro',
    label: 'Tier 4 / Pro',
    roles: ['superconductor-dreamer'],
  },
  {
    id: 'pro-thinking',
    label: 'Tier 4 / Pro Thinking',
    roles: ['superconductor-oracle'],
  },
];
```

### FR-2 — `buildModePrompt()` Public Method

Add a public method that returns a single `prompts`-compatible question object for mode selection:

- **Prompt type:** `select`
- **Name:** `mode`
- **Message:** `"How would you like to configure models?"`
- **Choices:**
  - `{ title: 'Use tier defaults', value: 'tier', description: 'Set one model per tier group (3 pickers)' }`
  - `{ title: 'Select models individually', value: 'individual', description: 'Configure each role separately (5 pickers)' }`
- **Initial:** `0` (tier defaults pre-selected)

### FR-3 — `buildTierPrompts()` Public Method

Add a public method with signature:

```typescript
public buildTierPrompts(
  models: DiscoveredModel[],
  currentAssignments: Record<string, string>
): any[]
```

- Returns **3 prompt objects** (one per tier in `SUPERCONDUCTOR_TIERS` order).
- Each prompt:
  - **type:** `select`
  - **name:** `tier.id` (e.g. `'flash'`, `'pro'`, `'pro-thinking'`)
  - **message:** `"${tier.label} model — covers: ${tier.roles.join(', ')}:"`
  - **choices:** same `getRoleChoices()` output used by `buildRolePrompts()`
  - **initial:** index of the model currently assigned to the **first role** in `tier.roles`; falls back to `0` if not found.

### FR-4 — Updated `run()` Method Flow

The updated flow in `ModelChooserDialog.run(args)`:

**CLI flag parsing (new flags):**
- `--tier-mode` => sets `forceMode = 'tier'`
- `--individual-mode` => sets `forceMode = 'individual'`
- If both present => `forceMode = 'tier'`; log warning: `"Warning: Both --tier-mode and --individual-mode provided; using --tier-mode."`

**Step 1 — Mode selection** (only if `forceMode` is not set and no role flags were supplied):
- Prompt: `buildModePrompt()`
- answer.mode: `'tier' | 'individual'`
- If cancelled => return `{ cancelled: true, ... }`

**Step 2a — Tier defaults path** (`mode === 'tier'`):
- Prompt: `buildTierPrompts(models, currentAssignments)`
- answers: `{ flash: modelId, pro: modelId, 'pro-thinking': modelId }`
- Expand into 5-role assignments map by iterating `SUPERCONDUCTOR_TIERS`
- If cancelled => return `{ cancelled: true, ... }`

**Step 2b — Individual path** (`mode === 'individual'`):
- Prompt: `buildRolePrompts(models, currentAssignments)` (unchanged)
- answers merged into finalAssignments
- If cancelled => return `{ cancelled: true, ... }`

**Step 3 — Scope** (unchanged except description update):
- "Project Override" => writes `superconductor/agent-config.md` only
- "Global Default" => writes `~/.gemini/agent-config.md` ONLY (does NOT touch project file)
- "Session / Once-off" => in-memory ephemeral

The existing short-circuit (`hasRoleFlags && presetScope`) remains before the interactive flow and is unaffected.

### FR-5 — Scope Description Clarification

Update the `buildScopePrompt()` `Global Default` choice description from:
`'~/.gemini/agent-config.md (user-wide default)'`
to:
`'~/.gemini/agent-config.md only — does NOT write to project file'`

### FR-6 — `commands/superconductor/models.toml` Update

Update the `prompt` field to document the new `--tier-mode` and `--individual-mode` flags and the new two-step mode selection flow in the Interactive Selection section.

### FR-7 — `skills/models/SKILL.md` Update

Update section `2.0 INPUT RESOLUTION & CLI FLAGS` to add:
- `--tier-mode` — skips mode question and forces tier-defaults path (3 pickers)
- `--individual-mode` — skips mode question and forces per-role path (5 pickers)

Update section `5.0 INTERACTIVE DIALOGUE & PERSISTENCE PROTOCOL` step 2 to describe the new two-mode flow.

---

## 5. Non-Functional Requirements

- **NFR-1 (No Breaking Changes):** Existing callers using `--processor`, `--reviewer`, `--dreamer`, `--oracle`, `--remediator` flags continue to work without change.
- **NFR-2 (Test Coverage >= 80%):** All new methods (`buildModePrompt`, `buildTierPrompts`) and the updated `run()` paths must have unit tests.
- **NFR-3 (No New Dependencies):** Only the existing `prompts` library is used; no new npm packages.
- **NFR-4 (TypeScript Strict):** All new code must pass `tsc --strict` with zero errors.
- **NFR-5 (Swarm Guardrail Compliance):** Implementation dispatched via Processor subagent only. Root agent MUST NOT write to `packages/*/src/**`.

---

## 6. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| AC-1 | Running dialog interactively (no flags) shows mode-select prompt as first question | Unit test: `run()` calls `promptFn` with `buildModePrompt()` output first |
| AC-2 | Selecting "Use tier defaults" presents exactly 3 tier pickers | Unit test: `buildTierPrompts()` returns array of length 3 |
| AC-3 | Selecting "Select models individually" presents 5 role pickers (unchanged flow) | Unit test: `run()` with `mode='individual'` calls `buildRolePrompts()` |
| AC-4 | Tier picker answers expand into all 5 role assignments | Unit test: flash=>modelX assigns modelX to processor, reviewer, remediation-processor |
| AC-5 | `--tier-mode` flag skips mode-select prompt and goes straight to tier pickers | Unit test: `run(['--tier-mode'])` does NOT call `buildModePrompt()` |
| AC-6 | `--individual-mode` flag skips mode-select prompt and goes straight to role pickers | Unit test: `run(['--individual-mode'])` does NOT call `buildModePrompt()` |
| AC-7 | When both `--tier-mode` and `--individual-mode` are present, `--tier-mode` wins + warning logged | Unit test: verify `logger.log` called with warning text |
| AC-8 | Cancelling mode-select returns `{ cancelled: true }` | Unit test: `promptFn` returns `{}` at mode step => cancelled |
| AC-9 | Cancelling tier pickers returns `{ cancelled: true }` | Unit test: `promptFn` returns `{}` at tier step => cancelled |
| AC-10 | Global Default scope description reads "does NOT write to project file" | Unit test: `buildScopePrompt()` global choice description contains "does NOT write" |
| AC-11 | `--tier-mode` and `--individual-mode` documented in `models.toml` | File inspection |
| AC-12 | `--tier-mode` and `--individual-mode` documented in `skills/models/SKILL.md` | File inspection |
| AC-13 | `SUPERCONDUCTOR_TIERS` exported from `model-chooser-dialog.ts` | TypeScript import test |
| AC-14 | `TierDefinition` exported from `model-chooser-dialog.ts` | TypeScript import test |
| AC-15 | All existing tests continue to pass | `pnpm test` in `packages/superconductor-core` |

---

## 7. Out of Scope

- Changing how `AgentConfigWriter` writes or reads config files.
- Changes to `ModelCatalogService` or the 24-hour TTL cache.
- Adding a tier-based selection to standalone review or quorum flows.
- Any UI beyond the CLI `prompts`-based terminal dialog.
- New npm dependencies.
