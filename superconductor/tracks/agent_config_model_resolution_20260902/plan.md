# Implementation Plan: Agent Config Model Resolution

**Track ID:** `agent_config_model_resolution_20260902`
**Max Concurrent Agents:** 3
**Estimated Wall-Clock:** ~35 min

---

## Wave Schedule

```
Wave 0 (TIER-1, inline — NO subagent):
  └─ Scaffold test file skeleton + create agent-config-model-resolution.ts stub

Wave 1 (parallel, 3 agents):
  ├─ [DOMAIN:skills-swarm-execute]  Amend swarm-execute/SKILL.md  (AC-1 + AC-2 + AC-3)
  ├─ [DOMAIN:skills-implement]      Amend implement/SKILL.md       (AC-4)
  └─ [DOMAIN:tests]                 Implement agent-config-model-resolution.ts + test suite (AC-5)

Wave 2 (TIER-1, inline — NO subagent):
  └─ Cross-reference consistency check + npm test for AC-5 suite
```

---

## Phase 0 — Scaffold

- [ ] Task: Create stub utility module at `packages/superconductor-core/src/orchestration/agent-config-model-resolution.ts` with exported function signatures only (no implementation). Create empty test skeleton at `packages/superconductor-core/src/orchestration/__tests__/agent-config-model-resolution.test.ts` with describe block stubs. [TIER-1] [AGENT:setup] [DOMAIN:tests]

---

## Phase 1 — Parallel Skill Amendments + Implementation

- [ ] Task: Amend `skills/swarm-execute/SKILL.md` to add mandatory AgentConfigReader step in §Step 1 (AC-1), insert model ID → tier enum mapping table (AC-2), and update the §Step 3 processor dispatch template and Remediation Protocol remediator dispatch to pass `Model: modelConfig.processor` / `Model: modelConfig.remediator` respectively (AC-3). [TIER-2] [AGENT:coding-agent] [DOMAIN:skills-swarm-execute]

- [ ] Task: Amend `skills/implement/SKILL.md` to add AgentConfigReader resolution step before quorum, oracle, and dreamer dispatch calls, passing `Model: modelConfig.reviewer`, `Model: modelConfig.oracle`, `Model: modelConfig.dreamer` respectively (AC-4). [TIER-2] [AGENT:coding-agent] [DOMAIN:skills-implement]

- [ ] Task: Implement `packages/superconductor-core/src/orchestration/agent-config-model-resolution.ts` exporting `resolveModelTier(modelId: string): ModelTierEnum`, `readAgentConfig(projectRoot: string): AgentConfig`, and `buildModelConfig(config: AgentConfig): ModelConfig`. Implement `packages/superconductor-core/src/orchestration/__tests__/agent-config-model-resolution.test.ts` with three suites: (1) model ID → tier enum resolution, (2) config file resolution order, (3) modelConfig completeness — no role maps to "inherit". All tests must pass. [TIER-2] [AGENT:coding-agent] [DOMAIN:tests]

---

## Phase 2 — Validation

- [ ] Task: Run `grep -n "modelConfig\|AgentConfigReader\|resolveModelTier\|Model: modelConfig" skills/swarm-execute/SKILL.md skills/implement/SKILL.md` and verify all AC cross-references are consistent. Run `npm test -- --run src/orchestration/__tests__/agent-config-model-resolution` and confirm all AC-5 tests green. [TIER-1] [AGENT:setup] [DOMAIN:validation]

---

## Dependency Graph

```
Phase 0 (TIER-1 inline)
    │
    ▼
Phase 1: [swarm-execute amend] ──parallel── [implement amend] ──parallel── [ts impl + tests]
    │
    ▼
Phase 2: consistency check + test run (TIER-1 inline)
```

---

## Definition of Done

- [ ] `swarm-execute/SKILL.md §Step 1` contains AgentConfigReader step with modelConfig resolution
- [ ] Model ID → tier enum table present in `swarm-execute/SKILL.md`
- [ ] §Step 3 processor dispatch template shows `Model: modelConfig.processor`
- [ ] Remediation Protocol remediator dispatch shows `Model: modelConfig.remediator`
- [ ] `implement/SKILL.md` resolves modelConfig before quorum, oracle, dreamer dispatch
- [ ] `agent-config-model-resolution.ts` compiles and exports all 3 functions
- [ ] Test suite: 3 suites, all green
- [ ] No `Model: "inherit"` in any dispatch template in either SKILL.md
