# Specification: Orchestrator Hardening & Quorum Integrity

**Track ID:** `orchestrator_hardening_20260729`
**Type:** Chore / Infrastructure Hardening
**Status:** Draft

---

## Overview

Six confirmed systemic failures were identified through forensic analysis of conversation `3315ffa9` and the `superconductor_retro.md` incident report. These failures allowed the Superconductor orchestrator to bypass its own quorum enforcement, leak interactive questions into headless execution, permit the root agent to write directly to `src/` files, dispatch "User Manual Verification" tasks as real work units, and generate hallucinated audit retrospectives.

This track addresses all six issues in a single hardening pass, building real enforcement mechanisms rather than relying on text-only protocol guidance.

---

## Architecture Committee Recommendations

### Dreamer (Structural / Decoupling)
- Introduce `ReviewerResponseBroker` (`packages/engine/src/verification/reviewer-response-broker.ts`) to read structured `json:review-findings` blocks from reviewer QuorumStore files via file-watcher streaming, replacing the hardcoded `{ status: 'RESOLVED' }` stub in `orchestrate.ts`.
- Add `ExecutionMode` enum (`INTERACTIVE | HEADLESS | BATCH_OVERNIGHT`) and `HeadlessModeGuard` (`packages/engine/src/guard/headless-mode-guard.ts`) that intercepts tool-invocation decisions at the orchestrator boundary.
- Extend `WorkUnit` with `unitType: 'TASK' | 'VERIFY'` and update `parseAndDispatch()` to route `VERIFY` units through `HeadlessModeGuard` (auto-approved in headless, user-confirmed in interactive).
- Add `RetrospectiveGenerator` (`packages/engine/src/telemetry/retrospective-generator.ts`) that reads `transcript.jsonl` via streaming line reader, extracts verified execution events, and writes deterministic git notes — never from LLM memory.
- Wire `AgyAgentSpawner` to a config-file-backed spawner registry so it can be used programmatically without throwing on every call.

### Reviewer (Security & Performance)
- **Broker polling DoS risk:** Use file-watcher + byte-offset streaming (not full-file polling). Enforce per-reviewer timeout (30s default) with fail-closed: unresponsive reviewer = `FAILED`, not `RESOLVED`.
- **HeadlessModeGuard silent suppression risk:** Do NOT silently drop `ask_question`. Return explicit tool error to subagent; elevate FATAL/security prompts to `notify-send` + `stderr`.
- **QuorumStore path traversal:** Sanitize `trackId`/`wuId` with `/^[a-zA-Z0-9_-]+$/` before constructing any disk paths. Use `path.resolve()` boundary check to assert result stays within `.superconductor/`.
- **Transcript privacy:** Stream `transcript.jsonl` through a secret-redaction filter (API keys, GCP tokens) before any aggregation. Never load entire file into memory.

---

## Research Notes

### Headless vs Interactive Mode Detection
- Check `process.stdout.isTTY` + `process.env.CI` + `TERM === 'dumb'` for auto-detection.
- Expose an explicit `--headless` flag in the CLI that overrides auto-detection globally.
- On any required-input-in-headless violation: throw `NonInteractiveModeError` — fail-fast, never hang.

### Reviewer Feedback Loop Patterns
- Enforce strict Zod schema on reviewer output (`verdict: 'RESOLVED' | 'FAILED'`, `findings: Finding[]`).
- The `QuorumReviewLoop` must run `maxIterations: 3` with a wired `remediateFn` dispatching a remediation-processor subagent when findings are present.

### LLM Hallucination Prevention in Audit Reports
- Inject raw execution artifacts into prompts: `git log --stat`, test JSON output, process exit codes.
- Render hard metrics (commit SHA, test pass count, coverage %) programmatically — LLM only synthesizes qualitative summaries.
- Require retrospective LLM to cite specific `step_index` values from `transcript.jsonl`; validate citations post-generation.

### Agent Spawner Interface Patterns
- Define `IAgentSpawner` returning typed event streams (`on('message')`, `on('exit')`).
- Inject via constructor DI; implement `MockAgentSpawner` with scripted response queues for fast deterministic tests.

---

## Functional Requirements

### FR-1: Quorum Result Ingestion (`ReviewerResponseBroker`)
- **FR-1.1:** `ReviewerResponseBroker` MUST stream QuorumStore consensus files via `fs.watchFile` + byte-offset reads, not full-file polling.
- **FR-1.2:** It MUST extract and Zod-validate `json:review-findings` blocks from reviewer output files.
- **FR-1.3:** If a reviewer file has no findings block within its timeout, it MUST be treated as `FAILED` (fail-closed), never `RESOLVED`.
- **FR-1.4:** `orchestrate.ts` `reviewerFn` MUST be updated to call `ReviewerResponseBroker.aggregate(conversationIds)` and return the real consensus — removing the hardcoded `{ status: 'RESOLVED', findings: [] }`.
- **FR-1.5:** `QuorumReviewLoop` MUST be configured with `maxIterations: 3` and a real `remediateFn` dispatching a remediation-processor subagent when findings are present.

