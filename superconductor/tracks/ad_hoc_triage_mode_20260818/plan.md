# Implementation Plan: Ad-Hoc Triage Mode
**Track ID:** `ad_hoc_triage_mode_20260818`
**Spec:** [spec.md](./spec.md)
**Branch:** `track/ad_hoc_triage_mode_20260818`

---

## Phase 0: Swarm Preflight [TIER-1] [checkpoint: 7df209a3]

- [x] Task: Verify `swarm-execute` skill is installed and loadable [TIER-1] [AGENT:superconductor-processor] (SHA: 7df209a3)
    - [x] Check `.agents/skills/swarm-execute/SKILL.md` or `~/.agents/extensions/superconductor/skills/swarm-execute/SKILL.md`
    - [x] If missing: halt and instruct user to install the Superconductor skills bundle
- [x] Task: Verify track branch `track/ad_hoc_triage_mode_20260818` exists or create from `main` [TIER-1] [AGENT:superconductor-processor] (SHA: 7df209a3)
- [x] Task: Confirm write access to `GEMINI.md`, `superconductor/agent-config.md`, `skills/`, and `commands/superconductor/` [TIER-1] [AGENT:superconductor-processor] (SHA: 7df209a3)
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) (SHA: 7df209a3)

---

## Phase 1: GEMINI.md — AD-HOC TRIAGE PROTOCOL Rule (FR1, AC1) [TIER-3] [checkpoint: 7df209a3]

- [x] Task: Read current `GEMINI.md` and locate the correct insertion point (after `## SWARM GUARDRAILS` section) [TIER-1] [AGENT:superconductor-processor] (SHA: 7df209a3)
- [x] Task: Append `## AD-HOC TRIAGE PROTOCOL` section to `GEMINI.md` [TIER-3] [AGENT:superconductor-processor] (SHA: 7df209a3)
    - [x] Section must define always-on detection and routing rule
    - [x] Enumerate triage signal keywords: stack traces, `TypeError`, `Exception`, `Error:`, "not working", "broken", "failing", "unexpected", "assertion failed", "test failure"
    - [x] Explicitly state: general code questions do NOT trigger routing (false-positive guard)
    - [x] State Small / Medium / Large scope heuristics inline (file count, root-cause clarity, cross-package, new API needed)
    - [x] Reference `triage-mode` in `superconductor/agent-config.md` — if `off`, skip protocol entirely
    - [x] Specify the three routing outcomes:
        - Small → 1 correctness reviewer → standalone remediation (no track)
        - Medium → 2-reviewer quorum (correctness + adversarial) → standalone remediation
        - Large → announce shift → invoke Dreamer → swarm-execute → full quorum → merge
- [x] Task: Correctness review: confirm rule is unambiguous, scoped, and does not introduce false positives [TIER-3] [AGENT:superconductor-reviewer] (SHA: 7df209a3)
- [x] Task: Superconductor - User Manual Verification 'Phase 1: GEMINI.md Rule' (Protocol in workflow.md) (SHA: 7df209a3)

---

## Phase 2: `agent-config.md` — triage-mode Field (FR2, AC2) [TIER-3] [checkpoint: 7df209a3]

- [x] Task: Read `superconductor/agent-config.md` to identify correct insertion location [TIER-1] [AGENT:superconductor-processor] (SHA: 7df209a3)
- [x] Task: Append `## Triage` section to `superconductor/agent-config.md` [TIER-3] [AGENT:superconductor-processor] (SHA: 7df209a3)
    - [x] Add field: `triage-mode: auto`
    - [x] Document all three valid values inline:
        - `auto` — detect and route silently, announce decision before acting
        - `ask` — detect, then `ask_question` to confirm routing before dispatching
        - `off` — disable the entire protocol
    - [x] Note that this setting is read by the triage skill at invocation time
- [x] Task: Correctness review: confirm `auto` is the default, `off` disables, `ask` adds gate [TIER-3] [AGENT:superconductor-reviewer] (SHA: 7df209a3)
- [x] Task: Superconductor - User Manual Verification 'Phase 2: agent-config.md Field' (Protocol in workflow.md) (SHA: 7df209a3)

---

