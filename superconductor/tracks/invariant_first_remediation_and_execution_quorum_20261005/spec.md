# Specification: Invariant-First Remediation & Adversarial Execution Quorum Protocols

**Track Identifier:** `invariant_first_remediation_and_execution_quorum_20261005`  
**Category:** Swarm Orchestration, Agentic Code Reliability & Anti-Drift Architecture  
**Target Milestone Phase:** Phase 1: Active Tracks (`core-foundation`)  
**Status:** In Review / Planned  

---

## 1. Overview & Problem Statement

In multi-agent swarms and iterative quorum remediation loops, autonomous coding agents (implementors and remediators) frequently exhibit a **local-patch pathology** when addressing reviewer findings. Instead of identifying and repairing root causes at their origin, agents generate the smallest diff possible that satisfies the immediate assertion or silences a failing line.

This creates a destructive cyclical drift ("whack-a-mole"):
1. **Defensive Nulling / Call-Site Patching:** When state fields are uninitialized or missing, remediators append fallback operators (e.g. `?? 0`, `|| []`, empty `catch {}`) at consumer call-sites rather than ensuring state is initialized correctly at lifecycle inception.
2. **Dual-Store Divergence:** When state exists in multiple entities (e.g., dual balance tables or separate cached sequences and conversation objects), remediators update one store and silence discrepancies with `console.warn` rather than enforcing an atomic dual-write transaction or single source of truth.
3. **Test Theatre & Fixture Tampering:** Under pressure to pass test suites, agents loosen harnesses (e.g., expanding wall-clock thresholds from `<75ms` to `<350ms`, or using `writeFileSync` inside test assertions to auto-generate missing snapshots).
4. **Mock vs. Runtime Environment Mismatches:** Tests passing against in-memory mocks fail in production because they bypass real SQLite `CHECK` constraints, foreign keys, or Cloudflare Workers isolate lifecycles (e.g., dropping `ctx.waitUntil` promises on bare `env`).
5. **Secondary Regressions in Fix Diffs:** Up to 80% of newly introduced bugs in late remediation cycles are introduced by the *previous cycle's remediator* attempting to patch an earlier finding.
6. **Headless Execution Drift:** When swarms run unsupervised (`--headless`), changes in orchestrator state machines, background task handlers, worktrees, and merge queues cause executions to drift off the rails, stall, or cycle endlessly without converging.
7. **Isolated Feature Planning & Unaccounted Knock-On Effects:** When a feature or protocol is introduced, agents traditionally plan in isolation without mapping the wider dependency graph—leaving downstream callers un-upgraded and missing opportunities where other parts of the system could benefit from the new capability.

---

## 2. Architecture Committee Recommendations

### 2.1 Dreamer Role (Architecture & Decoupling)
- **Centralized Prompt Dogma:** Standardize all remediation and review rules into single-source-of-truth markdown dogma specifications under `packages/superconductor-core/prompts/` (`remediation_dogma.md` and `adversarial_execution_dogma.md`).
- **Skill Reference Architecture:** The reviewer and remediator skills (`skills/adversarial-reviewer/SKILL.md`, `skills/correctness-reviewer/SKILL.md`, `skills/standalone-remediation/SKILL.md`) dynamically reference these centralized dogma files to eliminate prompt drift and redundant duplication across skills.
- **Inception-Point Enforcement:** Introduce strict structural constraints preventing remediators from touching downstream consumer files until the upstream data inception point (schema migrations, models, seed scripts) has been verified.
- **Blast Radius & Upgrade Beneficiary Analysis:** Incorporate Workspace Intelligence dependency graphs at the planning stage to automatically identify downstream knock-on effects and flag modules that should be upgraded to adopt the new feature.

### 2.2 Reviewer Role (Security, Performance & Execution Rigor)
- **Isolated Worktree Execution:** Ephemeral reproduction scripts must run in isolated Git worktrees managed via `worktrunk` (`wt`). This guarantees that reproduction runs do not contaminate the primary working tree or leave uncommitted artifacts.
- **Strict Execution Timeout:** Hard 30-second execution timeout on all reviewer reproduction scripts to prevent hanging or deadlocking the quorum loop.
- **Hybrid Preflight Gates:** Preflight checks must be enforced both at the swarm orchestration layer (`PreflightGate` in `packages/superconductor-core/src/orchestration/preflight-gate.ts`) and exposed via standalone CLI (`packages/superconductor-core/src/review/deterministic-preflight.ts` and `scripts/deterministic-preflight.ts`).
- **Diff-on-Diff Scrutiny:** Reviewers must explicitly analyze `git diff HEAD~1..HEAD` on multi-cycle remediations to catch regressions introduced by the preceding remediator agent.
- **Headless Guardrails & Watchdog:** Overhaul `swarm-execute --headless` with state verification checkpoints, hard iteration limits (circuit breakers), and structured morning briefings to prevent runaway execution.