### FR-2: Headless Mode Guard
- **FR-2.1:** An `ExecutionMode` enum (`INTERACTIVE | HEADLESS | BATCH_OVERNIGHT`) MUST be defined.
- **FR-2.2:** `HeadlessModeGuard.assertInteractiveAllowed()` MUST throw `NonInteractiveModeError` when called in `HEADLESS` mode — blocking `ask_question` invocations.
- **FR-2.3:** On `NonInteractiveModeError` for a FATAL/security prompt, the guard MUST call `notify-send` and write to `stderr` before throwing.
- **FR-2.4:** `SwarmPermissionEvaluator` MUST detect headless mode (via `--headless` flag OR `process.env.CI`) and set `ExecutionMode.HEADLESS`.

### FR-3: Plan Parser Work Unit Tagging
- **FR-3.1:** `WorkUnit` MUST have `unitType: 'TASK' | 'VERIFY'`.
- **FR-3.2:** `parseAndDispatch()` MUST parse lines matching `Superconductor - User Manual Verification` as `VERIFY` units.
- **FR-3.3:** In `executeTrack()`, `VERIFY` units in `HEADLESS` mode MUST be auto-approved (transitioned to `DONE` with a `VERIFIED_HEADLESS` consensus artifact) without spawning any subagent.
- **FR-3.4:** In `INTERACTIVE` mode, `VERIFY` units MUST pause the orchestrator and surface the verification plan to the user before proceeding.

### FR-4: Root Agent Rogue Write Guard
- **FR-4.1:** A `RogueWriteGuard` class MUST be defined that, when enabled, throws `RogueWriteAttemptError` for any attempted write to `packages/*/src/**`, `app/**` from the root orchestrator context.
- **FR-4.2:** The guard MUST be activated via the `SUPERCONDUCTOR_ROLE=root` environment variable check (already available in `SwarmPermissionEvaluator`).
- **FR-4.3:** The error message MUST exactly match: `"[Superconductor] Rogue write attempt detected. Aborting. I must dispatch a Processor subagent instead."` (as documented in `GEMINI.md`).

### FR-5: AgyAgentSpawner Configuration
- **FR-5.1:** `AgyAgentSpawner` MUST read a `spawner-config.json` from the `.superconductor/` directory specifying the real spawner backend (`invoke_subagent` or `noop`).
- **FR-5.2:** When `spawner-config.json` is absent or backend is `noop`, it MUST log a warning and return a synthetic conversation ID rather than throwing.
- **FR-5.3:** The interface MUST be unit-testable via `MockAgentSpawner` with a scripted response queue.

### FR-6: Grounded Retrospective Generator
- **FR-6.1:** `RetrospectiveGenerator` MUST stream `transcript.jsonl` via `readline` — never loading the full file into memory.
- **FR-6.2:** It MUST apply secret-redaction (API keys, GCP tokens, SSH keys matching configurable regex) before any aggregation.
- **FR-6.3:** Retrospective findings MUST reference verified `step_index` values from the transcript; unverified finding IDs (hallucinated) MUST be rejected.
- **FR-6.4:** Hard metrics (commit SHA, test pass/fail counts, coverage %) MUST be sourced from `QuorumStore` disk artifacts and `git log`, not LLM memory.
- **FR-6.5:** The generated report MUST be attached as a `git notes` entry on the checkpoint commit, not only written to a markdown file.

---

## Non-Functional Requirements

- **NFR-1:** All new classes MUST have ≥ 85% test coverage via Vitest.
- **NFR-2:** `ReviewerResponseBroker` per-reviewer timeout MUST default to 30,000ms, configurable via constructor options.
- **NFR-3:** Zero new TypeScript compilation errors beyond the 3 pre-existing `@google/genai` stubs.
- **NFR-4:** All existing 383 `@superconductor/core` tests and engine tests MUST remain green.
- **NFR-5:** Path sanitization MUST be enforced on all `QuorumStore` inputs using `/^[a-zA-Z0-9_-]+$/` and `path.resolve()` boundary checks.

---

## Acceptance Criteria

- [ ] **AC-1:** A unit test proves that `orchestrate.ts` transitions a work unit to `FAILED` when a reviewer returns a CRITICAL finding — not `DONE`.
- [ ] **AC-2:** A unit test proves that `HeadlessModeGuard` throws `NonInteractiveModeError` when `ask_question` is attempted in `HEADLESS` mode.
- [ ] **AC-3:** A unit test proves that a `VERIFY`-type work unit is auto-approved with `VERIFIED_HEADLESS` in headless mode without spawning any subagent.
- [ ] **AC-4:** A unit test proves that `RogueWriteGuard` throws `RogueWriteAttemptError` with the exact error message from `GEMINI.md` when a root-role agent attempts to write to `packages/engine/src/`.
- [ ] **AC-5:** A unit test proves that `AgyAgentSpawner` with absent `spawner-config.json` logs a warning and returns a synthetic ID instead of throwing.
- [ ] **AC-6:** A unit test proves that `RetrospectiveGenerator` redacts `GEMINI_API_KEY` and `GCP_PROJECT_ID` values from transcript streams.
- [ ] **AC-7:** A unit test proves that `QuorumStore` rejects `trackId` values containing `../` with a `PathTraversalError`.
- [ ] **AC-8:** All existing 383+ tests still pass after the changes.

---

## Out of Scope

- Making `orchestrate.ts`'s `executeTrack()` the default production path (the LLM-as-orchestrator path remains the primary runtime for now).
- Rewriting the `swarm-orchestrate` skill itself.
- Changes to any existing `spec.md` or `plan.md` files for other tracks.
- UI or frontend changes.
