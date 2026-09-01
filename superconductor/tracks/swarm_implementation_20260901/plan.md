# Plan: Swarm Execution Engine — Parallel Implementor Swarm + Single-Run Preflight

**Track ID:** `swarm_implementation_20260901`
**Target Branch:** `main`

---

## Phase 0: Swarm Preflight

- [x] Task: Verify `swarm-execute` skill is installed and loaded [TIER-1] [AGENT:superconductor-processor]
    - [x] Confirm `~/.gemini/config/plugins/superconductor/skills/swarm-execute/SKILL.md` exists
    - [x] Confirm `orchestrate.ts`, `quorum-review-loop.ts`, `parallel-dispatcher.ts` are readable

---

## Phase 1: `QuorumReviewLoop` — Accept Pre-Run `TestReport` [DOMAIN:engine-verification]

- [x] Task: Add `preflightReport` option to `QuorumReviewLoopOptions` and handle it in `run()` [TIER-3] [AGENT:superconductor-processor]
    - [x] In `packages/engine/src/verification/quorum-review-loop.ts`:
        - [x] Add `preflightReport?: TestReport` to `QuorumReviewLoopOptions` interface
        - [x] In constructor: store `this.preflightReport = options.preflightReport`
        - [x] In `run()`: before the iteration loop, check `if (this.preflightReport && !this.testReport)` → set `this.testReport = this.preflightReport`; if `!this.preflightReport.passed` return `NEEDS_FIXES` immediately (mirror existing `preflightFn` failure path)
        - [x] Preserve full backward compatibility: if only `preflightFn` is provided and no `preflightReport`, behaviour is unchanged

- [x] Task: Write unit tests for `preflightReport` injection in `QuorumReviewLoop` [TIER-3] [AGENT:superconductor-processor]
    - [x] In `packages/engine/tests/quorum-review-loop.test.ts` (or new file):
        - [x] Test: `preflightReport` with `passed: false` → returns `NEEDS_FIXES` immediately, `reviewerFn` never called
        - [x] Test: `preflightReport` with `passed: true` → injects `<test_report>` XML into reviewer context, `reviewerFn` called once
        - [x] Test: `preflightFn` only (no `preflightReport`) → existing behavior unchanged (run called, result injected)
        - [x] Test: both `preflightFn` and `preflightReport` provided → `preflightReport` takes precedence, `preflightFn` never called
        - [x] Run tests; confirm all pass and coverage ≥ 80% for modified file

- [x] Task: Superconductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

---

## Phase 2: `SwarmOrchestratorCLI` — Global Preflight + Parallel Batch Dispatch [DOMAIN:engine-orchestration]

- [x] Task: Move preflight execution to global scope in `executeTrack()` [TIER-3] [AGENT:superconductor-processor]
    - [x] In `packages/engine/src/cli/orchestrate.ts`:
        - [x] After `parseAndDispatch()` call (line ~125), add global preflight block:
          ```typescript
          let globalTestReport: TestReport | undefined;
          if (!options?.noPreflight) {
              const { PreflightTestRunner } = await import('../verification/preflight-test-runner.js');
              const runner = new PreflightTestRunner({ projectRoot: workspaceDir, timeoutMs: options?.preflightTimeoutMs ?? 120000 });
              globalTestReport = await runner.run();
          }
          ```
        - [x] Remove `preflightFn` from the per-WorkUnit `QuorumReviewLoop` constructor call
        - [x] Replace it with `preflightReport: globalTestReport` in `QuorumReviewLoop` options
        - [x] Ensure the per-WU `preflightFn` closure is deleted (no leftover dead code)

- [x] Task: Replace sequential implementor loop with parallel batch dispatch [TIER-3] [AGENT:superconductor-processor]
    - [x] In `packages/engine/src/cli/orchestrate.ts`:
        - [x] Extract spawner logic from the `for` loop into a helper: `async function spawnImplementorBatch(batch: WorkUnit[]): Promise<void>`
        - [x] Replace the sequential `for` loop with a batched parallel dispatch:
          ```typescript
          const batchSize = this.dispatcher.maxConcurrent; // default 5
          for (let b = 0; b < workUnits.length; b += batchSize) {
              const batch = workUnits.slice(b, b + batchSize);
              const batchPromises = batch.map((wu, idx) => spawnImplementorBatch(wu, b + idx));
              allDispatches.push(...batchPromises);
              await Promise.all(batchPromises); // wait for batch before next batch
          }
          ```
        - [x] Ensure `updatedWorkUnits[i]` index tracking is preserved correctly across batches
        - [x] The `VERIFY` unit type special-case remains within the per-WU helper
        - [x] Expose `maxConcurrent` as a getter on `ParallelDispatcher` if not already public

