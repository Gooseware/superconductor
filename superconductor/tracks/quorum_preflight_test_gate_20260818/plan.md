# Implementation Plan: Quorum Preflight Test Gate

**Track ID:** `quorum_preflight_test_gate_20260818`
**Spec:** [spec.md](./spec.md)
**Target Branch:** `main`
**Track Branch:** `track/quorum_preflight_test_gate_20260818`

> [!IMPORTANT]
> All writes to `packages/*/src/**` MUST be dispatched to a Processor subagent.
> The root/Dreamer agent MUST NOT write to those paths directly (SWARM GUARDRAIL).

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify `swarm-orchestrate` skill is installed and loaded [TIER-1] [AGENT:superconductor-processor]
    - [ ] Check `.agents/skills/` and `~/.agents/extensions/superconductor/skills/` for `swarm-orchestrate`
    - [ ] If missing, alert the operator — do NOT proceed to Phase 1 without confirmation
- [ ] Task: Verify `packages/engine/src/verification/` directory exists and read current `quorum-review-loop.ts` [TIER-1] [AGENT:superconductor-processor]
    - [ ] Confirm `QuorumReviewLoopOptions` interface shape
    - [ ] Confirm `sanitizeUntrustedText` import path
- [ ] Task: Verify `skills/review/SKILL.md`, `skills/standalone-review/SKILL.md`, and `skills/swarm-execute/SKILL.md` exist [TIER-1] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: TestReport Interface (New File)

> Processor writes `packages/engine/src/verification/test-report.ts`

- [ ] Task: Write `TestReport` interface to `packages/engine/src/verification/test-report.ts` [TIER-2] [AGENT:superconductor-processor]
    - [ ] Define all 9 fields as specified in FR-1 (spec.md)
    - [ ] Export as named export `TestReport`
    - [ ] Add JSDoc comments on each field
    - [ ] No runtime dependencies — pure interface file
