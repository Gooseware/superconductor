# Track Specification: Superconductor Protocol Enforcement

**Track ID:** `protocol_enforcement_20260811`
**Type:** Hardening / Protocol Enforcement
**Status:** `[ ]` Planned
**Source:** Forensic post-mortem of session `89527497-a0ad-44a3-8a68-8b718cda4d02`
**Researchers:** 3× Flash 3.6 domain specialists + 1× Pro 3.1 root cause analyst
**Companion Track:** `protocol_hardening_20260809` (built the tools; this track wires them in)

---

## Problem Statement

The `protocol_hardening_20260809` track built 7 enforcement classes (`QuorumValidator`, `WorkspaceGuard`, `WorktreeIsolationManager`, `CheckpointOrchestrator`, `ModelRoutingEnforcer`, `DomainSplitRemediationDispatcher`, `TestTheatreDetector`). Session `89527497` ran after that track merged and **still exhibited all 5 of the target failure surfaces** — because the classes were built but never wired into the agent decision path.

This is the wiring track. No new classes needed. The problem is documentation, skill file text, export plumbing, and CLI integration.

---

## Failure Surfaces Addressed

### FS-1: Pipeline Inversion — Oracle Before Quorum

**Root cause (codebase evidence):**
- `swarm-orchestrate/SKILL.md` Pipeline Mode §4.2 explicitly fires the Oracle concurrently every 3 tasks *before* quorum is achieved: `"Every oracleCadence tasks (default: 3), the Oracle agent fires concurrently alongside Processor N and Reviewer N-1."` — this is an **anti-pattern written into the protocol**.
- `QuorumValidator.gateOracle()` has **zero call sites** in any skill file, workflow, or runtime code. It exists only in unit tests.
- `workflow.md` describes Oracle as a "Track Cleanup" activity — decoupled from quorum with no sequencing gate.

### FS-2: Polling Loop / Busy-Waiting (49-min stall + 81-min hung task)

**Root cause (codebase evidence):**
- No prohibition on calling `manage_subagents list` in a loop exists anywhere in Superconductor-specific docs (`workflow.md`, `GEMINI.md`, skill files). Only the base system prompt says "don't poll" — which agents ignore under context pressure.
- `BackgroundTaskMonitor` class does not exist. No mechanism detects hung tasks producing interactive prompts (`Press Ctrl+C to quit`, stdin waits).
- No timeout-with-escalation pattern enforced for background tasks.

### FS-3: Hero-Agenting — Orchestrator Self-Fixes After Quorum NEEDS_FIXES

**Root cause (codebase evidence):**
- `workflow.md` says "auto-remediate up to 2 times" — no mention of `DomainSplitRemediationDispatcher`, no prohibition on self-fixing.
- `DomainSplitRemediationDispatcher` is mentioned in `standalone-review/SKILL.md §9.2` but **absent from `workflow.md`** entirely.
- GEMINI.md guardrail covers `packages/*/src/**` writes but does NOT cover orchestrator self-remediation via bash/edit during the quorum loop.
- No rule prohibits the root agent from calling `run_command` or `write_to_file` when quorum returns NEEDS_FIXES.

### FS-4: No Oracle Post-Quorum-Green

**Root cause (codebase evidence):**
- `implement/SKILL.md` flow diagram implies correct order (Swarm → Oracle → Merge) but has no gate text.
- Oracle is documented as "prompted during Track Cleanup" — optional and manual, not automatic.
- No mandatory hook forces Oracle to run after `quorumPassed === true`.

### FS-5: SwarmAuthorizer Trailer Missing on Merge

**Root cause (codebase evidence):**
- `SwarmAuthorizer` class is implemented in `packages/superconductor-core/src/track/swarm-authorizer.ts` but **not exported** from `packages/superconductor-core/src/track/index.ts`.
- `WorkspaceGuard.commitToMain({ trailerPresent })` is implemented but **only referenced in unit tests** — never called by the merge CLI, workflow, or git hooks.
- `scripts/hooks/commit-msg` uses a weak bash string match for `"Swarm-Authorized: true"` rather than calling `SwarmAuthorizer.validateTrailer()`.

---

## Functional Requirements

### FR-1: Fix Pipeline Mode Oracle Anti-Pattern in `swarm-orchestrate/SKILL.md`

Remove the concurrent per-cadence Oracle from Pipeline Mode §4.2. Replace with:
- Periodic Oracle in pipeline mode becomes **Advisory Only** — it may run concurrently but its verdict MUST NOT be used as a gate. The gate Oracle runs once after quorum-green.
- Add explicit text: `"The Pipeline Mode periodic Oracle is advisory only. It does NOT satisfy the mandatory post-quorum Oracle gate. After quorum reaches unanimous RESOLVED, a dedicated gate Oracle MUST run with full diff context before merge."`

### FR-2: Wire `QuorumValidator.gateOracle()` into `workflow.md` and Skill Text

Update `workflow.md` Commit Gate section to include:
```
HARD GATE: Before invoking the Oracle, the orchestrator MUST call QuorumValidator.gateOracle({ quorumPassed }) (packages/superconductor-core/src/orchestration/quorum-validator.ts). If quorumPassed is false, Oracle MUST NOT be invoked. Any Oracle verdict obtained before quorum-green is VOID and MUST be discarded.
```

Update `implement/SKILL.md` §6.0 Oracle Code Review Loop to add the same gate as a precondition check (step 0: verify quorum state before proceeding).

### FR-3: Add No-Polling Rule to Superconductor Protocol Docs

Add a dedicated **§ Anti-Patterns** section to `workflow.md` containing:

