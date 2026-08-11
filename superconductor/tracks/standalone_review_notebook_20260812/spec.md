# Spec: Standalone Review Evolution + Superconductor Notebook
**Track ID:** `standalone_review_notebook_20260812`
**Type:** Feature
**Created:** 2026-08-12

## Overview
Three-phase system upgrade closing the intelligence-theatre gap, adding persistent institutional memory, and automating the quorum remediation loop.

**Phase 1 — Superconductor Notebook (LanceDB):** Persistent semantic memory across sessions. 9 note types. Global store (preferences/design/style) + per-project store (quorum/failure/dependency). Mandatory MCP tool calls — not prose.

**Phase 2 — Standalone Review Quorum Loop:** Automatic quorum → remedy → quorum FSM until unanimous green. Domain-weighted codebase sweep using existing intelligence/domain-partitioner.ts. Sequential domain processing ordered by priority score.

**Phase 3 — Enforcement Hardening:** `kernel_intelligence_status` MCP replaces prose preflight. `PreflightGate` and `SignOffGate` as hard gates. Git pre-commit hook enforces sign-off independently.

## Core Principle: No Theatre
Every gate is mechanically enforced. No new prose-only instructions permitted.

| ❌ Theatre | ✅ Enforced |
|---|---|
| "call getSuperconductorHome()" | `kernel_intelligence_status` MCP tool |
| "emit the degradation banner" | Correctness reviewer AC: header absent = blocking FAIL |
| "query the notebook before starting" | `notebook_query` MCP tool — required call |
| "write a note when done" | `notebook_write` MCP tool — required call |
| "mark track complete after Oracle" | `SignOffGate.requireUserApproval()` — throws if skipped |

## Architecture Committee Findings
- **Dreamer:** Phase inversion — Notebook before Quorum Loop. LibSQL for FSM state (ACID). `INotebookProvider` interface for testability. `AbstractGate` base class. Token-budget reranker (800 tokens).
- **Reviewer (REV-1):** REJECT not truncate at 280 chars — throw `ValidationError`.
- **Reviewer (REV-2):** SignOffGate bypass via raw `git commit` — enforce via pre-commit hook with SHA-256 approval token.
- **Both:** LibSQL for FSM state. MCP schema-level enforcement on 3-note limit.

## Research Notes
- **FSM:** INIT→REVIEWING→NEEDS_FIXES→REMEDIATING→VERIFYING→PASSED/HALTED. Circuit breaker on identical AST diff hashes (STAGNANT_DIFF_HALT).
- **LanceDB:** ONNX bge-small-en-v1.5 (384-dim, local). Lazy-loaded on first query. Hybrid RRF (vector cosine + BM25 Tantivy). SHA-256 + 0.95 cosine dedup.
- **Domain scoring:** S = 0.4×Hotspot + 0.35×FanIn + 0.25×GitChurn(90d).
- **Sign-off:** Headless = branch stays unmerged. Interactive = ask_user dialog. `--no-signoff` opt-out logs to yolo-audit.log.

## Package Structure
- `packages/notebook-store/` — LanceDB, INotebookProvider, embedding, hybrid search
- `packages/quorum-fsm/` — FSM state machine, LibSQL persistence, gate logic
- `packages/superconductor-core/` — existing, receives AbstractGate + PreflightGate + SignOffGate
- `packages/superconductor-kernel/` — new MCP tools: notebook_query, notebook_write, notebook_summary, kernel_intelligence_status

## Notebook Storage
- **Global** (`~/.superconductor/notebook/`): preference, design, style, procedure
- **Per-project** (`superconductor/notebook/`): quorum, failure, dependency, warning, spec

## Note Authority Levels
| Level | Types | Who can write |
|-------|-------|--------------|
| Authoritative | preference, design | User-confirmed only |
| System-generated | quorum, style | Auto-written on quorum resolve (requires reviewer_token) |
| Agent-written | spec, failure, dependency, procedure, warning | Any agent, max 3/invocation |

## Sign-Off Gate Behaviour
- **Headless:** Branch never auto-merges. Report presented. User explicitly asks to merge.
- **Interactive:** `ask_user()` dialog with diff summary, test counts, quorum rounds, resolved findings.
- **`--no-signoff`:** Bypass gate, log to `yolo-audit.log`.
- **Git enforcement:** Pre-commit hook independently verifies SHA-256 signed approval token.

## Acceptance Criteria

### Phase 1 — Notebook
- [ ] AC-1: packages/notebook-store with INotebookProvider interface (injectable for tests)
- [ ] AC-2: NotebookWriter.write() persists to LanceDB with lazy ONNX embedding
- [ ] AC-3: NotebookReader.query() returns top-5 hybrid RRF results
- [ ] AC-4: Global store for preference/design/style; per-project for quorum/failure/dependency
- [ ] AC-5: Content > 280 chars throws ValidationError (no truncation)
- [ ] AC-6: Max 3 agent-written notes per invocation enforced at MCP schema level
- [ ] AC-7: SHA-256 + 0.95 cosine dedup — merge not insert
- [ ] AC-8: notebook_query, notebook_write, notebook_summary MCP tools in superconductor-kernel
- [ ] AC-9: Dreamer queries preference+design notes when writing new spec
- [ ] AC-10: Fallback to LibSQL FTS5 when ONNX unavailable

### Phase 2 — Quorum Loop
- [ ] AC-11: packages/quorum-fsm with LibSQL state persistence (SHA-256 integrity envelope)
- [ ] AC-12: STAGNANT_DIFF_HALT circuit breaker on identical diff AST hashes
- [ ] AC-13: --branch triggers automatic quorum loop (not just one pass)
- [ ] AC-14: NEEDS_FIXES → DomainSplitRemediationDispatcher → fresh zero-bias quorum
- [ ] AC-15: Max 5 cycles before Oracle escalation
- [ ] AC-16: Quorum RESOLVED finding auto-writes quorum note (requires reviewer_token)
- [ ] AC-17: --codebase domains scored by 0.4×H + 0.35×F + 0.25×C, processed sequentially
- [ ] AC-18: Cross-domain Oracle synthesis after all domains green

### Phase 3 — Enforcement
- [ ] AC-19: kernel_intelligence_status MCP returns {status, age_days, commits_behind}
- [ ] AC-20: implement/SKILL.md §0.5-0.6 replaced with mandatory MCP calls + required header block
- [ ] AC-21: Correctness reviewer: preflight header absent = blocking FAIL
- [ ] AC-22: PreflightGate.assert() throws PreflightSkippedError if MCP calls not in state
- [ ] AC-23: SignOffGate gates every merge (headless=unmerged, interactive=ask_user)
- [ ] AC-24: WorkspaceGuard.commitToMain() throws SignOffRequiredError if sign-off absent
- [ ] AC-25: Git pre-commit hook verifies SHA-256 approval token independently
- [ ] AC-26: --no-signoff logs to yolo-audit.log

## Out of Scope
- UI for browsing notebook notes (CLI only)
- Multi-user / remote notebook sync
- Changes to --fast or --pr modes
- Breaking changes to existing Flash reviewer prompts
- HNI project implementation (separate track)