---

## 3. Detailed Component & Protocol Specifications

### 3.1 Invariant-First Remediator Protocol (`remediation_dogma.md`)

Injected into the system prompt and instructions of all `superconductor-processor` and remediation agents:

1. **The Root-Cause & Inception Mandate (No Defensive Nulling):**
   - Forbid defensive patching (`?? 0`, `|| fallback`, empty `catch {}`) at the point of consumption when handling missing or invalid data.
   - Remediators must trace backward to the *inception point* of the data lifecycle (the signup handler, migration script, ingestion pipeline, or store initializer) and ensure valid state is persisted at origin.
2. **The "Single Source of Truth / Dual-Write" Invariant:**
   - If an architectural pattern maintains two representations of the same state, the remediator must:
     - Mutate both stores atomically within the same database transaction or state action, OR
     - Eliminate the redundant store and compute it on demand.
     - Logging warnings on divergence while continuing execution is strictly classified as a fatal defect.
3. **Execution Environment Fidelity:**
   - Remediators must test code against the exact production database migration chain (including SQLite table `CHECK` constraints, foreign keys, and indexes) rather than legacy or simplified test schemas.
   - Cloudflare Workers and Durable Objects: Asynchronous operations (caching, logging, metrics, DLQ alerts) must always receive and invoke execution context (`ctx.waitUntil`). Passing bare `env` and dropping promises across isolate boundaries is forbidden.
4. **Strict Sequence & Monotonicity Rules:**
   - Polling, sync, and CRDT handlers must enforce strict monotonicity (`headSeq > current.lastSeq`, not `headSeq !== current.lastSeq`). Stale asynchronous network responses must never overwrite newer real-time state.
5. **Zero Test-Fixture Weakening:**
   - Forbid auto-generating test fixtures or snapshots on the fly (e.g. `fs.writeFileSync` in test assertions). Missing fixtures must fail immediately.
   - Replace wall-clock assertions (`toBeLessThan(Xms)`) with deterministic algorithmic operation counters (e.g. counting inner loop executions or dot products) to eliminate parallel CI flakiness.

---

### 3.2 Adversarial Execution Reviewer Protocol (`adversarial_execution_dogma.md`)

Injected into the instructions for Quorum Reviewers (`adversarial-reviewer`, `correctness-reviewer`):

1. **Mandatory Execution Reproductions:**
   - Reviewers are prohibited from raising blocking findings based solely on visual inspection.
   - Every blocking finding must include an ephemeral reproduction script (TypeScript/Node or bash) executed in an isolated Git worktree via `worktrunk` (`wt`) that executes within 30 seconds and outputs real runtime error traces.
2. **End-to-End Lifecycle Tracing:**
   - Reviewers must trace data continuously across domain seams:
     $$\text{Ingestion} \longrightarrow \text{DB Transaction} \longrightarrow \text{RPC/Gateway} \longrightarrow \text{Store Hydration} \longrightarrow \text{UI Component}$$
   - Verify that column removals, schema migrations, and type changes do not break downstream queries or component state.
3. **Diff-on-Diff Scrutiny:**
   - On remediation cycles $\ge 2$, reviewers must audit `git diff HEAD~1..HEAD` to detect secondary bugs, unintended file modifications, or swallowed errors introduced by the prior remediation attempt.
4. **Mock Elimination:**
   - Reviewers must flag test suites that mock the primary component under test, test against outdated schema definitions, or pre-seed state to mask uninitialized fields.

---

### 3.3 Planning Intelligence: Blast Radius & Knock-On Upgrade Analyzer

Integrated into track inception and planning (`packages/superconductor-core/src/planning/blast-radius-analyzer.ts`):

1. **Knock-On Dependency Mapping:**
   - Uses Superconductor Intelligence symbol tables and import graphs to determine which files, interfaces, and call-sites depend on the components being created or altered.
2. **Beneficiary Identification ("Upgrade Opportunities"):**
   - Analyzes repository patterns to discover legacy call-sites that can be refactored to take advantage of the new feature or protocol.
   - Automatically populates an `## Impacted Downstream & Upgrade Opportunities` section in `spec.md` and generates corresponding tasks in `plan.md`.