- [x] Task: Write tests confirming parallel batch dispatch behaviour [TIER-3] [AGENT:superconductor-processor]
    - [x] In `packages/engine/tests/orchestrate.test.ts`:
        - [x] Test: 8 WorkUnits with `maxConcurrent=5` → first batch of 5 spawn calls issued before any completes; second batch of 3 after first batch resolves (use mock spawner with controlled latency)
        - [x] Test: `PreflightTestRunner.prototype.run` spy confirms called exactly **once** regardless of WorkUnit count (use sinon/jest spy)
        - [x] Test: `noPreflight: true` → spy confirms `run` never called
        - [x] Test: global preflight `passed: false` → all WorkUnits return `NEEDS_FIXES`, no implementor agents spawned
        - [x] Run full test suite; confirm all existing tests still pass

- [x] Task: Superconductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

---

## Phase 3: `swarm-execute/SKILL.md` — Implementation Swarm Dispatch Protocol [DOMAIN:skill-protocol]

- [x] Task: Add `Implementation Swarm Dispatch Protocol` section to `swarm-execute/SKILL.md` [TIER-3] [AGENT:superconductor-processor]
    - [x] In `~/.gemini/config/plugins/superconductor/skills/swarm-execute/SKILL.md`:
        - [x] Insert new section **before** the existing `## Phase Gate Reviewer Prompt Template` section:
          ```
          ## Implementation Swarm Dispatch Protocol

          Before dispatching any quorum reviewers, the orchestrator MUST complete the full
          Implementation Swarm phase in this order:

          ### Step 1 — Parse Plan into WorkUnits
          Call `parseAndDispatch(topographyPath, planPath)` to produce `WorkUnit[]`.
          Each `- [ ] Task:` line in `plan.md` becomes one WorkUnit with its `[AGENT:]` and `[DOMAIN:]` annotations.

          ### Step 2 — Run Global Preflight Once
          Unless `--no-preflight` is specified, run `PreflightTestRunner.run()` exactly once.
          Store the `TestReport`. If it fails (`passed: false`), halt immediately — do NOT spawn any implementor agents.
          The `TestReport` is injected into ALL subsequent `QuorumReviewLoop` instances via `preflightReport`.

          ### Step 3 — Batch Implementor Swarm Dispatch
          Group WorkUnits into batches of ≤ `maxConcurrent` (default 5).
          For each batch:
          1. Invoke N `superconductor-processor` subagents **in parallel** using `invoke_subagent` / `IAgentSpawner.spawn()`.
          2. Each agent receives: its WorkUnit spec, domain scope, and research context.
          3. `await Promise.all(batchPromises)` — wait for ALL agents in the batch to complete before starting the next batch.

          **PROHIBITED during Implementation Swarm:**
          - Spawning implementors serially (one-at-a-time)
          - Running preflight inside the per-WorkUnit closure
          - Root orchestrator writing any product code directly

          ### Step 4 — Transition to Quorum Swarm
          After ALL implementor batches complete, proceed to the Quorum Swarm phase below,
          injecting the pre-cached `TestReport` into all 4 reviewer subagents.
          ```

- [x] Task: Update `§Quorum Preflight Test Execution` section to reference pre-cached report [TIER-3] [AGENT:superconductor-processor]
    - [x] In the existing `### Quorum Preflight Test Execution & Context Injection Protocol (MANDATORY)` section:
        - [x] Change the opening sentence from "the orchestrator MUST execute the Preflight Test Runner once" to explicitly state:
          "The `TestReport` was already produced in Implementation Swarm Step 2. The orchestrator MUST inject this pre-cached `## Preflight Test Execution Evidence` block into all 4 reviewer subagents — it MUST NOT re-run `npm test` at this point."
        - [x] Reinforce: "Re-running tests during quorum is a PROTOCOL VIOLATION that saturates CI resources."

- [x] Task: Superconductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

---

## Phase 4: Integration & Finalization

- [ ] Task: Run full test suite and confirm coverage targets met [TIER-1] [AGENT:superconductor-processor]
    - [ ] `npm test` from repo root — all tests green
    - [ ] Coverage report: `packages/engine/src/cli/orchestrate.ts` ≥ 80%
    - [ ] Coverage report: `packages/engine/src/verification/quorum-review-loop.ts` ≥ 80%

- [ ] Task: Integrate track `swarm_implementation_20260901` into `main` branch [TIER-1] [AGENT:superconductor-processor]
    - [ ] Stage all changes
    - [ ] Commit: `feat(swarm): parallel implementor swarm + single-run preflight (#swarm_implementation_20260901)`
    - [ ] Merge to `main` (after Oracle gate)

---

## Swarm Blueprint

```
source: intelligence
waves: 3
maxConcurrent: 3
oracleCadence: every-phase

Phase 1 (engine-verification):   [WU-1: preflightReport option] [WU-2: tests]        → 2 parallel processors
Phase 2 (engine-orchestration):  [WU-3: global preflight]       [WU-4: batch dispatch] [WU-5: tests] → 3 parallel processors
Phase 3 (skill-protocol):        [WU-6: new SKILL section]      [WU-7: update quorum section]         → 2 parallel processors
Phase 4 (integration):           [WU-8: final test run + merge]                       → 1 processor
```

**Estimated track cost:** ~18k tokens · 3 waves · Oracle after each phase
