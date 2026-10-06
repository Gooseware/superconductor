# Spec: Invariant-First Remediation, Adversarial Execution Quorum & Post-Run Retrospective Protocols

**Track ID:** `invariant_first_remediation_and_execution_quorum_20261006`  
**Type:** Feature  
**Author:** Root Orchestrator (Session `df46793b-b514-49ad-b57d-cd2bf8f22587`)  
**Created:** 2026-10-06  
**Status:** Pending Approval  

---

## Project Constraints (from Notebook)

- ℹ️ **User Preference (`4e848aef-b869-42f0-9753-ed74726d9779`):**
  - **Milestone Phase Assignment:** Assigned to milestone phase `core-foundation` (Phase 1: Active Tracks).
- ℹ️ **User Preference (`a322b184-073a-49b7-bd4e-4ed16044f367`):**
  - **Preflight Check Integration:** Hybrid runner (`npm run check:preflight`) integrated into both Swarm Orchestrator preflight gate and Git commit hooks.
  - **Execution Reviewer Harness:** In-memory Node/TSX execution runner with ephemeral SQLite (`:memory:`) applying full production DDL and migrations.
  - **Prompt Dogma Injection Point:** Dual injection — statically documented in agent skills (`standalone-remediation`, `coding-agent`, reviewers) and dynamically injected at subagent dispatch time via `DomainSplitRemediationDispatcher`.
  - **Diff-on-Diff Scrutiny:** Strict zero-tolerance — any secondary flaw, swallowed error, or unintended file mutation in `HEAD~1..HEAD` triggers an immediate blocking finding.
  - **End-of-Run Retrospective:** Autonomous retrospective phase at the end of runs that digests execution notes and notebook entries, automatically generating and writing track proposals to the repository if systemic patterns or improvements emerge.

🔍 **Intelligence: LIVE | Project: superconductor | SHA: 7187ad6 | Age: 72h**

---

## 1. Overview & Problem Statement

In headless multi-agent swarms and multi-cycle review loops, implementors and remediators frequently exhibit a **local-patch pathology** when fixing reviewer findings. Rather than diagnosing and fixing root causes, agents make the smallest diff possible that silences a failing line or test. 

This causes cyclical drift ("whack-a-mole"):
1. **Defensive Nulling / Call-Site Patching:** When a variable or state field is unhydrated, remediators append fallback operators (e.g. `?? 0`, `|| []`, empty `catch {}`) at consumer sites rather than ensuring valid state is persisted at inception.
2. **Dual-Store Divergence:** When state exists in multiple entities (e.g., dual balance tables or separate cached sequences and conversation objects), remediators update one store and silence the discrepancy with `console.warn` rather than enforcing an atomic dual-write transaction or single source of truth.
3. **Test Theatre & Fixture Auto-Regeneration:** Remediators under pressure to pass suites often loosen test harnesses (e.g., bumping wall-clock thresholds from `<75ms` to `<350ms` under parallel load, or generating snapshots dynamically on the fly when missing using `writeFileSync`).
4. **Mock vs. Runtime Environment Mismatches:** Tests passing against in-memory mocks fail in production because they bypass real SQLite `CHECK` constraints, foreign keys, or Cloudflare Workers isolate lifecycles (e.g., dropping `ctx.waitUntil` promises on bare `env`).
5. **Secondary Regressions in Fix Diffs:** Up to 80% of newly introduced bugs in late remediation cycles are introduced by the *previous cycle's remediator* attempting to patch an earlier finding.
6. **Stateless Run Terminations (Missing Retrospective):** When a run completes, valuable operational insights, recurring agent friction, and emerging architectural needs are lost in ephemeral transcripts rather than being distilled into actionable new track proposals.

---

## 2. Proposed Architecture & Protocols

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SUPERCONDUCTOR ORCHESTRATOR                               │
└───────────────┬───────────────────────────┬────────────────────────────┬───────────────┘
                │                           │                            │
                ▼                           ▼                            ▼