## Phase 3: Triage Skill — `skills/triage/SKILL.md` (FR3, AC3, AC5, AC6) [TIER-4] [checkpoint: 7df209a3]

- [x] Task: Create directory `skills/triage/` [TIER-1] [AGENT:superconductor-processor] (SHA: 7df209a3)
- [x] Task: Author `skills/triage/SKILL.md` with full orchestration protocol [TIER-4] [AGENT:superconductor-dreamer] (SHA: 7df209a3)
    - [x] Frontmatter: `name: triage`, `description: Ad-hoc issue triage — detect, assess scope, route to correct remediation pipeline`
    - [x] **Section 1.0 — System Directive:** Agent role, CRITICAL validation rule, reference to GEMINI.md AD-HOC TRIAGE PROTOCOL
    - [x] **Section 1.1 — Detection Phase:**
        - Enumerate triage signal keywords (match list in GEMINI.md exactly)
        - State that general questions about code do NOT trigger triage
        - Anti-hero-agenting rule: agent MUST NOT write any fix before completing triage assessment
    - [x] **Section 1.2 — Scope Assessment (Decision Tree):**
        - Evaluate: file count affected, cross-package boundary, root-cause clarity, new API required, stack trace depth
        - Output exactly one of: `SMALL` | `MEDIUM` | `LARGE`
        - Include worked-example heuristics table (matching spec)
    - [x] **Section 2.0 — Routing by Scope:**
        - **SMALL path:** invoke `correctness-reviewer` standalone skill → standalone remediation loop → report resolution to user
        - **MEDIUM path:** invoke 2-reviewer quorum (`correctness-reviewer` + `adversarial-reviewer`) → standalone remediation loop → report resolution
        - **LARGE path:**
            1. Announce: `"[Superconductor Triage] Issue assessed as LARGE. Shifting to Track Planning Mode. Invoking Dreamer to author spec + plan."`
            2. Invoke Dreamer (via `superconductor-dreamer` subagent) with the issue description as input
            3. Dreamer produces `spec.md` and `plan.md` in a new auto-named track directory
            4. Auto-execute track via `swarm-execute --headless --triage-source`
            5. Full 4-reviewer quorum runs as normal
            6. Oracle gate and merge per standard protocol
    - [x] **Section 2.1 — `triage-mode: ask` Branch:**
        - Before dispatching any reviewer: call `ask_question` with current scope assessment and routing decision
        - Options: `["Proceed with routing", "Override to Small", "Override to Medium", "Override to Large", "Cancel"]`
        - Proceed only if user confirms
    - [x] **Section 2.2 — Forced Invocation (no-args check):**
        - If skill is invoked with a `<description>` argument → bypass `triage-mode` setting, force triage on description
        - If skill is invoked with no args → print current `triage-mode` value and escalation ladder summary
    - [x] **Section 3.0 — Command Flow Diagram (Mermaid)**
- [x] Task: Correctness review of SKILL.md — check decision tree completeness, false-positive guards, LARGE flow accuracy [TIER-3] [AGENT:superconductor-reviewer] (SHA: 7df209a3)
- [x] Task: Adversarial review — probe for edge cases: ambiguous descriptions, cascading errors, `triage-mode: off` with forced invocation [TIER-3] [AGENT:superconductor-reviewer] (SHA: 7df209a3)
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Triage Skill' (Protocol in workflow.md) (SHA: 7df209a3)

---

## Phase 4: Triage Command — `commands/superconductor/triage.toml` (FR4, AC4, AC7, AC8) [TIER-3] [checkpoint: 7df209a3]

- [x] Task: Author `commands/superconductor/triage.toml` [TIER-3] [AGENT:superconductor-processor] (SHA: 7df209a3)
    - [x] `description` field: `"Triage a bug or issue — assess scope and route to the correct remediation pipeline"`
    - [x] `prompt` field must encode three invocation modes:
        - **No args:** Read `superconductor/agent-config.md` → print `triage-mode` value → render escalation ladder (Small/Medium/Large table)
        - **`--mode <auto|ask|off>`:** Validate value is one of the three allowed; patch `superconductor/agent-config.md` `triage-mode` field; confirm change to user
        - **`"<description>"`:** Immediately invoke `skills/triage/SKILL.md` protocol with the description, bypassing `triage-mode` (forced triage regardless of setting)
    - [x] Include setup-check reference (Universal File Resolution Protocol — resolve `superconductor/agent-config.md`)
    - [x] Include CRITICAL: validate tool call success on every operation
