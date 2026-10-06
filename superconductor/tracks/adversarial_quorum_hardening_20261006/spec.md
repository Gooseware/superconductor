# Specification: Adversarial Quorum Hardening & Production Seam Remediation

**Track Identifier:** `adversarial_quorum_hardening_20261006`  
**Category:** Swarm Orchestration, Verification Harness & Reliability  
**Target Milestone Phase:** `Phase 1: Active Tracks (Active)`  
**Source:** Adversarial Quorum Audit of Merged Main (`REV-1` through `REV-6`)

---

## 1. Overview & Problem Statement

Following the successful merge of the Invariant-First Remediation and Execution Quorum protocols (`invariant_first_remediation_and_execution_quorum_20261005` and `20261006`), an adversarial stress-test conducted by the review swarm exposed six critical production seams, test-theatre artifacts, and CLI blind spots:

1. **Phantom Finding Filtering (`REV-1`)**: The integration test asserted that speculative findings lacking verified execution proofs were rejected by the review gate. In reality, `aggregateFindings()` possessed no production filtering logic for `execution_proof`; the test manufactured passing assertions by filtering a local mock array in the test body.
2. **Plan-Gap Documentation Violations (`REV-2`)**: Four user manual verification tasks in `superconductor/workflow.md` were checked off in the previous plan without modifying `workflow.md`.
3. **Preflight CLI Blind Spots (`REV-3`)**: `npm run check:preflight` executed only `PreflightASTChecker`, omitting `evaluateInvariantRules` and emitting false passes on defensive nulling (`?? 0`, `|| []`).
4. **Silent Degradation & Multi-line Evasion (`REV-4`, `REV-5`)**: `DiffOnDiffAuditor` permitted `catch` blocks that returned fallbacks (`return null`, `return []`) and single-line regex scanning failed to detect split-line nulling (`??\n 0`).
5. **Main Branch CI Test Failures (`REV-6`)**: Hardcoded `/home/gooseware/.local/bin/chromium` paths caused crawler unit test failures, alongside assertion timeouts in multi-track orchestration tests.

This track seals all six seams mechanically, establishing true closed-loop integrity across the review aggregator, preflight CLI, diff auditor, workflow manual, and vitest test suite.

---

## 2. Architecture Committee & Swarm Synthesis

- **Dreamer Perspective**: The review aggregator must enforce execution-proof contracts at the data boundary. Rather than dropping unverified findings entirely (which destroys diagnostic telemetry), unverified findings should be gracefully downgraded to `info` severity with clear provenance badges, preventing them from blocking quorum while preserving insights in the notebook.
- **Reviewer Perspective**: CLI preflight cannot rely solely on AST parsing. AST parsers handle syntax structure, while Invariant Rules provide heuristic safeguards against nulling fallbacks and timing degradation. Merging both into `check:preflight` establishes an impenetrable preflight gate.
- **Auditor Perspective**: Tests must never simulate production gates with local array filters. The integration test suite must test the real production functions and real git diffs directly.

---

## 3. Functional Requirements

### FR-1: Production Execution Proof Gating in Review Aggregator
- `packages/superconductor-core/src/review/aggregate-findings.ts`:
  - When aggregating findings, inspect any finding assigned severity `critical` or `high`.
  - If the finding originated from an adversarial, correctness, or execution reviewer and lacks `execution_proof?.verified === true`:
    - Automatically downgrade its severity to `info`.
    - Prefix description with `[UNVERIFIED SPECULATIVE FINDING - DOWNGRADED]`.
    - Set `is_blocking: false` so it cannot trigger a quorum rejection or force unnecessary remediation loops.
- `packages/superconductor-core/tests/remediation/invariant-first-integration.test.ts`:
  - Eliminate the in-test mock array filter (`admittedFindings = candidateFindings.filter(...)`).
  - Pass candidate findings directly through production `aggregateFindings()` and assert that speculative findings are downgraded to `info`.

