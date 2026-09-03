# Implementation Plan: Note-Taking Hardening

**Track ID:** `note_taking_hardening_20260903`
**Max Concurrent Agents:** 3
**Target Branch:** `main`

---

## Oracle Proactive Planning

- `NoteWriter` uses a single private `_write(type, content, options)` base + 7 thin typed wrappers
- Typed interfaces follow `agent-config-model-resolution.ts` export pattern (`NoteWriterOptions`, `NoteEntry`)
- Test fixtures reuse `fs.mkdtempSync` pattern from `agent-config-model-resolution.test.ts`
- REV-3 fix: new `rate_limits` SQLite table with atomic `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`
- `NoteWriter` error policy: swallow for `info/design/preference/style/procedure` (fire-and-forget); surface for `quorum`/`warning` (integrity-critical)

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify `swarm-orchestrate` skill installed and swarm mode is active. Run global preflight `npm test -- --run` and cache result for quorum reviewers. [TIER-1] [AGENT:setup]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Foundation — NoteWriter Utility + Notebook-Store Hardening

- [ ] Task: Implement `packages/superconductor-core/src/notebook/note-writer.ts` with private `_write` base and 7 typed methods: `writeDesignNote`, `writeWarningNote`, `writePreferenceNote`, `writeQuorumNote`, `writeProcedureNote`, `writeStyleNote`, `writeReusableCodeNote`. All methods: `track_id` required, content ≤280 chars enforced, content wrapped in `<notebook_entry>` tags. Error policy: fire-and-forget for design/preference/style/procedure; surface errors for quorum/warning. Export typed interfaces `NoteWriterOptions`, `NoteEntry`. [TIER-2] [AGENT:superconductor-processor] [DOMAIN:note-writer]

- [ ] Task: Fix REV-3 + REV-4 in `packages/notebook-store/src/validation/notebook-validator.ts` and `libsql-notebook-provider.ts`: (REV-3) Replace JSON file-based rate-limit with atomic SQLite using `INSERT INTO rate_limits (invocation_id, count) VALUES (?, 1) ON CONFLICT(invocation_id) DO UPDATE SET count = count + 1 RETURNING count`. (REV-4) Move rate-limit increment to run AFTER successful deduplication check — if duplicate detected, return success without incrementing. [TIER-2] [AGENT:superconductor-processor] [DOMAIN:notebook-store-ratelimit]

- [ ] Task: Fix REV-1 + REV-2 + REV-5 in notebook-store: (REV-1) Wrap stored content in `<notebook_entry>` tags in `NotebookService.write`; strip on retrieval. (REV-2) Add `limit: number` param to `libsql-notebook-provider.ts` `summary()`, default 20. (REV-5) Make `track_id` required in `notebook_write` MCP schema in `packages/superconductor-kernel/src/index.ts`; remove `'default-track'` fallback in `NotebookService.ts`. [TIER-2] [AGENT:superconductor-processor] [DOMAIN:notebook-store-schema]

- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Foundation' (Protocol in workflow.md)

---

## Phase 2: Tests

- [ ] Task: Write and pass `packages/superconductor-core/src/notebook/__tests__/note-writer.test.ts`: Suite 1 — all 7 typed methods produce `<notebook_entry>`-tagged content; Suite 2 — content >280 chars is truncated/rejected; Suite 3 — `track_id` missing throws; Suite 4 — quorum/warning failures surface as thrown errors; design/preference failures swallowed. TDD: red → green → refactor. [TIER-2] [AGENT:superconductor-processor] [DOMAIN:tests-note-writer]

- [ ] Task: Write and pass `packages/notebook-store/tests/notebook-hardening.test.ts`: Suite 1 — dedup check runs before rate-limit increment (retry does not exhaust quota); Suite 2 — concurrent writes from 4 agents don't corrupt rate-limit count (SQLite atomicity); Suite 3 — `track_id` missing in `notebook_write` returns validation error; Suite 4 — `notebook_summary` respects `limit` param. TDD: red → green → refactor. [TIER-2] [AGENT:superconductor-processor] [DOMAIN:tests-notebook-store]

- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Tests' (Protocol in workflow.md)

---

## Phase 3: SKILL.md Instrumentation

- [ ] Task: Amend `skills/swarm-execute/SKILL.md` to mandate `NoteWriter` calls at: (1) after each quorum reviewer verdict — `writeQuorumNote({ track_id, reviewer_role, verdict, findings_count })`; (2) after Oracle verdict — `writeDesignNote({ track_id, oracle_verdict, key_decisions })`; (3) after each remediator completes — `writeWarningNote({ track_id, finding_id, domain, fix_summary })`. Inline call site examples in protocol steps. File must remain ≤500 lines. [TIER-2] [AGENT:superconductor-processor] [DOMAIN:skills-swarm-execute]

- [ ] Task: Amend `skills/implement/SKILL.md` to mandate `NoteWriter` calls at: (1) after plan approval — `writeDesignNote`; (2) after Oracle final verdict — `writeDesignNote`; (3) after track completion — `writeProcedureNote`; (4) when user corrects agent behavior — `writePreferenceNote`; (5) when user approves model choice — `writePreferenceNote`. File must remain ≤500 lines. [TIER-2] [AGENT:superconductor-processor] [DOMAIN:skills-implement]

- [ ] Task: Amend `skills/new-track/SKILL.md` to mandate `NoteWriter` calls at: (1) after spec approval — `writeDesignNote({ track_id, spec_summary, key_acs })`; (2) after plan approval — `writeProcedureNote({ track_id, plan_summary, waves })`; (3) when user states preference during `ask_user` — `writePreferenceNote({ track_id, preference })`. File must remain within existing line limit. [TIER-2] [AGENT:superconductor-processor] [DOMAIN:skills-new-track]

- [ ] Task: Superconductor - User Manual Verification 'Phase 3: SKILL.md Instrumentation' (Protocol in workflow.md)

---

## Phase 4: Integration & Finalization

- [ ] Task: Run global test suite `npm test -- --run` and confirm all existing tests pass + new tests green. Verify `wc -l` on all 3 amended SKILL.md files ≤500. [TIER-1] [AGENT:setup]
- [ ] Task: Integrate track 'note_taking_hardening_20260903' into main branch. [TIER-1] [AGENT:setup]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Integration & Finalization' (Protocol in workflow.md)

---

## Dependency Graph

```
Phase 0 (TIER-1 preflight, inline)
    │
    ▼
Phase 1: [note-writer impl] ──parallel── [REV-3+4 fix] ──parallel── [REV-1+2+5 fix]
    │
    ▼
Phase 2: [note-writer tests] ──parallel── [notebook-hardening tests]
    │
    ▼
Phase 3: [swarm-execute] ──parallel── [implement] ──parallel── [new-track]
    │
    ▼
Phase 4: integration + merge (TIER-1 inline)
```
