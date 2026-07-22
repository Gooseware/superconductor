# Specification: Pipeline Swarm Mode
## Swarm Orchestrator — Assembly-Line Scheduling for Sequential Tracks

---

## 1. Overview

The existing `swarm-orchestrate` skill fires agents in a **fan-out / parallel** pattern: it identifies independent tasks and dispatches them simultaneously. This works well when the plan has no inter-task dependencies.

However, **sequential tracks** (where each task depends on the previous one) currently execute with a single model — the reviewer only fires after ALL tasks are complete, so the user waits the full build time before getting any reviewed code.

This track adds a **Pipeline Mode** to `swarm-orchestrate`. In pipeline mode the swarm runs as an assembly line:

```
Task 1:  [Coder ────────────]
Task 2:  [Coder ────────────]  [Reviewer: T1 ──────]
Task 3:  [Coder ────────────]  [Reviewer: T2 ──────]
Task 4:  [Coder ────────────]  [Reviewer: T3 ──────]  [Oracle: score T1-T3]
Task 5:  [Coder ────────────]  [Reviewer: T4 ──────]
```

- **Coder** always works one task ahead of the Reviewer.
- **Reviewer** trails one task behind, running concurrently with the next Coder iteration.
- **Oracle** fires every N tasks (default: 3) as a periodic quality checkpoint — advisory score only, does not block progress.
- Review feedback is **advisory** — it is surfaced to the Coder as context for subsequent tasks but does not block the Coder.

---

## 2. Mode Auto-Detection

The orchestrator automatically selects the dispatch mode by inspecting the plan structure:

| Plan Structure | Selected Mode |
|---|---|
| Tasks have no cross-dependencies (DAG is flat) | `parallel` (existing behaviour) |
| Tasks form a linear chain (each depends on previous) | `pipeline` (new behaviour) |

No manual `mode:` flag is required. The Dreamer determines this during plan analysis.

---

## 3. Functional Requirements

### FR-1: Mode Selection
- The `swarm-orchestrate` SKILL.md must document both `parallel` and `pipeline` scheduling modes.
- The Dreamer role MUST detect plan linearity and announce the selected mode in the swarm log.

### FR-2: Pipeline Sliding Window
- While the Coder is executing Task N, the Reviewer MUST be executing a review of Task N-1 concurrently.
- The Reviewer review output (structured critique) is written to `swarm_log.md` and injected as an `--- Advisory Review ---` block into the Coder's context for Task N+1.

### FR-3: Oracle Cadence
- The Oracle fires every `oracleCadence` tasks (configurable, default: `3`).
- Oracle runs concurrently with the Coder + Reviewer for Task N when `N % oracleCadence === 0`.
- Oracle output is advisory only — a numeric score and brief rationale, appended to `swarm_log.md`.
- Oracle does NOT block task progression.

### FR-4: Escalation on Critical Reviewer Finding
- If the Reviewer assigns a severity of `CRITICAL` to a finding, the escalation mechanism (already implemented) is triggered.
- The Coder can be paused or replaced with a second Coder spawned to fix the critical issue before proceeding.

### FR-5: Swarm Log Schema Extension
The `swarm_log.md` must record pipeline-specific fields per task:
- `coder_task`: which task the Coder is on
- `reviewer_task`: which task the Reviewer is on
- `oracle_score`: last Oracle score (null if not yet fired)
- `advisory_context`: the review snippet passed to the next Coder invocation

---

## 4. Non-Functional Requirements

| NFR | Requirement |
|---|---|
| **SKILL.md line budget** | The updated `swarm-orchestrate/SKILL.md` must stay ≤ 500 lines (enforced by existing test) |
| **Backward compatibility** | Existing `parallel` mode behaviour must be fully preserved — no regressions |
| **No new dependencies** | Pipeline mode uses the same `invoke_subagent` + `send_message` primitives |
| **Graceful degradation** | If Reviewer takes longer than the Coder, the Coder waits at the next task start — never skips review |

---

## 5. Acceptance Criteria

- [ ] `swarm-orchestrate/SKILL.md` documents `parallel` and `pipeline` modes with a clear auto-detection rule.
- [ ] `swarm-orchestrate/SKILL.md` specifies the sliding window dispatch protocol (Coder N, Reviewer N-1, concurrent).
- [ ] `swarm-orchestrate/SKILL.md` specifies Oracle cadence (default: 3, advisory only).
- [ ] `swarm-orchestrate/SKILL.md` specifies how advisory review context is injected into subsequent Coder prompts.
- [ ] `swarm-orchestrate/SKILL.md` specifies the `CRITICAL` finding escalation path.
- [ ] `skill-line-count.test.ts` passes — `swarm-orchestrate/SKILL.md` ≤ 500 lines.
- [ ] All existing 171 tests continue to pass.

---

## 6. Out of Scope

- Implementing the actual subagent dispatch in the engine (this track is SKILL.md — the orchestration protocol document, not the engine code).
- Changing the Oracle's existing final-audit behaviour (invoked after all tasks complete in parallel mode).
- A UI or dashboard for pipeline progress.