### FR-2: Dual-Tier Quorum Preflight CLI Runner
- `packages/superconductor-core/src/cli/check-preflight.ts`:
  - Run both `PreflightASTChecker.scanGitDiff()` AND `evaluateInvariantRules()`.
  - Ensure `evaluateInvariantRules` evaluates against changed file contents and diff hunks.
  - If either engine reports violations, print formatted errors and terminate process with exit code `1`.
  - Add unit and integration tests verifying that `npm run check:preflight` exits with `1` on unhandled `?? 0` additions.

### FR-3: Diff-on-Diff Auditor Hardening
- `packages/superconductor-core/src/remediation/diff-on-diff-auditor.ts`:
  - **Catch Body Scrutiny**: Flag `catch` blocks that execute `return null`, `return undefined`, `return []`, `return {}`, `return false`, or `return ""` as `swallowed_error` / silent degradation unless returning an explicit `Result.err()` or rethrowing.
  - **Multi-line Hunk Parsing**: Scan multi-line diff hunks for split nulling operators (e.g., `??\n 0`, `||\n []`).
  - **Cycle 1 Auditing**: Execute diff scrutiny on cycle 1 when comparing against merge-base or parent commit.

### FR-4: Superconductor Workflow Documentation
- `superconductor/workflow.md`:
  - Document Section 7.5: **Adversarial Execution Reviewer Protocol & Ephemeral Reproduction Harness**.
  - Document Section 7.6: **Diff-on-Diff Scrutiny Engine & Secondary Regression Protection**.
  - Document Section 7.7: **Quorum Preflight Gate (`check:preflight`)**.
  - Document Section 7.8: **Closed-Loop Post-Run Retrospective Engine & Dual-Taxonomy Track Inception**.

### FR-5: Core Test Suite Greening & Crawler Binary Dynamic Resolution
- `packages/superconductor-core/src/crawler/config.ts` & `src/crawler/runner.ts`:
  - Dynamically resolve Chromium path via `process.env.CHROMIUM_PATH`, `which chromium`, or standard OS locations instead of hardcoded `/home/gooseware/.local/bin/chromium`.
- `packages/superconductor-core/tests/crawler/*.test.ts`:
  - Mock browser launch in unit test suites where a headless browser binary is not present or required.
- `packages/superconductor-core/tests/multi-track-orchestration.spec.ts` & `src/cli/__tests__/learn.test.ts`:
  - Resolve dispatcher expectations and test timeouts.
- Ensure `npm test -w packages/superconductor-core` passes 100% (0 failed suites).

---

## 4. Non-Functional Requirements

- **Zero Test Theatre**: All assertions must run against production methods; no mocking of the pipeline under test.
- **Performance**: Preflight CLI must finish in $< 2000\text{ms}$ on typical git diffs.
- **Deterministic CI**: Tests must not depend on fixed user home directories (`/home/gooseware/`).

---

## 5. Acceptance Criteria

- [ ] **AC 1**: `aggregateFindings()` downgrades unverified `critical`/`high` reviewer findings to `info` severity with `[UNVERIFIED SPECULATIVE FINDING - DOWNGRADED]` tag.
- [ ] **AC 2**: `invariant-first-integration.test.ts` invokes production `aggregateFindings()` directly and validates speculative finding downgrade without mock array filtering.
- [ ] **AC 3**: `npm run check:preflight` executes both `PreflightASTChecker` and `evaluateInvariantRules`, exiting with code `1` if defensive nulling or fixture tampering is present.
- [ ] **AC 4**: `DiffOnDiffAuditor` flags catch blocks returning fallbacks (`return null`, `return []`) and catches multi-line split nulling (`??\n 0`).
- [ ] **AC 5**: `superconductor/workflow.md` accurately documents the Adversarial Execution, Diff-on-Diff, Preflight Gate, and Retrospective protocols.
- [ ] **AC 6**: All 208 test files in `packages/superconductor-core` pass (`npm test -w packages/superconductor-core` exit code 0).
