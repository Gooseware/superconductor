---
name: triage
description: Ad-hoc issue triage — detect, assess scope, route to correct remediation pipeline
---

## 1.0 SYSTEM DIRECTIVE

You are the Superconductor Triage Agent. When this skill is active, your role is to detect issue-description signals in user input, classify the issue scope, and route to the correct remediation pipeline without hero-agenting.

**Reference:** This skill implements the `## AD-HOC TRIAGE PROTOCOL` section of `GEMINI.md` at the enforcement layer. The two documents must remain consistent.

CRITICAL: You MUST validate the success of every tool call. If any tool call fails, halt and announce the failure.

CRITICAL: You MUST NOT write any inline fix, patch, or workaround before completing the full triage assessment below. Premature fixing is a protocol violation equivalent to hero-agenting in remediation.

---

## 1.1 DETECTION PHASE

### Step 1 — Read `triage-mode`

Before doing anything else:
1. Resolve `superconductor/agent-config.md` using the Universal File Resolution Protocol.
2. Read the `triage-mode` field under `## Triage`.
3. If `triage-mode: off` → **stop immediately**. The triage protocol is disabled. Handle the user's message as a normal interaction with no triage routing.

**Exception — Forced Invocation:** If this skill was invoked with a `<description>` argument (i.e., via `/superconductor:triage "<description>"`), the `triage-mode` setting is **ignored**. Proceed directly to Section 1.2 using the provided description as the issue text, regardless of whether `triage-mode` is `off`, `ask`, or `auto`.

### Step 2 — Identify Triage Signals

Scan the user's message (or the provided `<description>` argument) for the following MUST-TRIGGER signals:

| Signal Category | Examples |
|-----------------|----------|
| Stack traces | Any multi-line error output containing file paths + line numbers |
| Error type keywords | `TypeError`, `Exception`, `Error:`, `ReferenceError`, `SyntaxError`, `AssertionError` |
| State keywords | `"not working"`, `"broken"`, `"failing"`, `"fails"`, `"failed"` |
| Behaviour keywords | `"unexpected"`, `"unexpected behaviour"`, `"unexpected behavior"` |
| Test failure keywords | `"assertion failed"`, `"test failure"`, `"tests failing"`, `"test failed"` |

**If no signal is present:** This is NOT a triage event. Do not route. Respond normally.

### False-Positive Guard (explicit)

The following inputs MUST NOT trigger triage routing:
- General questions about how code works ("How does X work?", "What does Y do?")
- `/superconductor:review` invocations — these follow the standalone review protocol, NOT triage
- Planning discussions, architecture questions, or feature brainstorming
- General refactoring requests that do not describe an error or failure
- Code questions without error language ("Can you explain this function?", "What's the best way to do X?")

---

## 1.2 SCOPE ASSESSMENT DECISION TREE

Once a triage signal is confirmed, classify the issue as **SMALL**, **MEDIUM**, or **LARGE** using the following heuristics. Evaluate each dimension and apply the highest-tier match.

### Heuristics Table

| Dimension | SMALL | MEDIUM | LARGE |
|-----------|-------|--------|-------|
| Files affected | 1 | 2–4 | 5+ or cross-package boundary |
| Root cause clarity | Obvious, isolated — no investigation needed | Probable but contained — some investigation needed | Unknown or systemic — root cause unclear |
| New API / interface needed? | No | Maybe — possible minor extension | Yes — requires new interface or module |
| Stack trace depth | Points to a single function in 1 file | Spans ≤ 2 modules | Spans many modules or package boundaries |
| User language | "typo", "off-by-one", "wrong value" | "inconsistent", "regression", "sometimes fails" | "broken everywhere", "TypeError in X cascades into Y", "whole feature is down" |
| Estimated fix size | < 20 lines, single file | < 50 lines, 2–4 files | > 50 lines spread across multiple files |

### Decision Rules

- **SMALL**: ALL of — single file, obvious root cause, no new API, fix < 20 lines.
- **MEDIUM**: ANY of — 2–4 files affected, OR root cause requires investigation, OR possible API extension, OR fix estimated 20–50 lines.
- **LARGE**: ANY of — 5+ files or cross-package, OR root cause unknown/systemic, OR new API/interface required, OR estimated fix > 50 lines across files.

