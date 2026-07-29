# Implementation Plan: Orchestrator Hardening & Quorum Integrity

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 6 tasks)

---

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 21 tasks)
**Estimated Track Token Budget:** ~0.8M tokens · ~$0.06 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify if the `swarm-orchestrate` skill i... | flash_lite | 19K | ~6 min |
| 2 | Task: Harden `QuorumStore` against path travers... | flash_lite | 56K | ~18 min |
| 3 | Task: Extend `WorkUnit` with `unitType: 'TASK' ... | flash_lite | 56K | ~18 min |
| 4 | Task: Define `ExecutionMode` enum and `NonInter... | flash_lite | 56K | ~18 min |
| 5 | Write failing test: `assertInteractiveAllowed()... | flash_lite | 56K | ~18 min |
| 6 | Write failing test: no flags or CI env → `getEx... | flash_lite | 56K | ~18 min |
| 7 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 8 | Task: Implement `RogueWriteGuard` that throws `... | flash_lite | 56K | ~18 min |
| 9 | Task: Integrate `RogueWriteGuard` into `SwarmPe... | flash_lite | 38K | ~12 min |
| 10 | Task: Implement `ReviewerResponseBroker` with f... | flash_lite | 56K | ~18 min |
| 11 | Implement `packages/engine/src/verification/rev... | flash_lite | 56K | ~18 min |
| 12 | Update `orchestrate.ts` `reviewerFn` to call `R... | flash_lite | 28K | ~9 min |
| 13 | Task: Refactor `AgyAgentSpawner` to read `spawn... | flash_lite | 56K | ~18 min |
| 14 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 15 | Task: Implement `RetrospectiveGenerator` that s... | flash_lite | 56K | ~18 min |
| 16 | Implement `packages/engine/src/telemetry/retros... | flash_lite | 56K | ~18 min |
| 17 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 18 | Task: Run full test suite across `@superconduct... | flash_lite | 47K | ~15 min |

## Phase 0: Swarm Preflight
- [x] Task: Verify if the `swarm-orchestrate` skill is installed and loaded. [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 1: Foundation — Path Sanitization & Work Unit Tagging

- [x] Task: Harden `QuorumStore` against path traversal — add `sanitizeId()` with `/^[a-zA-Z0-9_-]+$/` regex + `path.resolve()` boundary check; throw `PathTraversalError` on violation. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: `trackId` containing `../` throws `PathTraversalError`. [TIER-1:TCS=3]
    - [x] Write failing test: valid `trackId` passes sanitization. [TIER-1:TCS=3]
    - [x] Write failing test: resolved path escaping `.superconductor/` root throws `PathTraversalError`. [TIER-1:TCS=3]
    - [x] Implement `sanitizeId()` in `packages/engine/src/cli/quorum-store.ts`. [TIER-1:TCS=3]
    - [x] Apply `sanitizeId()` to all `writeConsensus`, `readConsensus`, `writeResult`, `appendToAgentsManifest` entry points. [TIER-1:TCS=3]

- [x] Task: Extend `WorkUnit` with `unitType: 'TASK' | 'VERIFY'` and update `parseAndDispatch()` to tag `Superconductor - User Manual Verification` lines as `VERIFY`. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: plan line `- [x] Task: Superconductor - User Manual Verification ...` is parsed as `unitType: 'VERIFY'`. [TIER-1:TCS=3]
    - [x] Write failing test: regular task line is parsed as `unitType: 'TASK'`. [TIER-1:TCS=3]
    - [x] Update `WorkUnit` interface in `packages/superconductor-core/src/track/work-unit.ts`. [TIER-1:TCS=3]
    - [x] Update `parseAndDispatch()` regex logic in `packages/engine/src/cli/orchestrate.ts`. [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 1: Foundation' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 2: HeadlessModeGuard & ExecutionMode

- [x] Task: Define `ExecutionMode` enum and `NonInteractiveModeError` in `packages/engine/src/guard/`. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: `ExecutionMode` has exactly 3 values: `INTERACTIVE`, `HEADLESS`, `BATCH_OVERNIGHT`. [TIER-1:TCS=3]
    - [x] Write failing test: `NonInteractiveModeError` is an `Error` subclass with `mode` property. [TIER-1:TCS=3]
    - [x] Implement `packages/engine/src/guard/execution-mode.ts`. [TIER-1:TCS=3]

- [x] Task: Implement `HeadlessModeGuard` that throws `NonInteractiveModeError` when `assertInteractiveAllowed()` is called in `HEADLESS` mode, and calls `notify-send` + writes to `stderr` for FATAL-class prompts. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: `assertInteractiveAllowed()` in `INTERACTIVE` mode does not throw. [TIER-1:TCS=3]
    - [x] Write failing test: `assertInteractiveAllowed()` in `HEADLESS` mode throws `NonInteractiveModeError`. [TIER-1:TCS=3]
    - [x] Write failing test: FATAL-class call in `HEADLESS` mode writes to `process.stderr`. [TIER-1:TCS=3]
    - [x] Implement `packages/engine/src/guard/headless-mode-guard.ts`. [TIER-1:TCS=3]

- [x] Task: Update `SwarmPermissionEvaluator` to detect headless mode (`--headless` flag OR `process.env.CI`) and expose `getExecutionMode(): ExecutionMode`. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: `process.env.CI = 'true'` → `getExecutionMode()` returns `HEADLESS`. [TIER-1:TCS=3]
    - [x] Write failing test: `--headless` flag in config → `getExecutionMode()` returns `HEADLESS`. [TIER-1:TCS=3]
    - [x] Write failing test: no flags or CI env → `getExecutionMode()` returns `INTERACTIVE`. [TIER-1:TCS=3]
    - [x] Implement in `packages/engine/src/cli/swarm-permission-evaluator.ts`. [TIER-1:TCS=3]

- [x] Task: Wire `VERIFY`-type work units in `executeTrack()` through `HeadlessModeGuard` — auto-approve with `VERIFIED_HEADLESS` consensus artifact in `HEADLESS` mode; pause orchestrator in `INTERACTIVE` mode. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: `VERIFY` unit in `HEADLESS` mode transitions to `DONE` without spawning any subagent. [TIER-1:TCS=3]
    - [x] Write failing test: `VERIFY` unit in `INTERACTIVE` mode emits `verification_required` event (not auto-approved). [TIER-1:TCS=3]
    - [x] Implement routing logic in `packages/engine/src/cli/orchestrate.ts`. [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 2: HeadlessModeGuard' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 3: RogueWriteGuard

- [x] Task: Implement `RogueWriteGuard` that throws `RogueWriteAttemptError` with the canonical GEMINI.md error message when a root-role agent attempts to write to protected paths. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: write attempt to `packages/engine/src/foo.ts` with `SUPERCONDUCTOR_ROLE=root` throws `RogueWriteAttemptError`. [TIER-1:TCS=3]
    - [x] Write failing test: same write attempt with `SUPERCONDUCTOR_ROLE=processor` does NOT throw. [TIER-1:TCS=3]
    - [x] Write failing test: error message exactly equals `"[Superconductor] Rogue write attempt detected. Aborting. I must dispatch a Processor subagent instead."`. [TIER-1:TCS=3]
    - [x] Write failing test: write to non-protected path with root role does NOT throw. [TIER-1:TCS=3]
    - [x] Implement `packages/engine/src/guard/rogue-write-guard.ts` with configurable protected path glob patterns (`packages/*/src/**`, `app/**`). [TIER-1:TCS=3]

- [x] Task: Integrate `RogueWriteGuard` into `SwarmPermissionEvaluator.assertRootModelRestricted()` — active when `SUPERCONDUCTOR_ROLE=root` and swarm mode is active. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: `assertRootModelRestricted()` with swarm active + root role also registers the `RogueWriteGuard`. [TIER-1:TCS=3]
    - [x] Implement integration in `packages/engine/src/cli/swarm-permission-evaluator.ts`. [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 3: RogueWriteGuard' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 4: ReviewerResponseBroker & Quorum Result Ingestion (Oracle)

- [x] Task: Implement `ReviewerResponseBroker` with file-watcher streaming on QuorumStore consensus files, Zod-validated `json:review-findings` extraction, and fail-closed timeout logic. [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [x] Write failing test: broker returns `RESOLVED` when reviewer consensus file contains `{ "status": "RESOLVED" }`. [TIER-1:TCS=3]
    - [x] Write failing test: broker returns `FAILED` when reviewer consensus file contains `{ "severity": "CRITICAL", "findings": [...] }`. [TIER-1:TCS=3]
    - [x] Write failing test: broker returns `FAILED` (fail-closed) when reviewer file is not written within 30s timeout. [TIER-1:TCS=3]
    - [x] Write failing test: Zod rejects malformed `json:review-findings` block (missing required fields). [TIER-1:TCS=3]
    - [x] Write failing test: broker correctly aggregates 4 reviewer results into a single consensus. [TIER-1:TCS=3]
    - [x] Implement `packages/engine/src/verification/reviewer-response-broker.ts` using `fs.watchFile` + byte-offset streaming (no full-file reads). [TIER-1:TCS=3]
    - [x] Implement Zod schema for `ReviewerFindingsPayload`. [TIER-1:TCS=3]

- [x] Task: Replace hardcoded `{ status: 'RESOLVED', findings: [] }` in `orchestrate.ts` `reviewerFn` with real `ReviewerResponseBroker.aggregate()` call. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: `executeTrack()` transitions work unit to `FAILED` when `ReviewerResponseBroker` returns CRITICAL finding. [TIER-1:TCS=3]
    - [x] Write failing test: `executeTrack()` transitions work unit to `DONE` only when ALL 4 reviewers return `RESOLVED`. [TIER-1:TCS=3]
    - [x] Write failing test: `executeTrack()` transitions work unit to `FAILED` when any 1 of 4 reviewers times out (fail-closed). [TIER-1:TCS=3]
    - [x] Update `orchestrate.ts` `reviewerFn` to call `ReviewerResponseBroker`. [TIER-1:TCS=3]
    - [x] Update `QuorumReviewLoop` options: `maxIterations: 3`, wire `remediateFn` to dispatch `superconductor-remediation-processor` subagent. [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 4: ReviewerResponseBroker' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 5: AgyAgentSpawner Configuration

- [x] Task: Refactor `AgyAgentSpawner` to read `spawner-config.json` from `.superconductor/` and return a synthetic conversation ID (with warning log) when backend is `noop` or config is absent — eliminating the unconditional throw. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: missing `spawner-config.json` → returns synthetic ID with `warn` log, does NOT throw. [TIER-1:TCS=3]
    - [x] Write failing test: `spawner-config.json` with `{ "backend": "noop" }` → same behaviour. [TIER-1:TCS=3]
    - [x] Write failing test: `spawner-config.json` with `{ "backend": "invoke_subagent" }` → documents the expected production path (can remain a stub for now, but must not throw unconditionally). [TIER-1:TCS=3]
    - [x] Implement `MockAgentSpawner` in `packages/engine/src/cli/mock-agent-spawner.ts` with scripted response queue for tests. [TIER-1:TCS=3]
    - [x] Update `packages/engine/src/cli/orchestrate.ts` to use `MockAgentSpawner` in test mode. [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 5: AgyAgentSpawner' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 6: Grounded Retrospective Generator

- [x] Task: Implement `RetrospectiveGenerator` that streams `transcript.jsonl` via `readline`, applies secret-redaction, extracts verified execution events, and grounds all findings in real `step_index` citations. [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [x] Write failing test: `GEMINI_API_KEY=sk-abc123` in transcript is redacted to `[REDACTED]` in output. [TIER-1:TCS=3]
    - [x] Write failing test: `GCP_PROJECT_ID=my-project` in transcript is redacted to `[REDACTED]` in output. [TIER-1:TCS=3]
    - [x] Write failing test: finding ID that does not correspond to a real `step_index` in the transcript is rejected with `UnverifiedFindingError`. [TIER-1:TCS=3]
    - [x] Write failing test: generator does NOT load full file into memory (mock `readline` interface). [TIER-1:TCS=3]
    - [x] Write failing test: hard metrics (commit SHA, test counts) are sourced from `QuorumStore` artifacts, not transcript text. [TIER-1:TCS=3]
    - [x] Implement `packages/engine/src/telemetry/retrospective-generator.ts`. [TIER-1:TCS=3]
    - [x] Implement secret redaction patterns (configurable regex list, defaulting to `GEMINI_API_KEY`, `GCP_*`, common key/token patterns). [TIER-1:TCS=3]

- [x] Task: Wire `RetrospectiveGenerator` into `TrackLifecycleManager.onTrackComplete()` to auto-generate and attach a `git notes` entry on the checkpoint commit. [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [x] Write failing test: `onTrackComplete()` calls `RetrospectiveGenerator.generate()` and attaches output via `git notes add`. [TIER-1:TCS=3]
    - [x] Write failing test: `git notes add` failure does NOT prevent track completion (non-blocking). [TIER-1:TCS=3]
    - [x] Implement in `packages/engine/src/cli/lifecycle-manager.ts`. [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 6: Retrospective Generator' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 7: Integration & Finalization

- [x] Task: Run full test suite across `@superconductor/engine` and `@superconductor/core` — all 383+ existing tests MUST pass alongside all new tests. [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [x] Task: Run `npx tsc --noEmit -p packages/engine/tsconfig.json` — zero NEW TypeScript errors permitted. [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [x] Task: Update `superconductor/agent-config.md` to document `HeadlessModeGuard`, `RogueWriteGuard`, and `ReviewerResponseBroker` as active guardrails. [TIER-2:TCS=3] [AGENT:superconductor-processor]
- [x] Task: Integrate track 'orchestrator_hardening_20260729' into main branch. [TIER-3:TCS=3] [AGENT:superconductor-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 7: Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=3]
