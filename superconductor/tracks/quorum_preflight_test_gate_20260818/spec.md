# Specification: Quorum Preflight Test Gate

**Track ID:** `quorum_preflight_test_gate_20260818`
**Type:** Feature
**Created:** 2026-08-18
**Status:** Planned

---

## Overview

The Superconductor quorum review system currently has each reviewer agent independently execute the full test suite (`npm test`) and TypeScript build check (`npm run build`) as part of their individual review cycle (per `skills/review/SKILL.md` §2.3 step 4). When N reviewers run in parallel (typically 4: Security, Correctness, Adversarial, Regression), this causes N redundant test runs — wasting time, compute, and producing noisy, duplicated log output.

This track introduces a **Preflight Test Gate**: a single shared test+build cycle that runs **before** any quorum reviewers are spawned. The resulting `TestReport` object is passed as structured context to every reviewer, which then references it directly instead of re-running tests.

---

## Problem Statement

| Symptom | Root Cause |
|---|---|
| 4x redundant `npm test` runs per quorum cycle | Each reviewer independently follows §2.3 step 4 |
| Slow quorum cycles | Serial/parallel test runs add 30-120s per reviewer |
| Noisy log output | N copies of identical test stdout pollute review context |
| Wasted compute | Tests re-run even on unchanged code (same git tree-hash) |

---

## Architecture Committee Recommendations

- **Isolate side effects at the boundary**: The `PreflightTestRunner` is the single point of process execution for tests. Reviewers must be consumers, never producers, of test output.
- **Structural coupling via interface, not string**: `TestReport` is a typed interface — reviewers receive a structured object, not a raw string diff, enabling future schema evolution.
- **Cache-by-content, not by time**: Cache keyed on git tree-hash ensures correctness regardless of timing; time-based TTLs are fragile under concurrent agent workloads.
- **Short-circuit early, fail fast**: If the preflight fails, spawn zero reviewers — don't waste reviewer token budgets on broken code.
- **Backward compatibility**: The `--no-preflight` flag and absence-of-`<test_report>`-block fallback ensure no existing workflows are broken.

---

## Functional Requirements

### FR-1: TestReport Interface
A new TypeScript `interface TestReport` MUST be defined in `packages/engine/src/verification/test-report.ts`:

```typescript
export interface TestReport {
  timestamp: number;      // epoch ms when tests were run
  testCommand: string;    // e.g. 'npm test'
  buildCommand: string;   // e.g. 'npm run build'
  testExitCode: number;
  buildExitCode: number;
  testOutput: string;     // trimmed stdout+stderr of test run
  buildOutput: string;    // trimmed stdout+stderr of build run
  passed: boolean;        // true only if both exit codes === 0
  durationMs: number;     // total wall-clock time for both commands
}
```

### FR-2: PreflightTestRunner Class
A new class `PreflightTestRunner` MUST be implemented in `packages/engine/src/verification/preflight-test-runner.ts`:

**Command Detection (Test):**
- Read `package.json` at project root
- If `scripts.test` exists => use it as test command
- Else if `scripts.vitest` exists => use `npm run vitest`
- Else if `scripts.jest` exists => use `npm run jest`
- Fallback: `npm test`

**Command Detection (Build):**
- Read `package.json` at project root
- If `scripts.build` exists => use `npm run build`
- Else if `scripts.typecheck` exists => use `npm run typecheck`
- Else if `scripts.tsc` exists => use `npm run tsc`
- Fallback: `npm run build`

**Execution:**
- Run test command with `timeoutMs` (configurable, default 120 000 ms)
- Run build command with `timeoutMs` (same timeout)
- Capture combined stdout+stderr for each; trim to 8 000 chars max
- Record wall-clock `durationMs` (total for both commands)
- Return `TestReport`

**Caching:**
- Cache key: git tree-hash of HEAD (`git rev-parse HEAD:` or `git write-tree`)
- If same tree-hash hit in cache => return cached `TestReport` immediately (< 10 ms)
- Cache is in-process `Map<string, TestReport>` (per process lifetime); no disk persistence required

### FR-3: QuorumReviewLoop Integration
`QuorumReviewLoopOptions` MUST gain:

```typescript
preflightFn?: () => Promise<TestReport>;
```