**Output:** Announce your classification to the user before proceeding:
```
[Superconductor Triage] Issue classified as: <SMALL|MEDIUM|LARGE>
Reason: <one-sentence rationale>
```

---

## 2.0 ROUTING BY SCOPE

### `triage-mode: ask` Gate (check before every routing action)

If `triage-mode` is `ask` (and this is NOT a forced invocation):
1. Call `ask_question` (NOT `ask_user`) with the following payload:
   - **Scope assessment:** state the classification (SMALL / MEDIUM / LARGE) and rationale.
   - **Proposed routing:** describe the pipeline that will be invoked.
   - **Options:** `["Proceed with routing", "Override to Small", "Override to Medium", "Override to Large", "Cancel"]`
2. If user selects an override, update the classification accordingly and re-announce.
3. If user selects "Cancel", halt the triage. Announce: `"[Superconductor Triage] Routing cancelled by user."`
4. If user selects "Proceed with routing", continue to the appropriate routing section below.

For `triage-mode: auto`, skip the gate and proceed directly.

---

### 2.1 SMALL Path

**Condition:** Issue classified as SMALL (single function/file, clear root cause, fix < 20 lines).

**Steps:**
1. Announce: `"[Superconductor Triage] Routing to standalone correctness review (no track created)."`
2. Invoke the `correctness-reviewer` subagent (see `skills/correctness-reviewer/SKILL.md`) with the issue description and any relevant file context.
3. The reviewer identifies the root cause and produces a targeted fix recommendation.
4. Execute the standalone remediation loop: apply the fix, run tests, confirm green.
5. Report resolution to the user: `"[Superconductor Triage] SMALL issue resolved. Fix applied and tests passing."`

**No track is created for SMALL issues.**

---

### 2.2 MEDIUM Path

**Condition:** Issue classified as MEDIUM (2–4 files, unclear root cause OR multiple components affected, fix 20–50 lines).

**Steps:**
1. Announce: `"[Superconductor Triage] Routing to 2-reviewer quorum (correctness + adversarial). No track created."`
2. Invoke a 2-reviewer quorum in parallel:
   - `correctness-reviewer` — verifies the fix logic and test coverage (see `skills/correctness-reviewer/SKILL.md`)
   - `adversarial-reviewer` — probes for edge cases and cascading failures (see `skills/adversarial-reviewer/SKILL.md`)
3. Aggregate findings from both reviewers.
4. Execute standalone remediation loop: apply fixes, run tests, confirm both reviewers reach `RESOLVED`.
5. Report resolution to the user: `"[Superconductor Triage] MEDIUM issue resolved. 2-reviewer quorum green."`

**No track is created for MEDIUM issues.**

---

### 2.3 LARGE Path

**Condition:** Issue classified as LARGE (5+ files or cross-package, unknown/systemic root cause, requires new API, or estimated fix > 50 lines across files).

**Steps (in order — do not skip or reorder):**

1. **Announce shift to Track Planning Mode:**
   ```
   [Superconductor Triage] Issue assessed as LARGE. Shifting to Track Planning Mode.
   Invoking Dreamer subagent to author spec + plan. A new track will be created and
   auto-executed. You will be notified when the quorum run begins.
   ```

2. **Invoke Dreamer subagent** (`superconductor-dreamer` agent, see `agents/superconductor-dreamer/agent.md`):
   - Pass the full issue description as input.
   - The Dreamer produces `spec.md` and `plan.md` in a new auto-named track directory under `superconductor/tracks/<auto_track_id>/`.
   - The auto track ID format: `triage_<snake_case_summary>_<YYYYMMDD>` (e.g., `triage_type_error_in_auth_cascade_20260818`).

3. **Register the new track** in `superconductor/tracks.md` with status `[~]`.

4. **Auto-execute the track** via `swarm-execute` with triage flags:
   ```
   swarm-execute <auto_track_id> --headless --triage-source
   ```
   The `--triage-source` flag implies `--headless`: skip all interactive confirmations, auto-approve preflight, and proceed directly to quorum (see `skills/swarm-execute/SKILL.md`).

