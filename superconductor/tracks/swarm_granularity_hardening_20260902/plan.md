# Implementation Plan: Swarm Granularity Hardening

**Track ID:** `swarm_granularity_hardening_20260902`
**Max Concurrent Agents:** 3
**Estimated Wall-Clock:** ~40 min

---

## Wave Schedule

```
Wave 0 (TIER-1, inline — NO subagent):
  └─ Scaffold test file skeleton

Wave 1 (parallel, 3 agents):
  ├─ [DOMAIN:skills]   Amend swarm-execute/SKILL.md  (AC-1 + AC-2 + AC-3)
  ├─ [DOMAIN:skills]   Amend implement/SKILL.md       (AC-2 cross-ref + AC-4)
  └─ [DOMAIN:tests]    Write swarm-granularity.test.ts (AC-5)

Wave 2 (serial, 1 agent):
  └─ Integration review: verify all AC cross-references are consistent across both amended skill files
```

---

## Phase 0 — Scaffold

- [ ] Task: Create empty test file skeleton at `packages/superconductor-core/src/orchestration/__tests__/swarm-granularity.test.ts` with describe block stubs for AC-5 assertions. [TIER-1] [AGENT:setup] [DOMAIN:tests]

---

## Phase 1 — Parallel Skill Amendments + Tests

- [ ] Task: Amend `skills/swarm-execute/SKILL.md` to enforce `parseAndDispatch` verification (AC-1), insert TIER-1 Pre-Filter as Step 2a (AC-2), and add minimum-concurrency gate to Step 3 (AC-3). Include the 9-WorkUnit worked example in Step 3. [TIER-2] [AGENT:coding-agent] [DOMAIN:skills-swarm-execute]

- [ ] Task: Amend `skills/implement/SKILL.md` to cross-reference the TIER-1 Pre-Filter in §3.e.iii (AC-2), update §3.1 to delegate `plan.md` writes to superconductor-dreamer (AC-4), and add the `plan.md`/`spec.md` prohibition to the Root Orchestration Dogma block (AC-4). [TIER-2] [AGENT:coding-agent] [DOMAIN:skills-implement]

- [ ] Task: Implement `packages/superconductor-core/src/orchestration/__tests__/swarm-granularity.test.ts` with three test suites: (1) parseAndDispatch 1:1 mapping test, (2) TIER-1 pre-filter exclusion test, (3) batch minimum-concurrency gate test. All tests must pass red-green-refactor. [TIER-2] [AGENT:coding-agent] [DOMAIN:tests]

---

## Phase 2 — Cross-Reference Consistency Review

- [ ] Task: Run `grep -n "parseAndDispatch\|TIER-1\|Pre-Filter\|Dreamer\|plan.md\|minimum-concurrency" skills/swarm-execute/SKILL.md skills/implement/SKILL.md` and verify all AC cross-references are internally consistent. Fix any wording mismatches between the two files. Run `npm test -- --run src/orchestration/__tests__/swarm-granularity` and confirm all AC-5 tests green. [TIER-1] [AGENT:setup] [DOMAIN:validation]

---

## Dependency Graph

```
Phase 0 (TIER-1 inline)
    │
    ▼
Phase 1: [swarm-execute amend] ──parallel── [implement amend] ──parallel── [tests]
    │
    ▼
Phase 2: consistency review + test run (TIER-1 inline)
```

---

## Definition of Done

- [ ] `swarm-execute/SKILL.md` contains: Step 1 parseAndDispatch verification + WorkUnit mapping example, Step 2a TIER-1 Pre-Filter block, Step 3 minimum-concurrency gate with worked example
- [ ] `implement/SKILL.md §3.1` no longer allows root agent to write `plan.md` directly
- [ ] `implement/SKILL.md §3.e.iii` cross-references swarm-execute Step 2a TIER-1 Pre-Filter
- [ ] `implement/SKILL.md` Root Orchestration Dogma block contains `plan.md`/`spec.md` prohibition
- [ ] `swarm-granularity.test.ts` — 3 suites, all green
- [ ] All pre-existing `swarm-execute` tests still pass
