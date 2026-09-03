# Spec: Superconductor Note-Taking Hardening

**Track ID:** `note_taking_hardening_20260903`
**Type:** Feature + Hardening
**Author:** Root Orchestrator (session 7bbacdf2)
**Created:** 2026-09-03

---

## Overview

Superconductor agents currently make almost no use of the `notebook_write` MCP tool during track execution. Decisions, quorum findings, warnings, user preferences, and reusable code candidates are silently discarded at session end. This track hardens note-taking across the swarm lifecycle so the notebook becomes a continuously improving, project-wide intelligence layer.

The user's expanded vision: notes are not just audit logs — they are the mechanism by which Superconductor gets smarter over time. Future sessions inject notebook context at the top of specs (already implemented in `new-track` §2.0.2), code review findings accumulate as warnings, user preferences are remembered, and interesting code candidates are flagged for potential promotion to the Design OS registry.

---

## Architecture Committee Findings

### Dreamer (Architecture)
- Mandate `notebook_write` at 4 lifecycle phases: track init, mid-implementation pivots, pre-review handoff, post-review synthesis
- Introduce `NoteWriter` utility with typed methods per note type — enforces consistent format, mandatory fields, 2-sentence content constraint
- Individual writes per event (not batched) for failure resilience
- Map specific skill events to note types explicitly in SKILL.md prose

### Reviewer (Security & Performance) — 5 Pre-existing Findings

| ID | Severity | File | Issue |
|----|----------|------|-------|
| REV-1 | HIGH | `notebook-validator.ts:L93` | No sanitization — prompt injection via note content reflected into agent context |
| REV-2 | MEDIUM | `libsql-notebook-provider.ts:L241` | `notebook_summary` unpaginated — context blowout as notes accumulate |
| REV-3 | HIGH | `notebook-validator.ts:L40` | Rate-limit file not locked — TOCTOU race in parallel swarms |
| REV-4 | MEDIUM | `notebook-validator.ts:L118` | Rate limit incremented before dedup check — retries exhaust quota prematurely |
| REV-5 | MEDIUM | `NotebookService.ts:L54` | `track_id` optional, defaults to `'default-track'` — cross-track leakage |

These must be fixed in this track alongside the skill instrumentation.

---

## Oracle Proactive Planning Findings

- `NoteWriter` uses a single private `_write(type, content, options)` base + 7 thin typed wrappers
- Typed interfaces follow `agent-config-model-resolution.ts` export pattern (`NoteWriterOptions`, `NoteEntry`)
- Test fixtures reuse `fs.mkdtempSync` pattern from `agent-config-model-resolution.test.ts`
- REV-3 fix: new `rate_limits` SQLite table with atomic `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`
- `NoteWriter` error policy: swallow for `info/design/preference/style/procedure` notes (fire-and-forget); surface failures for `quorum`/`warning` notes (integrity-critical)

---

## Research Notes (Best Practices 2026)

- Individual event writes for failure resilience (not batched)
- Goldilocks injection: only inject pruned, relevant notes into future contexts — not all
- Multi-tenant isolation: scope by `track_id` to prevent cross-track contamination
- Structural isolation of injected notes (XML/semantic wrappers) to prevent prompt injection

---

## Functional Requirements

### FR-1 — NoteWriter Utility Module
- New module: `packages/superconductor-core/src/notebook/note-writer.ts`
- Exports typed methods: `writeDesignNote`, `writeWarningNote`, `writePreferenceNote`, `writeQuorumNote`, `writeProcedureNote`, `writeStyleNote`, `writeReusableCodeNote`
- Private `_write(type, content, options)` base handles boilerplate (track_id resolution, tagging, error policy)
- All methods enforce: `track_id` required, `content` ≤280 chars, content wrapped in `<notebook_entry>` tags
- Error policy: fire-and-forget for design/preference/style/procedure; surface errors for quorum/warning
- Exports typed interfaces: `NoteWriterOptions`, `NoteEntry`

### FR-2 — SKILL.md Instrumentation (3 skills)

**`swarm-execute/SKILL.md`** — mandate at:
- After each quorum reviewer verdict: `writeQuorumNote({ track_id, reviewer_role, verdict, findings_count })`
- After Oracle verdict: `writeDesignNote({ track_id, oracle_verdict, key_decisions })`
- After each remediator completes: `writeWarningNote({ track_id, finding_id, domain, fix_summary })`

**`implement/SKILL.md`** — mandate at:
- After plan approval: `writeDesignNote({ track_id, plan_summary })`
- After Oracle final verdict: `writeDesignNote({ track_id, oracle_verdict })`
- After track completion/merge: `writeProcedureNote({ track_id, outcome })`
- When user corrects agent behavior: `writePreferenceNote({ track_id, correction })`
- When user approves model choice: `writePreferenceNote({ track_id, model_role, chosen_model })`

**`new-track/SKILL.md`** — mandate at:
- After spec approval: `writeDesignNote({ track_id, spec_summary, key_acs })`
- After plan approval: `writeProcedureNote({ track_id, plan_summary, waves })`
- When user states preference during ask_user: `writePreferenceNote({ track_id, preference })`

### FR-3 — Reusable Code Detection
- After Phase Completion Verification, `NoteWriter.writeReusableCodeNote` called for Design OS registry candidates
- Note includes: file path, component name, rationale

### FR-4 — Notebook-Store Hardening (5 fixes)
- **REV-1:** Wrap content in `<notebook_entry>` tags on write; strip on retrieval
- **REV-2:** Add `limit: number` param to `notebook_summary`; default 20
- **REV-3:** SQLite atomic rate-limit via `INSERT ... ON CONFLICT DO UPDATE`
- **REV-4:** Dedup check before rate-limit increment
- **REV-5:** `track_id` required in MCP schema; remove `'default-track'` fallback

### FR-5 — Tests
- `note-writer.test.ts` — unit tests for all 7 typed methods
- `notebook-hardening.test.ts` — integration: rate-limit ordering, concurrency, track_id enforcement, summary pagination

---

## Non-Functional Requirements

- `NoteWriter` calls must not add >50ms latency (fire-and-forget acceptable for non-critical types)
- Notes must be ≤280 chars (enforced in NoteWriter before validator)
- All 7 note types must survive a parallel 4-agent swarm without duplicate notes

---

## Acceptance Criteria

- **AC-1:** `NoteWriter` module with 7 typed methods + private `_write` base exports correctly
- **AC-2:** `swarm-execute/SKILL.md` instructs `notebook_write` at quorum verdict, Oracle verdict, remediator completion
- **AC-3:** `implement/SKILL.md` instructs `notebook_write` at plan approval, Oracle verdict, track completion, user preference events
- **AC-4:** `new-track/SKILL.md` instructs `notebook_write` at spec approval, plan approval, user preference events
- **AC-5:** REV-1 fixed — note content wrapped in `<notebook_entry>` tags
- **AC-6:** REV-2 fixed — `notebook_summary` supports `limit` param, defaults to 20
- **AC-7:** REV-3 fixed — rate-limit stored atomically in SQLite
- **AC-8:** REV-4 fixed — dedup check runs before rate-limit increment
- **AC-9:** REV-5 fixed — `track_id` required in MCP schema
- **AC-10:** All new tests green; existing 41 root tests unaffected

---

## Out of Scope

- UI for browsing notebook entries
- Automatic note summarization / compaction (future track)
- Migration of historical notes from prior tracks