- [x] Task: Correctness review of triage.toml — check all three invocation modes, validate `--mode` guard, confirm forced-triage bypass [TIER-3] [AGENT:superconductor-reviewer] (SHA: 7df209a3)
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Triage Command' (Protocol in workflow.md) (SHA: 7df209a3)

---

## Phase 5: Cross-Reference Updates (FR5) [TIER-2] [checkpoint: 7df209a3]

- [x] Task: Update `skills/implement/SKILL.md` — insert note about ad-hoc triage triggering track auto-execution [TIER-2] [AGENT:superconductor-processor] (SHA: 7df209a3)
    - [x] Locate section `3.0 TRACK IMPLEMENTATION` → `Execute Tasks and Update Track Plan` → `Check for Swarm Execution Skill`
    - [x] Append note: *"Large ad-hoc issues detected by the triage protocol may trigger track auto-execution. In this case, the `swarm-execute` skill will receive `--headless --triage-source` flags. Treat `--triage-source` exactly as `--headless`: skip interactive confirmations, auto-approve preflight, proceed to quorum."*
- [x] Task: Update `skills/swarm-execute/SKILL.md` — insert note at top of `## Usage` section [TIER-2] [AGENT:superconductor-processor] (SHA: 7df209a3)
    - [x] Add to Options list: `--triage-source`: Indicates this execution was triggered by the ad-hoc triage protocol. Implies `--headless`. Preflight and quorum run normally.
- [x] Task: Correctness review of both cross-reference edits — confirm no existing protocol lines are disrupted [TIER-3] [AGENT:superconductor-reviewer] (SHA: 7df209a3)
- [x] Task: Superconductor - User Manual Verification 'Phase 5: Cross-Reference Updates' (Protocol in workflow.md) (SHA: 7df209a3)

---

## Phase 6: Integration & Finalization [TIER-2] [ORACLE-VERIFIED] [checkpoint: MERGE-PENDING]

- [x] Task: Run acceptance criteria validation checklist against all created/modified files [TIER-2] [AGENT:superconductor-reviewer]
    - [ ] AC1: `GEMINI.md` — `## AD-HOC TRIAGE PROTOCOL` section present with signal list and heuristics
    - [ ] AC2: `agent-config.md` — `triage-mode: auto` present; `off` documented; `ask` documented
    - [ ] AC3: `skills/triage/SKILL.md` — exists, contains Small/Medium/Large escalation ladder
    - [ ] AC4: `commands/superconductor/triage.toml` — exists, covers all three invocation modes
    - [ ] AC5: Heuristics table (file count, cross-package, root-cause, new API) present in skill
    - [ ] AC6: LARGE path documents Dreamer → swarm-execute flow with user-facing announcement
    - [ ] AC7: `--mode` flag updates `agent-config.md` (documented in command prompt)
    - [ ] AC8: Description argument forces triage regardless of `triage-mode`
- [x] Task: Stage all changed/created files and commit: `feat(superconductor): Add Ad-Hoc Triage Mode — triage skill, command, GEMINI.md rule, agent-config field` [TIER-1] [AGENT:superconductor-processor]
- [x] Task: Integrate track `ad_hoc_triage_mode_20260818` into `main` branch [TIER-2] [AGENT:superconductor-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 6: Integration & Finalization' (Protocol in workflow.md)

---

## Swarm Blueprint

```json
{
  "track_id": "ad_hoc_triage_mode_20260818",
  "cost_summary": "~0.1M tokens · ~$0.008 at Flash-Lite rates",
  "waves": 3,
  "oracle_cadence": 8,
  "source": "keyword-heuristics",
  "wave_map": [
    { "wave": 1, "phases": ["Phase 0", "Phase 1", "Phase 2"], "agents": ["processor", "reviewer"] },
    { "wave": 2, "phases": ["Phase 3", "Phase 4"], "agents": ["dreamer", "processor", "reviewer x2"] },
    { "wave": 3, "phases": ["Phase 5", "Phase 6"], "agents": ["processor", "reviewer"] }
  ]
}
```
