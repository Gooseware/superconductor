# Superconductor Track Proposal: Invariant-First Remediation & Adversarial Execution Quorum Protocols

**Track Identifier:** `invariant_first_remediation_and_execution_quorum`  
**Category:** Swarm Orchestration, Agentic Code Reliability & Anti-Drift Architecture  
**Author / Origin:** Distilled from live multi-track quorum remediation cycles on the HNI production boundary migration.

---

## 1. Problem Statement: The "Whack-a-Mole" Remediation Defect

In headless multi-agent swarms and multi-cycle review loops, implementors and remediators frequently exhibit a **local-patch pathology** when fixing reviewer findings. Rather than diagnosing and fixing root causes, agents make the smallest diff possible that silences a failing line or test. 

This causes cyclical drift ("whack-a-mole"):
1. **Defensive Nulling / Call-Site Patching:** When a variable or state field is unhydrated, remediators append fallback operators (e.g. `?? 0`, `|| []`) at the consumer site rather than ensuring state is initialized correctly at lifecycle inception.
2. **Dual-Store Divergence:** When state exists in multiple entities (e.g., dual balance tables or separate cached sequences and conversation objects), remediators update one store and silence the discrepancy with `console.warn` rather than enforcing an atomic dual-write transaction or single source of truth.
3. **Test Theatre & Fixture Auto-Regeneration:** Remediators under pressure to pass suites often loosen test harnesses (e.g., bumping wall-clock thresholds from `<75ms` to `<350ms` under parallel load, or generating snapshots dynamically on the fly when missing).
4. **Mock vs. Runtime Environment Mismatches:** Tests passing against in-memory mocks fail in production because they bypass real SQLite `CHECK` constraints, foreign keys, or Cloudflare Workers isolate lifecycles (e.g., dropping `ctx.waitUntil` promises on bare `env`).
5. **Secondary Regressions in Fix Diffs:** Up to 80% of newly introduced bugs in late remediation cycles are introduced by the *previous cycle's remediator* attempting to patch an earlier finding.

> *"A stitch in time saves nine."* Fixing the underlying invariant at its inception point eliminates multiple cascading remediation cycles.

---

## 2. Proposed Architecture & Protocols

This track introduces two complementary, enforceable protocols into the Superconductor Swarm Orchestration Engine:

```
┌────────────────────────────────────────────────────────┐
│             SUPERCONDUCTOR ORCHESTRATOR               │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
┌─────────────────────────┐      ┌─────────────────────────┐
│  INVARIANT-FIRST        │      │  ADVERSARIAL EXECUTION  │
│  REMEDIATOR PROTOCOL    │      │  REVIEWER PROTOCOL      │
├─────────────────────────┤      ├─────────────────────────┤
│ • Root-Cause Mandate    │      │ • Ephemeral Repro Script│
│ • Atomic Dual-Write     │◄─────┤ • End-to-End Tracing    │
│ • Production Schema Run │      │ • Diff-on-Diff Scrutiny │
│ • Context Preservation  │      │ • Zero Speculation      │
│ • Algorithmic Bounds    │      │ • Mock Elimination     │
└─────────────────────────┘      └─────────────────────────┘
```

---

## 3. Component Specifications

### 3.1 Invariant-First Remediator Protocol

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
   - Forbid auto-generating test fixtures or snapshots on the fly. Missing fixtures must fail immediately.
   - Replace wall-clock assertions (`toBeLessThan(Xms)`) with deterministic algorithmic operation counters (e.g. counting inner loop executions or dot products) to eliminate parallel CI flakiness.

---

### 3.2 Adversarial Execution Reviewer Protocol

Injected into the instructions for all Quorum Reviewers (Security, Correctness, Adversarial, Regression, UX):

1. **Mandatory Execution Reproductions:**
   - Reviewers are prohibited from raising findings based solely on visual inspection. Every blocking finding must be accompanied by an ephemeral execution script (Node/TSX or shell) executed against the worktree, proving the defect with real runtime error traces.
2. **End-to-End Lifecycle Tracing:**
   - Reviewers must trace data continuously across domain seams:
     $$\text{Ingestion} \longrightarrow \text{DB Transaction} \longrightarrow \text{RPC/Gateway} \longrightarrow \text{Store Hydration} \longrightarrow \text{UI Component}$$
   - Verify that column removals, schema migrations, and type changes do not break downstream queries or component state.
3. **Diff-on-Diff Scrutiny:**
   - Reviewers must inspect `git diff HEAD~1..HEAD` to audit the previous remediator's changes for secondary flaws, unintended file modifications, or swallowed errors.
4. **Mock Elimination:**
   - Reviewers must flag test suites that mock the primary component under test, test against outdated schema definitions, or pre-seed state to mask uninitialized fields.

---

## 4. Key Deliverables

1. **Superconductor Engine Prompt Dogma:**
   - `packages/orchestrator/prompts/remediation_dogma.md`: Standardized invariant-first remediation rules injected into all remediation loops.
   - `packages/orchestrator/prompts/adversarial_execution_dogma.md`: Reviewer instructions mandating execution proofs and lifecycle tracing.
2. **Automated Quorum Preflight Checks:**
   - Preflight scripts to scan diffs for auto-fixture generation (`writeFileSync` in test assertions), bare `env` without `ctx.waitUntil`, empty `catch {}` blocks, and relaxed timing assertions.
3. **Standardized Execution Harness for Reviewers:**
   - Helper utilities in Superconductor to quickly scaffold ephemeral SQLite/D1 in-memory test environments with full production constraints applied.

---

## 5. Verification & Acceptance Criteria

- [ ] **AC 1:** Remediator agents prompt includes the Invariant-First Remediation Protocol and explicitly rejects local defensive nulling.
- [ ] **AC 2:** Reviewer agents are equipped with ephemeral script execution capabilities and require reproduction output for blocking findings.
- [ ] **AC 3:** Preflight git hooks or CI checks detect and reject test assertions that auto-regenerate snapshot files.
- [ ] **AC 4:** Multi-track remediation benchmarks demonstrate reduced cycle counts (targeting $\le 2$ cycles per track) by eliminating secondary regression drift.