- [ ] Task: Verify TypeScript compiles after new file (`npm run build` in `packages/engine`) [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: TestReport Interface' (Protocol in workflow.md)

---

## Phase 2: PreflightTestRunner — TDD (Write Tests First)

> All writes dispatched to Processor subagent

- [ ] Task: Write unit tests for `PreflightTestRunner` in `packages/engine/src/verification/__tests__/preflight-test-runner.test.ts` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: command detection from `package.json` — `scripts.test` present
    - [ ] Test: command detection fallback chain (`vitest` → `jest` → `npm test`)
    - [ ] Test: build command detection fallback chain (`build` → `typecheck` → `tsc`)
    - [ ] Test: successful run returns `TestReport` with `passed: true`
    - [ ] Test: one command failing returns `passed: false`
    - [ ] Test: timeout exceeded returns non-zero exit code and `passed: false`
    - [ ] Test: output trimmed to 8 000 chars
    - [ ] Test: cache hit on same git tree-hash returns in < 10 ms without re-executing commands
    - [ ] Test: different git tree-hash triggers fresh execution
    - [ ] All tests use mocked `child_process.spawn` or equivalent — NO real process execution
- [ ] Task: Confirm tests fail (red) before implementation [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: PreflightTestRunner Tests' (Protocol in workflow.md)

---

## Phase 3: PreflightTestRunner — Implementation

> Processor writes `packages/engine/src/verification/preflight-test-runner.ts`

- [ ] Task: Implement `PreflightTestRunner` class [TIER-3] [AGENT:superconductor-processor]
    - [ ] Constructor accepts `{ timeoutMs?: number; projectRoot?: string }` options
    - [ ] `detectTestCommand(pkgJson): string` — private method, fallback chain per FR-2
    - [ ] `detectBuildCommand(pkgJson): string` — private method, fallback chain per FR-2
    - [ ] `runCommand(cmd, timeoutMs): Promise<{ exitCode: number; output: string }>` — private method using `child_process.spawn`, captures stdout+stderr, enforces timeout with `SIGTERM`
    - [ ] `run(): Promise<TestReport>` — public entry point; reads `package.json`, detects commands, runs both, assembles and returns `TestReport`
    - [ ] In-process `Map<string, TestReport>` cache keyed on git tree-hash (`git rev-parse HEAD:`)
    - [ ] `clearCache(): void` — public method for test teardown
    - [ ] Output trimmed to 8 000 chars before storing in `TestReport`
    - [ ] `durationMs` measured as wall clock from start of first command to end of second
- [ ] Task: Run unit tests to confirm green [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Run `npm run build` in `packages/engine` to confirm TypeScript clean [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: PreflightTestRunner Implementation' (Protocol in workflow.md)

---

## Phase 4: QuorumReviewLoop Integration

> Processor modifies `packages/engine/src/verification/quorum-review-loop.ts`

- [x] Task: Write new test cases for `QuorumReviewLoop` preflight branch in existing test file [TIER-3] [AGENT:superconductor-processor] a5f1f5f2
    - [ ] Test: `preflightFn` is called once before first `reviewerFn` invocation
    - [ ] Test: when `testReport.passed === false` → return `NEEDS_FIXES` without calling `reviewerFn`
    - [ ] Test: when `testReport.passed === true` → `reviewerFn` receives `<test_report>` block in context
    - [ ] Test: `<test_report>` block contains `timestamp`, `passed`, `durationMs`, sanitized `testOutput`
    - [ ] Test: without `preflightFn` → existing behaviour unchanged (no `<test_report>` block)
    - [ ] Test: `preflightFn` called only once even across multiple `reviewerFn` iterations
- [x] Task: Modify `QuorumReviewLoopOptions` to add `preflightFn?: () => Promise<TestReport>` [TIER-3] [AGENT:superconductor-processor] a5f1f5f2
- [x] Task: Add `private testReport?: TestReport` field to `QuorumReviewLoop` class [TIER-3] [AGENT:superconductor-processor] a5f1f5f2
- [x] Task: Implement preflight gate at top of `run()` method [TIER-3] [AGENT:superconductor-processor] a5f1f5f2
    - [ ] Await `preflightFn()` if present and `testReport` not yet set
    - [ ] On `passed === false`: return `{ status: 'NEEDS_FIXES', findings: [critical finding with output], allGreen: false }`
    - [ ] On `passed === true`: continue to reviewer loop
- [x] Task: Inject `<test_report>` XML block into `codeWithContext` when `testReport` is set [TIER-3] [AGENT:superconductor-processor] a5f1f5f2
    - [ ] Apply `sanitizeUntrustedText` to `testOutput` and `buildOutput` before injection
    - [ ] Format: timestamp as ISO string, commands, exit codes, pass/fail, duration, outputs
- [x] Task: Import `TestReport` from `./test-report.js` in `quorum-review-loop.ts` [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
- [x] Task: Run all quorum-review-loop tests to confirm green [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
- [x] Task: Run `npm run build` in `packages/engine` — confirm zero TypeScript errors [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: QuorumReviewLoop Integration' (Protocol in workflow.md)

---

## Phase 5: CLI Flag Support

> Processor modifies the CLI entrypoint for the quorum loop

- [x] Task: Identify CLI entrypoint that constructs `QuorumReviewLoop` [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
    - [ ] Search for instantiation of `QuorumReviewLoop` in `packages/engine/src/`
    - [ ] Identify how existing options (e.g., `timeoutMs`, `maxIterations`) are wired from CLI flags
- [x] Task: Add `--no-preflight` flag [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
    - [ ] When present: do NOT set `preflightFn` in `QuorumReviewLoopOptions`
    - [ ] When absent (default): wire `PreflightTestRunner.run.bind(runner)` as `preflightFn`
- [x] Task: Add `--preflight-timeout <ms>` flag [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
    - [ ] Parse as integer; validate > 0
    - [ ] Pass to `PreflightTestRunner` constructor as `timeoutMs`
    - [ ] Default: 120 000 ms
- [x] Task: Write CLI integration test (mocked) for both flags [TIER-3] [AGENT:superconductor-processor] a5f1f5f2
- [x] Task: Run `npm run build` in `packages/engine` — confirm zero TypeScript errors [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: CLI Flags' (Protocol in workflow.md)

---

## Phase 6: Skill SKILL.md Updates

> Processor modifies skill markdown files (not `packages/*/src/**` — permitted for Dreamer/Processor)

- [x] Task: Update `skills/review/SKILL.md` §2.3 step 4 — "Testing - [ ] Task: Update `skills/review/SKILL.md` §2.3 step 4 — "Testing & Compilation" [TIER-2] [AGENT:superconductor-processor] Compilation" [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
    - [ ] Add conditional: IF `<test_report>` block present in context → reference it, skip test re-run
    - [ ] Specify: quote `timestamp`, `passed`, `durationMs` in `## Verification Checks` output
    - [ ] Specify: if `passed: false` in `<test_report>` → escalate as Critical
    - [ ] Preserve: IF no `<test_report>` block → run tests manually (backward compat fallback)
    - [ ] Do NOT alter any other sections of `SKILL.md`
- [x] Task: Update `skills/standalone-review/SKILL.md` — equivalent test-execution section [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
    - [ ] Same conditional logic as above
    - [ ] Match the section structure of that file (do NOT reformat unrelated content)
- [x] Task: Update `skills/swarm-execute/SKILL.md` — equivalent test-execution section [TIER-2] [AGENT:superconductor-processor] a5f1f5f2
    - [ ] Same conditional logic
- [ ] Task: Adversarial check — verify no other existing behaviour in the skills was silently removed [TIER-4] [AGENT:superconductor-reviewer]
    - [ ] Diff each SKILL.md before/after; confirm only the targeted step 4 block changed
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Skill Updates' (Protocol in workflow.md)

---

## Phase 7: Integration & Finalization

- [ ] Task: Run full test suite `npm test` at workspace root — confirm all pass [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Run `npm run build` at workspace root — confirm zero TypeScript errors [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Oracle AC verification — systematically verify all 7 acceptance criteria [TIER-4] [AGENT:superconductor-oracle]
    - [ ] AC1: Instrument/trace that only one test process is spawned per quorum cycle
    - [ ] AC2: Spot-check reviewer output for `<test_report>` reference in `## Verification Checks`
    - [ ] AC3: Run with `--no-preflight` and confirm per-reviewer test execution
    - [ ] AC4: Simulate preflight failure and confirm `NEEDS_FIXES` returned, zero reviewers spawned
    - [ ] AC5: Call `run()` twice with same mocked tree-hash; assert second call < 10 ms
    - [ ] AC6: Confirm test files exist and pass for all new code
    - [ ] AC7: Confirm `npm run build` exits 0
- [ ] Task: Commit all changes with message `feat(engine): Quorum preflight test gate — single shared test run before reviewers` [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Integrate track `quorum_preflight_test_gate_20260818` into `main` branch [TIER-2] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Integration & Finalization' (Protocol in workflow.md)

---

## Swarm Blueprint

```json
{
  "track_id": "quorum_preflight_test_gate_20260818",
  "estimated_cost": "~0.3M tokens · ~$0.02 at Flash-Lite rates",
  "waves": 9,
  "oracle_cadence": 10,
  "source": "intelligence",
  "agent_routing": {
    "TIER-1": "gemini-flash-lite",
    "TIER-2": "gemini-flash",
    "TIER-3": "gemini-flash",
    "TIER-4": "gemini-pro"
  },
  "parallel_phases": ["Phase 1", "Phase 2"],
  "sequential_phases": ["Phase 3", "Phase 4", "Phase 5", "Phase 6", "Phase 7"],
  "guardrail": "Processor MUST NOT be spawned until Phase 0 completes successfully"
}
```

---

## Known Fragile Areas

> [!WARNING]
> - `sanitizeUntrustedText` must be applied to ALL shell output before injection into reviewer prompts — test output is adversarial surface (it can contain agent-direction strings).
> - Cache keyed on `git rev-parse HEAD:` will miss in-progress dirty-tree changes. Document this limitation; do NOT cache by `git write-tree` without a clean working tree guarantee.
> - The `<test_report>` XML block must be placed AFTER the `<untrusted_research_context>` block in `codeWithContext` to preserve existing injection order.
> - CLI flag `--no-preflight` is a safety valve — do NOT make it the default in any config file.
