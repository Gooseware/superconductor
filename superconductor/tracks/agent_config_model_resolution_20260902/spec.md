# Spec: Agent Config Model Resolution

**Track ID:** `agent_config_model_resolution_20260902`
**Author:** Root Orchestrator (session 7bbacdf2)
**Created:** 2026-09-02

---

## Problem Statement

When the root orchestrator dispatches `invoke_subagent`, it passes `"Model": "inherit"` for processor and remediator agents, causing them to run on the root agent's model tier instead of the model configured for their role in `superconductor/agent-config.md`.

The user configures role-to-model mappings via `/superconductor:models` which writes to `agent-config.md`. This configuration is silently ignored at dispatch time because:

1. `swarm-execute/SKILL.md` has no step that reads `agent-config.md` before calling `invoke_subagent`
2. There is no codified mapping from model ID strings (e.g. `gemini-3.7-flash-high`) to the `invoke_subagent` `Model` enum values (`flash`, `flash_lite`, `pro`, `inherit`)
3. `implement/SKILL.md` also dispatches quorum and oracle agents without reading the config

## Root Cause

`swarm-execute §Step 1` calls `parseAndDispatch()` but never calls `AgentConfigReader` to resolve role → model tier. The `invoke_subagent` `Model` parameter is then either omitted (defaulting to `inherit`) or hardcoded without consulting config.

---

## Acceptance Criteria

**AC-1 — Config Resolution Step in `swarm-execute` §Step 1:**
After `parseAndDispatch()`, `swarm-execute/SKILL.md §Step 1` must include a mandatory `AgentConfigReader` step that:
- Reads `superconductor/agent-config.md` (project override) or `~/.gemini/agent-config.md` (global fallback)
- Resolves the `## Swarm Agent Model Assignments` table into a role → model-tier-enum map
- Stores result as `modelConfig` available to all subsequent `invoke_subagent` calls
- Logs resolved config to `swarm_log.md`: `[swarm-execute] modelConfig resolved: { processor: "flash", reviewer: "flash", dreamer: "pro", oracle: "pro", remediator: "flash" }`

**AC-2 — Model ID → Tier Enum Mapping Table:**
`swarm-execute/SKILL.md` must contain an explicit model-ID-to-tier-enum resolution table:

```
Tier enum resolution (for invoke_subagent Model parameter):
  *-flash-*  / *-flash        → "flash"
  *-flash-lite*               → "flash_lite"
  *-pro-*    / *-pro          → "pro"
  claude-*-sonnet-*           → "pro"
  claude-*-opus-*             → "pro"
  gpt-oss-*-medium            → "flash"
  Unknown / unmapped          → "flash"  (safe non-inherit default — NEVER "inherit")
```

**AC-3 — Enforce modelConfig at `invoke_subagent` call sites in `swarm-execute §Step 3`:**
The dispatch template for `superconductor-processor` in §Step 3 must explicitly pass `Model: modelConfig.processor` (not `inherit`). Remediator dispatch in the Remediation Protocol must pass `Model: modelConfig.remediator`.

**AC-4 — Enforce modelConfig in `implement/SKILL.md` for quorum + oracle dispatch:**
`implement/SKILL.md` must include a `AgentConfigReader` call (referencing the same resolution protocol as AC-1) before dispatching:
- Quorum reviewers → `Model: modelConfig.reviewer`
- Oracle → `Model: modelConfig.oracle`
- Dreamer (plan verification) → `Model: modelConfig.dreamer`

**AC-5 — Test coverage for model resolution logic:**
New test file `packages/superconductor-core/src/orchestration/__tests__/agent-config-model-resolution.test.ts` with:
- Suite 1: Model ID → tier enum resolution (flash variants, pro variants, sonnet/opus, unknown)
- Suite 2: Config file resolution order (project override beats global, global beats internal default)
- Suite 3: `modelConfig` completeness — all 5 roles present after resolution, no role maps to `"inherit"`

---

## Files in Scope

| File | Change type |
|------|-------------|
| `skills/swarm-execute/SKILL.md` | Amend (AC-1, AC-2, AC-3) |
| `skills/implement/SKILL.md` | Amend (AC-4) |
| `packages/superconductor-core/src/orchestration/agent-config-model-resolution.ts` | New utility module |
| `packages/superconductor-core/src/orchestration/__tests__/agent-config-model-resolution.test.ts` | New test file (AC-5) |

## Definition of Done

- [ ] `swarm-execute/SKILL.md §Step 1` reads `agent-config.md` and resolves `modelConfig` before any `invoke_subagent`
- [ ] Model ID → tier enum mapping table present in `swarm-execute/SKILL.md`
- [ ] Processor dispatch in §Step 3 passes `Model: modelConfig.processor`
- [ ] Remediator dispatch passes `Model: modelConfig.remediator`
- [ ] `implement/SKILL.md` resolves `modelConfig` before dispatching quorum, oracle, dreamer
- [ ] `agent-config-model-resolution.ts` exports `resolveModelTier`, `readAgentConfig`, `buildModelConfig`
- [ ] Test suite: 3 suites, all green
- [ ] No role ever dispatched with `Model: "inherit"` when `agent-config.md` is present