At the start of `run()`, before the first `reviewerFn` call:
- If `preflightFn` present and `testReport` not yet set: await `preflightFn()` and store result
- If `testReport.passed === false`: return `{ status: 'NEEDS_FIXES', findings: [...critical preflight failure finding...], allGreen: false }` immediately — do NOT invoke any reviewer
- Append a `<test_report>` XML block to `codeWithContext` before every `reviewerFn` call (sanitized via `sanitizeUntrustedText`)

### FR-4: Reviewer SKILL.md Changes (§2.3 Step 4)
`skills/review/SKILL.md` §2.3 step 4 "Testing & Compilation" MUST be updated to:

- **If a `<test_report>` block is present in the context:**
  - Do NOT re-run `npm test` or `npm run build`
  - Reference the `TestReport` directly in `## Verification Checks`, quoting `timestamp`, `passed`, `durationMs`
  - If `passed: false` => escalate all test-related findings as **Critical**
- **If NO `<test_report>` block is present:**
  - Fall back to running tests manually (existing behaviour — backward compat)

`skills/standalone-review/SKILL.md` and `skills/swarm-execute/SKILL.md` MUST receive equivalent updates to their test-execution sections.

### FR-5: CLI Flags
The engine CLI (or quorum loop initializer) MUST support:

| Flag | Behaviour |
|---|---|
| `--no-preflight` | Disables preflight gate; each reviewer runs tests independently (legacy mode) |
| `--preflight-timeout <ms>` | Overrides 120 000 ms default per command |

---

## Non-Functional Requirements

- **NFR-1 Performance**: Cache hit MUST return in < 10 ms
- **NFR-2 Correctness**: Cache key MUST be git tree-hash, not timestamp or random
- **NFR-3 Backward Compatibility**: All existing quorum loops without `preflightFn` MUST behave identically to pre-track behaviour
- **NFR-4 Security**: `testOutput` and `buildOutput` MUST be trimmed and MUST NOT be passed unsanitized; apply `sanitizeUntrustedText` before injection
- **NFR-5 TypeScript**: All new code MUST compile cleanly (`npm run build` exits 0)
- **NFR-6 Test Coverage**: All new code MUST be unit-tested with mocked command execution (coverage >= 80%)

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| **AC1** | Only ONE `npm test` + `npm run build` executes per quorum cycle regardless of N reviewers |
| **AC2** | Each reviewer's output references the shared `TestReport` `timestamp` and `passed` status in `## Verification Checks` |
| **AC3** | `--no-preflight` preserves old per-reviewer test execution behaviour |
| **AC4** | Preflight failure => quorum loop returns `NEEDS_FIXES` immediately, no reviewers spawned |
| **AC5** | `PreflightTestRunner` returns cached result in < 10 ms for same git tree-hash |
| **AC6** | All new code has unit tests with mocked command execution |
| **AC7** | TypeScript compiles cleanly (`npm run build` exits 0) |

---

## Out of Scope

- Persistent disk-based test result caching
- Distributed test result sharing across multiple machine agents
- Coverage report parsing or attachment to `TestReport`
- Changing the test runner or CI pipeline configuration
- Modifying `VerificationPipeline` class (handles VLM/mutation/PBT — not shell test execution)

---

## Affected Files

| File | Change Type |
|---|---|
| `packages/engine/src/verification/test-report.ts` | **NEW** — `TestReport` interface |
| `packages/engine/src/verification/preflight-test-runner.ts` | **NEW** — `PreflightTestRunner` class |
| `packages/engine/src/verification/quorum-review-loop.ts` | **MODIFIED** — add `preflightFn`, `testReport`, short-circuit, context injection |
| `packages/engine/src/verification/__tests__/preflight-test-runner.test.ts` | **NEW** — unit tests |
| `packages/engine/src/verification/__tests__/quorum-review-loop.test.ts` | **MODIFIED** — new test cases for preflight branch |
| `skills/review/SKILL.md` | **MODIFIED** — §2.3 step 4 conditional logic |
| `skills/standalone-review/SKILL.md` | **MODIFIED** — equivalent test-execution section |
| `skills/swarm-execute/SKILL.md` | **MODIFIED** — equivalent test-execution section |