```
### Anti-Pattern: Polling Loop (PROHIBITED)
Calling manage_subagents(action="list") or manage_task(action="status") in a loop is PROHIBITED.
After spawning subagents or background tasks, the orchestrator MUST stop calling tools.
The system delivers messages reactively. Polling prevents delivery.
Maximum 1 status check per subagent per turn, then STOP.
```

Add the same rule to `GEMINI.md` SWARM GUARDRAILS section.

### FR-4: Implement `BackgroundTaskMonitor`

New class: `packages/superconductor-core/src/orchestration/background-task-monitor.ts`

Responsibilities:
- `launch(cmd, opts)` — wraps `run_command`, starts a timeout timer
- `detectHungOutput(output: string)` — scans stdout/stderr for interactive prompt patterns: `Press Ctrl+C`, `press any key`, `waiting for input`, `[Y/n]`, `[y/N]`
- `kill(taskId)` — issues kill command
- `TimeoutError` thrown when task exceeds `maxDurationMs` (default: 1800000ms / 30min)
- `HungTaskError` thrown when `detectHungOutput` matches
- Integrates with `ShellRunner` interface (injectable for tests)

Mandatory integration: workflow.md §7 "Background Task Protocol" must reference `BackgroundTaskMonitor` as required wrapper for all `run_command` background launches during track execution.

### FR-5: Mandate `DomainSplitRemediationDispatcher` in `workflow.md`

Add a dedicated **§ Post-Quorum Remediation Protocol** to `workflow.md`:

```
### Post-Quorum Remediation Protocol (MANDATORY)

When any quorum reviewer returns NEEDS_FIXES:
1. Collect ALL findings from ALL 4 reviewers into a single findings list.
2. MUST dispatch remediation via DomainSplitRemediationDispatcher (packages/superconductor-core/src/remediation/domain-split-remediation-dispatcher.ts).
3. MUST NOT self-fix: the root orchestrator agent MUST NOT call write_to_file, multi_replace_file_content, replace_file_content, or run_command to fix findings directly.
4. MUST NOT spawn a single monolithic remediator agent.
5. Each remediator agent MUST have a singular focused task (one domain, one file, one concern).
6. After ALL remediators complete, MUST re-run full 4-reviewer quorum.
7. Repeat until quorum is unanimous green.
```

Add the self-fix prohibition to GEMINI.md SWARM GUARDRAILS alongside the existing package write guardrail.

### FR-6: Export `SwarmAuthorizer` and Wire `WorkspaceGuard.commitToMain()`

**Export fix:**
Add `export * from './swarm-authorizer.js';` to `packages/superconductor-core/src/track/index.ts`.

**Merge flow wiring:**
Update the Superconductor merge CLI (`packages/superconductor-core/src/cli/merge.ts` or equivalent) to:
1. Call `SwarmAuthorizer.generateTrailer(reviewerConvIds)` 
2. Pass result to `WorkspaceGuard.commitToMain({ trailerPresent: true })`
3. Throw `UnauthorizedMergeError` if trailer is missing

**Commit hook strengthening:**
Update `scripts/hooks/commit-msg` to call `node -e "require('./packages/superconductor-core/dist/track/swarm-authorizer.js').SwarmAuthorizer.validateTrailer(msg)"` instead of bash string match.

---

## Acceptance Criteria

### Pipeline Gate (FS-1, FS-4)
- **AC-1:** `workflow.md` Commit Gate section contains the exact text: `"HARD GATE: Before invoking the Oracle, the orchestrator MUST call QuorumValidator.gateOracle({ quorumPassed })"`
- **AC-2:** `swarm-orchestrate/SKILL.md` Pipeline Mode §4.2 no longer gates on periodic Oracle verdicts — labelled "Advisory Only"
- **AC-3:** `implement/SKILL.md` §6.0 contains a pre-condition check step: "Verify quorum state. If `quorumPassed !== true`, HALT and return to quorum loop."
- **AC-4:** `QuorumValidator.gateOracle()` is referenced by name in at least `workflow.md` and `implement/SKILL.md`

### No-Polling Rule (FS-2)
- **AC-5:** `workflow.md` contains a `### Anti-Patterns` section with the polling prohibition
- **AC-6:** `GEMINI.md` SWARM GUARDRAILS section contains the polling prohibition
- **AC-7:** `BackgroundTaskMonitor.detectHungOutput("Press Ctrl+C to quit")` returns `true`
- **AC-8:** `BackgroundTaskMonitor.launch(cmd, { maxDurationMs: 100 })` throws `TimeoutError` after expiry
- **AC-9:** `BackgroundTaskMonitor` tests pass with >85% coverage

### Flash Mob Remediation Mandate (FS-3)
- **AC-10:** `workflow.md` contains a `### Post-Quorum Remediation Protocol` section with explicit `MUST NOT self-fix` language
- **AC-11:** `GEMINI.md` SWARM GUARDRAILS contains: `"When quorum returns NEEDS_FIXES, the root agent MUST NOT self-fix. MUST dispatch DomainSplitRemediationDispatcher."`
- **AC-12:** `standalone-review/SKILL.md` remediation section references `DomainSplitRemediationDispatcher` with MUST language

### SwarmAuthorizer Wiring (FS-5)
- **AC-13:** `packages/superconductor-core/src/track/index.ts` exports `SwarmAuthorizer`
- **AC-14:** `SwarmAuthorizer` is importable from `superconductor-core` package root
- **AC-15:** `scripts/hooks/commit-msg` calls `SwarmAuthorizer.validateTrailer()` (not bash string match)
- **AC-16:** Merge flow calls `WorkspaceGuard.commitToMain({ trailerPresent })` and throws `UnauthorizedMergeError` if missing

---

## Out of Scope

- New enforcement classes (built in `protocol_hardening_20260809`)
- Changes to quorum reviewer logic
- Changes to worktree isolation (already correct)
- Frontend / UI changes