3. **Planning Seams & Invariants:**
   - Generates `PROTECTED:` and `UPGRADES:` tags in `plan.md` to guarantee that all downstream beneficiaries are upgraded before track completion.

---

### 3.4 Headless Execution Hardening & Watchdog Protocol

Revamping `swarm-execute --headless` and `packages/superconductor-core/src/orchestration/micro-swarm-orchestrator.ts`:

1. **Watchdog Timer & Circuit Breaker:**
   - Enforce hard limits on headless execution cycles (max 3 remediation cycles, max 5 minutes per agent wave).
   - If an agent generates zero diff changes (`STAGNANT_DIFF`) or cycles repeatedly on the same failure, halt immediately with diagnostic triage rather than spinning indefinitely.
2. **State Checkpointing & Resumption:**
   - Persist FSM states to disk (`.superconductor/quorum/state.json`) after every subagent execution and review pass, enabling reliable pause and resume.
3. **Headless Morning Briefing:**
   - Produce a structured markdown summary artifact (`HEADLESS_REPORT_<timestamp>.md`) documenting all executed tasks, review verdicts, token expenditures, and any blocked issues requiring human sign-off.

---

### 3.5 Automated Quorum Preflight Gate (`PreflightGate` & `deterministic-preflight.ts`)

1. **AST & Regex Rules:**
   - Reject diffs that contain `fs.writeFileSync` or `fs.writeFile` calls within test directories (`test/`, `tests/`, `*.spec.ts`, `*.test.ts`).
   - Reject unhandled promises on bare `env` without `ctx.waitUntil` in Cloudflare Worker handlers.
   - Reject empty `catch {}` or `catch (_) {}` blocks that swallow runtime exceptions without logging or re-throwing.
   - Reject newly introduced fallback operators (`?? 0`, `?? ""`, `|| []`) on data domain models in fix diffs unless accompanied by upstream schema nullable declarations.
2. **Harness Integration:**
   - Enforce in `packages/superconductor-core/src/orchestration/preflight-gate.ts`.
   - Expose via CLI `scripts/deterministic-preflight.ts` and `packages/superconductor-core/src/review/deterministic-preflight.ts`.

---

## 4. Acceptance Criteria

- [ ] **AC 1: Centralized Dogma Specifications:** `packages/superconductor-core/prompts/remediation_dogma.md` and `packages/superconductor-core/prompts/adversarial_execution_dogma.md` are authored, tested, and referenced by `skills/adversarial-reviewer/SKILL.md`, `skills/correctness-reviewer/SKILL.md`, and `skills/standalone-remediation/SKILL.md`.
- [ ] **AC 2: Ephemeral Execution Harness:** Reviewers have an automated execution helper utility to run reproduction scripts in isolated `worktrunk` worktrees with a 30s timeout and capture runtime failure traces.
- [ ] **AC 3: AST & Regex Preflight Rules:** Both `PreflightGate` and `deterministic-preflight.ts` detect fixture tampering (`writeFileSync` in tests), bare `env` unawaited promises, empty `catch {}` swallows, and call-site fallback patches in PR/remediation diffs.
- [ ] **AC 4: Diff-on-Diff Scrutiny in Review Pipeline:** Quorum review pipeline automatically passes `HEAD~1..HEAD` diff to reviewers during multi-cycle remediation passes.
- [ ] **AC 5: Blast Radius & Knock-On Upgrade Analyzer:** Planning pipeline analyzes symbol references and import graphs to identify downstream beneficiaries and auto-generate upgrade tasks in `plan.md`.
- [ ] **AC 6: Headless Execution Hardening:** `swarm-execute --headless` incorporates watchdog timers, circuit breakers for stagnant diffs, state checkpointing, and structured execution summary reports.
- [ ] **AC 7: Unit & Integration Verification:** 100% test coverage on `PreflightGate`, `deterministic-preflight.ts`, worktree execution harness, and headless orchestrator guardrails.
- [ ] **AC 8: Remediation Benchmark Validation:** Benchmark demonstration proves cycle count reduction to $\le 2$ cycles by eliminating secondary regressions and headless drift.

---

## 5. Out of Scope

- Modifying underlying third-party AST parsers or creating custom compiler forks.
- Replacing TypeScript/ESLint core tooling with proprietary linters.
- Modifying production database engines beyond SQLite / Cloudflare D1 test harnesses.