┌───────────────────────────────┐ ┌───────────────────────────┐ ┌────────────────────────┐
│ INVARIANT-FIRST REMEDIATION   │ │ ADVERSARIAL EXECUTION     │ │ POST-RUN RETROSPECTIVE │
│ PROTOCOL (Processor Swarm)    │ │ REVIEWER PROTOCOL (Quorum)│ │ ENGINE (Closed Loop)   │
├───────────────────────────────┤ ├───────────────────────────┤ ├────────────────────────┤
│ • Root-Cause Inception Mandate│ │ • Ephemeral Repro Scripts │ │ • Transcript & Log Dig.│
│ • Atomic Dual-Write / SSOT    │ │ • End-to-End Tracing Seams│ │ • Notebook Trend Eval  │
│ • Production Schema Fidelity  │ │ • Diff-on-Diff Scrutiny   │ │ • Friction Clustering  │
│ • Monotonic Sequence Bounds   │ │ • Mock Elimination Audit  │ │ • Auto Track Generator │
│ • Zero Fixture Auto-Gen       │ │ • Zero Speculation Mandate│ │ • Inception to Repo    │
└───────────────────────────────┘ └───────────────────────────┘ └────────────────────────┘
```

---

## 3. Research Notes & Prior Art

1. **Design by Contract & Invariant-First Principles (Bertrand Meyer, 1988):**
   - Systems with explicit class/system invariants verified at inception boundaries prevent cascading state degradation.
   - Defensive nulling at consumer sites masks contract breaches and causes silent data corruption.
2. **Executable Verification vs Speculative Review (Meta SapFix, Google Tricorder):**
   - Static linter and reviewer warnings without execution evidence have high false-positive rates, exhausting developer cognitive bandwidth and triggering unnecessary churn.
   - Requiring reviewers to provide an ephemeral executable reproduction script (`.repro.ts`) proves the failure deterministically before blocking remediation.
3. **Diff-on-Diff Analysis in Iterative Code Repair:**
   - Multi-turn remediation loops suffer from "fix-induced regressions". Analyzing `git diff HEAD~1..HEAD` isolates secondary mutations and prevents scope contamination.
4. **Deterministic Test Assertions over Wall-Clock Timings:**
   - Wall-clock assertions (`toBeLessThan(Xms)`) fail intermittently in parallel virtualized CI environments. Replacing duration checks with deterministic operation counters (e.g. instruction step counts or loop iterations) creates non-flaky, reproducible gates.
5. **Experiential Learning & Continuous Reflection (Voyager / ExpeL / Reflexion):**
   - Multi-agent systems that autonomously reflect upon run completions, extract recurring failure patterns, and synthesize structured follow-up tracks achieve compound improvement without requiring manual intervention.

---

## 4. Architecture Committee Findings

### Dreamer (Architecture & Decoupling)
- **Decoupled Architecture:**
  - `InvariantRemediationDogma`: Core prompt instructions injected into both static skill markdown files and dynamic subagent dispatchers.
  - `AdversarialExecutionHarness`: A lightweight, isolated test helper module in `packages/superconductor-core/src/remediation/harness/` providing an ephemeral in-memory SQLite sandbox with real migrations and table constraints.
  - `DiffOnDiffAuditor`: A dedicated review step that compares `HEAD~1..HEAD` to detect secondary errors, unrequested file mutations, and swallowed exceptions.
  - `QuorumPreflightGate`: Fast static analysis scanner executing before test suites to detect `writeFileSync` in test assertions, bare `env` in Workers without `ctx.waitUntil`, and relaxed timeout thresholds.
  - `PostRunRetrospectiveEngine`: Executes at track completion, ingests notebook entries (`notebook_query`), remediation logs, and quorum reports, and outputs clean markdown track proposals (`superconductor/suggestions/<track_id>.md`) when systemic needs are discovered.

### Reviewer (Security, Performance & Dogma)
- **REV-1 (Execution Safety):** Ephemeral reproduction scripts executed by reviewers must run in a restricted sandbox with timeout bounds (default 10s), preventing hung processes or host filesystem corruption.
- **REV-2 (Zero Circular Dependencies):** The preflight gate and harness must reside strictly within `@superconductor/core` or `@superconductor/engine` without re-introducing circular imports. All new modules must obey one-way dependency flow (`core` <- `engine`).
- **REV-3 (No Slop Track Flooding):** The `PostRunRetrospectiveEngine` must enforce a strict quality gate and confidence threshold before writing track suggestions, preventing trivial or duplicated track spam in the repository.

---

## 5. Functional Requirements

### 5.1 Invariant-First Remediator Protocol
- **FR 1.1 Inception Mandate:** Forbid local defensive patching (`?? 0`, `|| []`, empty `catch {}`) at the point of consumption when handling missing or unhydrated data. Remediators must trace backward to the data lifecycle inception point (store initializer, migration script, or ingestion pipeline) and ensure valid state is persisted at origin.
- **FR 1.2 Atomic Dual-Write Invariant:** If state exists in two stores or representations, remediators must either mutate both stores atomically within the same database transaction/action or eliminate the redundant store. Logging warnings on divergence while continuing execution is strictly classified as a fatal defect.
- **FR 1.3 Execution Fidelity:** Code must be tested against the exact production database migration chain (including SQLite `CHECK` constraints, foreign keys, and indexes). For Cloudflare Workers and Durable Objects, asynchronous background work must always invoke `ctx.waitUntil`.
- **FR 1.4 Strict Monotonicity:** State sync, polling, and CRDT handlers must enforce strict monotonicity (`headSeq > current.lastSeq`). Stale asynchronous network responses must never overwrite newer real-time state.
- **FR 1.5 Zero Fixture Weakening:** Forbid auto-generating test fixtures or snapshots on the fly. Missing fixtures must fail immediately. Replace wall-clock assertions (`toBeLessThan(Xms)`) with deterministic algorithmic operation counters.

### 5.2 Adversarial Execution Reviewer Protocol
- **FR 2.1 Mandatory Execution Proofs:** Quorum reviewers are prohibited from raising blocking findings based solely on visual inspection. Every blocking finding must be accompanied by an ephemeral reproduction script (Node/TSX or shell) executed against the worktree, proving the defect with real runtime error traces.
- **FR 2.2 End-to-End Lifecycle Tracing:** Reviewers must trace data continuously across domain seams (`Ingestion -> DB Transaction -> RPC/Gateway -> Store Hydration -> UI Component`) to verify that column removals, schema migrations, and type changes do not break downstream queries or component state.
- **FR 2.3 Diff-on-Diff Scrutiny:** Reviewers must inspect `git diff HEAD~1..HEAD` to audit the previous remediator's changes for secondary flaws, unintended file modifications, or swallowed errors. Any detected secondary regression is an immediate blocking finding.
- **FR 2.4 Mock Elimination:** Reviewers must flag test suites that mock the primary component under test, test against outdated schema definitions, or pre-seed state to mask uninitialized fields.

### 5.3 Automated Quorum Preflight Checks
- **FR 3.1 Preflight Scanner:** Implement an automated AST/regex preflight scanner (`npm run check:preflight`) that scans diffs for:
  - Auto-fixture generation (e.g. `writeFileSync` or `fs.writeFile` called within test files or assertions)
  - Bare `env` usage in Cloudflare Workers handlers without invoking `ctx.waitUntil` for async promises
  - Relaxed timing assertions (e.g., bumping timeout thresholds or changing `toBeLessThan(N)` to larger values)
  - Empty `catch {}` blocks or swallowed errors
- **FR 3.2 Preflight Gate Enforcement:** Plug the preflight scanner into the Swarm Orchestrator preflight gate and provide a Git pre-commit hook integration.

### 5.4 Standardized Ephemeral Execution Harness
- **FR 4.1 In-Memory SQLite/D1 Harness:** Provide helper utilities in `packages/superconductor-core/src/remediation/harness/` to quickly scaffold ephemeral SQLite in-memory test environments with full production DDL and constraints applied.
- **FR 4.2 Script Execution Runner:** Provide a safe runner that executes reviewer reproduction scripts with timeout bounds and captures structured stdout/stderr traces for finding reports.

### 5.5 Post-Run Retrospective & Autonomous Track Suggestion Engine
- **FR 5.1 Post-Run Retrospective Phase:** Hook into track finalization and swarm batch completion to execute an autonomous retrospective.
- **FR 5.2 Evidence Ingestion:** Ingest session notes, quorum review transcripts, remediation logs, touched file diffs, and notebook entries (`notebook_query({ note_types: ["quorum", "warning", "procedure"] })`).
- **FR 5.3 Pattern & Friction Analysis:** Identify:
  1. **Swarm/Process Friction:** Recurring reviewer disagreements, remediation cycles >2, or prompt drift.
  2. **Codebase / Incidental Friction:** Code smell, legacy tech debt, missing tests, or sub-optimal patterns in files touched by implementors/remediators that were outside the track's strict scope.
- **FR 5.4 Dual-Taxonomy Track Suggestion Synthesis:**
  If the retrospective discovers improvements meeting the confidence threshold, synthesize structured track proposals categorized as:
  - **Category: `process` (Superconductor Swarm Improvements):** Framework enhancements, reviewer persona updates, new invariant checks, or preflight validators.
  - **Category: `codebase` (Project / Architecture Improvements):** Refactoring proposals, database index optimizations, decoupling legacy modules, or modernizing components touched during the run.
- **FR 5.5 Proposal Repository Persistence:** Save generated proposals to `superconductor/suggestions/<suggestion_id>.md` with full problem statement, scope, touched files, proposed architecture, and acceptance criteria.

---

## 6. Non-Functional Requirements

- **NFR 1 Performance:** Preflight scans must execute in $<1.5\text{s}$ over git diffs.
- **NFR 2 Sandbox Isolation:** Ephemeral reproduction scripts must execute in isolated worker processes with bounded memory and execution time ($\le 10\text{s}$).
- **NFR 3 Determinism:** Zero dependency on wall-clock time in test assertions; all tests must pass consistently regardless of CPU throttling or concurrency load.
- **NFR 4 Circular Dependency Protection:** Strictly maintain unidirectional imports (`@superconductor/engine` -> `@superconductor/core`); do not introduce package circularities.

---

## 7. Acceptance Criteria (ACs)

- [ ] **AC 1:** Remediator agent prompts in `DomainSplitRemediationDispatcher` and `skills/standalone-remediation/SKILL.md` explicitly enforce the Invariant-First Remediation Protocol and reject local defensive nulling.
- [ ] **AC 2:** Quorum Reviewers (`adversarial-reviewer`, `correctness-reviewer`) are equipped with the Ephemeral Execution Harness and require real reproduction output for all blocking findings.
- [ ] **AC 3:** The Diff-on-Diff Scrutiny engine audits `HEAD~1..HEAD` during multi-cycle remediation and blocks any secondary flaws or unrequested modifications.
- [ ] **AC 4:** The Quorum Preflight Gate (`npm run check:preflight`) detects and rejects test assertions that auto-regenerate snapshot files, empty catch blocks, and relaxed timing assertions.
- [ ] **AC 5:** The ephemeral SQLite/D1 in-memory harness accurately mirrors production schemas, foreign keys, and `CHECK` constraints.
- [ ] **AC 6:** The Post-Run Retrospective Engine executes at run completion, evaluates notebook notes and transcripts, and writes high-quality track suggestions to `superconductor/suggestions/` categorized by target domain: `process` (framework/swarm protocols) or `codebase` (incidental refactoring/tech-debt opportunities discovered in touched files).
- [ ] **AC 7:** Multi-track remediation benchmarks demonstrate reduced cycle counts (targeting $\le 2$ cycles per track) by eliminating secondary regression drift.

---

## 8. Out of Scope

- Modifying third-party database engines or external cloud providers.
- Rewriting legacy test suites that are not touched by active track diffs.
- Automatically applying unapproved track suggestions to `superconductor/tracks.md` without human authorization.
