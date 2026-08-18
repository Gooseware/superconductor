# Specification: Ad-Hoc Triage Mode
**Track ID:** `ad_hoc_triage_mode_20260818`
**Type:** Feature
**Created:** 2026-08-18
**Status:** Planned

---

## Overview

When a user describes a bug, error, test failure, or unexpected behaviour in a Superconductor project, the agent currently has no systematic routing rule — it may attempt a direct, hero-agented fix. This track introduces an **Ad-Hoc Triage Protocol** that automatically detects issue-description context and routes through the correct remediation pipeline based on issue complexity. It acts as a first-class preventive guardrail against hero-agenting on bugs.

The feature is implemented entirely as **skill + docs work**: no TypeScript source files are written. The protocol is enforced via three complementary priming layers (GEMINI.md rule, agent-config.md setting, and a new `/superconductor:triage` slash command).

---

## Problem Statement

Without explicit routing rules, agents respond to bug reports by writing inline fixes — bypassing quorum, bypassing the Dreamer, and potentially compounding bugs. The risk is highest on Large issues (cross-package, unclear root cause, requires new API) where a hero-agent fix creates technical debt and breaks the Superconductor invariant: *"No direct fix without quorum."*

---

## Scope Heuristics (the Triage Decision)

| Signal | Small | Medium | Large |
|--------|-------|--------|-------|
| Files affected | 1 | 2–4 | 5+ or cross-package |
| Root cause clarity | Obvious, isolated | Probable, contained | Unknown, systemic |
| New API needed? | No | Maybe | Yes |
| Stack trace present? | Points to single fn | Spans ≤2 modules | Spans many modules |
| User says... | "typo", "off-by-one" | "inconsistent", "regression" | "broken everywhere", "TypeError in X cascades into Y" |

> [!IMPORTANT]
> Detection signals that MUST trigger triage routing: stack traces, `TypeError`, `Exception`, `Error:`, `not working`, `broken`, `failing`, `unexpected`, `assertion failed`, `test failure`. A question about how code works is NOT a triage signal.

---

## Escalation Ladder

```
SMALL  → 1 correctness reviewer → standalone remediation loop (inline, no track)
MEDIUM → 2-reviewer quorum (correctness + adversarial) → standalone remediation loop
LARGE  → Announce track planning mode → Dreamer writes spec+plan → swarm-execute → full 4-reviewer quorum → merge
```

### `triage-mode` Setting Behaviour

| Setting | Behaviour |
|---------|-----------|
| `auto` (default) | Detect and route silently — announce routing decision before acting |
| `ask` | Detect, then `ask_question` to confirm routing before dispatching |
| `off` | Disable the entire protocol — agent behaves as if triage layer is absent |

---

## Functional Requirements

### FR1 — GEMINI.md Rule (Layer 1)
A new `## AD-HOC TRIAGE PROTOCOL` section must be appended to `GEMINI.md`. It must:
- Define the always-on detection and routing rule
- Reference scope heuristics (Small / Medium / Large)
- Specify that `triage-mode: off` in `agent-config.md` disables the protocol
- Be carefully worded to avoid false positives (only bug/error language triggers, not general questions)

### FR2 — `agent-config.md` Setting (Layer 2)
A `triage-mode` field must be added to `superconductor/agent-config.md` under a new `## Triage` section:
- Default value: `auto`
- Valid values: `auto` | `ask` | `off`
- Brief inline documentation for each value

### FR3 — Triage Skill (Layer 3a)
`skills/triage/SKILL.md` must document the full orchestration protocol:
- Triage signal detection algorithm
- Scope assessment decision tree (Small / Medium / Large)
- Per-scope routing instructions
- `triage-mode: ask` branch: use `ask_question` before routing
- Large-issue Dreamer→swarm-execute flow, including how it announces the track shift
- Explicit anti-hero-agenting rule: agent MUST NOT self-fix before completing triage assessment

### FR4 — Triage Slash Command (Layer 3b)
`commands/superconductor/triage.toml` must:
- With **no args**: print current `triage-mode` setting and explain the escalation ladder
- With **`--mode <auto|ask|off>`**: update `agent-config.md` and confirm the change
- With **`"<description>"`**: immediately force triage protocol on the given issue text, regardless of the `triage-mode` setting in `agent-config.md`

### FR5 — Skill Cross-References
`skills/implement/SKILL.md` and `skills/swarm-execute/SKILL.md` must each receive a note (appended or inserted at the top of their Detection Signals or relevant section) clarifying that large ad-hoc issues detected via the triage protocol can trigger track auto-execution, and that when this happens the skill receives a `--headless` + `--triage-source` flag.

---

## Non-Functional Requirements

- **NFR1 — False-positive resistance:** The GEMINI.md rule must explicitly enumerate triage-triggering signals and must state that general code questions do NOT trigger routing.
- **NFR2 — Zero TypeScript:** This track introduces no compiled source changes. All deliverables are Markdown and TOML.
- **NFR3 — Idempotent config update:** The `--mode` command must be safe to run multiple times. It should read → patch → write `agent-config.md` without duplication.
- **NFR4 — Graceful Large-to-Track transition:** The triage skill must announce the shift to track planning mode with a clear user-facing message before invoking the Dreamer, so the user is never surprised by a new track appearing.

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC1 | `GEMINI.md` contains `## AD-HOC TRIAGE PROTOCOL` section with correct scope heuristics and triage signal list |
| AC2 | `superconductor/agent-config.md` has `triage-mode: auto` as default; `off` disables protocol; `ask` adds confirmation step |
| AC3 | `skills/triage/SKILL.md` exists and documents the full escalation ladder with Small / Medium / Large branches |
| AC4 | `commands/superconductor/triage.toml` exists with prompt instructions covering no-args, `--mode`, and description invocation modes |
| AC5 | Skill documents clear heuristics for distinguishing Small / Medium / Large via scope signals |
| AC6 | Large issues trigger the Dreamer → swarm-execute auto-execution flow (documented in skill with user-facing announcement) |
| AC7 | The `--mode` flag correctly updates `superconductor/agent-config.md` (documented and implemented in command prompt) |
| AC8 | Invoking `/superconductor:triage "<description>"` forces triage regardless of the current `triage-mode` setting |

---

## Out of Scope

- No TypeScript source code changes
- No changes to quorum FSM or swarm orchestration engine
- No changes to `skills/models/SKILL.md`
- No UI / design-system changes
- Triage history logging / audit trail (future track)