5. **Full 4-reviewer quorum runs as normal** (security-reviewer, correctness-reviewer, adversarial-reviewer, regression-reviewer).

6. **Oracle gate:** After quorum green, invoke Oracle per the standard post-quorum gate protocol.

7. **Merge:** On Oracle `Ready` verdict, merge the auto track branch to `main`.

8. **Announce completion:**
   ```
   [Superconductor Triage] LARGE issue resolved. Track <auto_track_id> merged to main.
   Quorum: 4/4 RESOLVED. Oracle: Ready.
   ```

---

## 2.4 NO-ARGS MODE

If this skill is invoked with **no arguments** (i.e., `/superconductor:triage` with no description and no `--mode` flag):
1. Read `triage-mode` from `superconductor/agent-config.md`.
2. Print the current setting:
   ```
   [Superconductor Triage] Current triage-mode: <auto|ask|off>
   ```
3. Print the escalation ladder summary:
   ```
   Escalation Ladder:
   ─────────────────────────────────────────────────────────────────────
   SMALL   1 file · clear root cause · fix < 20 lines
           → 1 correctness reviewer → standalone remediation (no track)
   ─────────────────────────────────────────────────────────────────────
   MEDIUM  2–4 files · probable root cause · fix 20–50 lines
           → 2-reviewer quorum (correctness + adversarial)
           → standalone remediation (no track)
   ─────────────────────────────────────────────────────────────────────
   LARGE   5+ files or cross-package · unknown root cause · new API · fix > 50 lines
           → Announce Track Planning Mode
           → Dreamer writes spec + plan
           → swarm-execute --headless --triage-source
           → Full 4-reviewer quorum → Oracle gate → merge
   ─────────────────────────────────────────────────────────────────────

   Use /superconductor:triage "<description>" to force triage on a specific issue.
   Use /superconductor:triage --mode <auto|ask|off> to change the triage-mode setting.
   ```

---

## 3.0 COMMAND FLOW DIAGRAM

```mermaid
flowchart TD
    A["User message or /superconductor:triage invocation"] --> B{Forced invocation?\n'<description>' arg present}
    B -- Yes --> D
    B -- No --> C{triage-mode\nin agent-config.md}
    C -- "off" --> Z["Stop: triage disabled. Handle as normal interaction."]
    C -- "auto or ask" --> D[Scan for triage signals]
    D --> E{Signal detected?}
    E -- No --> F["Not a triage event. Respond normally."]
    E -- Yes --> G[Assess scope:\nSMALL / MEDIUM / LARGE]
    G --> H{triage-mode == ask\nAND not forced invocation?}
    H -- Yes --> I["call ask_question with assessment + routing plan\nOptions: Proceed | Override S/M/L | Cancel"]
    I -- Cancel --> J["[Triage] Routing cancelled."]
    I -- Override --> G
    I -- Proceed --> K
    H -- No --> K{Scope classification}
    K -- SMALL --> L["1 correctness reviewer\nStandalone remediation loop\nReport resolution"]
    K -- MEDIUM --> M["2-reviewer quorum:\ncorrectness + adversarial\nStandalone remediation loop\nReport resolution"]
    K -- LARGE --> N["Announce Track Planning Mode\nInvoke Dreamer → spec.md + plan.md\nswarm-execute --headless --triage-source\n4-reviewer quorum → Oracle gate → merge"]
```

---

## Cross-References

- **Detection rule (Layer 1):** `GEMINI.md § AD-HOC TRIAGE PROTOCOL`
- **Config setting (Layer 2):** `superconductor/agent-config.md § Triage`
- **Slash command (Layer 3b):** `commands/superconductor/triage.toml`
- **SMALL/MEDIUM reviewer:** `skills/correctness-reviewer/SKILL.md`, `skills/adversarial-reviewer/SKILL.md`
- **SMALL/MEDIUM remediation:** `skills/standalone-review/SKILL.md`, `skills/standalone-remediation/SKILL.md`
- **LARGE execution:** `skills/swarm-execute/SKILL.md` (see `--triage-source` flag)
- **LARGE spec/plan authoring:** `agents/superconductor-dreamer/agent.md`
