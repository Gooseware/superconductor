# Spec: Superconductor Kernel

**Track ID:** `superconductor_kernel_20260801`  
**Type:** Feature / Refactor  
**Date:** 2026-08-01  
**Status:** Planning

---

## Overview

This track delivers the **Superconductor Kernel** — a unified runtime package that absorbs the existing `design-os-kernel` MCP server, integrates Graphify-based code intelligence, and implements a deterministic quorum FSM that removes the need for human intervention in the swarm review loop.

It also absorbs the scope of the now-obsolete `scripted_swarm_orchestrator` track.

---

## [✓] Best Practices Researched  
## [✓] Architecture Committee Convened

---

## Architecture Committee Recommendations

### Dreamer (Architecture)
1. Rename `packages/design-os-kernel` → `packages/superconductor-kernel` (`@superconductor/kernel`). Keep all 14 Design OS MCP tools; group new Superconductor tools under a `kernel_` prefix to prevent namespace collision.
2. Graphify integration as a **batch subprocess**: invoke `graphify .` during the intelligence pipeline scan, cache resulting `graph.json` in memory (or SQLite for large repos). Serve graph queries from TS — no always-on Python daemon.
3. Quorum FSM as a deterministic state machine in `scripts/quorum-review.ts`: `IDLE → REVIEW_PENDING → ANALYSIS → REMEDIATION_REQUIRED → APPROVED / FAILED`. Max 3 remediation loops before escalation to `REQUIRES_HUMAN_INTERVENTION`.
4. New kernel MCP tools: `kernel_graph_get_node`, `kernel_graph_get_neighbors`, `kernel_graph_shortest_path`, `kernel_intelligence_get_hotspots`, `kernel_intelligence_get_dependency_graph`.

### Reviewer (Security & Performance)
1. **Graphify**: prefer separate MCP server (process isolation). Resolved to batch subprocess with in-memory cache — acceptable given non-blocking batch pattern.
2. **`chattr +a` REJECTED**: requires `CAP_LINUX_IMMUTABLE`, breaks in Docker/CI/rootless environments. Replace with `fs.appendFile` + `0600` permissions + startup crash-if-unconfigured.
3. **TOCTOU at MCP level**: interceptor enforcement must stay at `PolicyEngine` level (SDK call site), not MCP boundary. Kernel serves as config registry only.
4. **Package rename blast radius**: requires atomic codemod across `mcp_config.json`, GEMINI.md, all skill `.md` files, and `package.json`. Must not leave dangling references.
5. **Quorum circuit breaker**: `MAX_QUORUM_LOOPS = 3`. On limit, halt and emit `REQUIRES_HUMAN_INTERVENTION` state — do not silently continue or accept vague "Looks good" from reviewers.

---

## Research Notes

- **Graphify** (`graphifyy` on PyPI): Python 3.10+, tree-sitter-based AST analysis, ~40 languages. Produces `graph.json` with Symbol/File/Package nodes and `calls`, `imports`, `inherits`, `depends_on` edges. Leiden community detection for domain clustering. Centrality scoring for "God node" detection. Already compatible with `uv tool install graphifyy`.
- **MCP SDK** (`@modelcontextprotocol/sdk`): already present in design-os-kernel. Superconductor-kernel will reuse the same server bootstrap pattern.
- **Quorum FSM best practices**: finite max iterations with forced human escalation is standard in agentic CI/CD (similar to GitHub Actions retry limits). Deduplication check on findings prevents infinite "same finding" loops.
- **Audit log integrity without OS privileges**: `fs.appendFile` + mode `0o600` + startup validation (crash if writable by others) is the standard Node.js pattern for append-only logs in constrained environments.

---

## Functional Requirements

### FR-1: Package Rename — `design-os-kernel` → `superconductor-kernel`
- **FR-1.1**: Directory renamed from `packages/design-os-kernel` to `packages/superconductor-kernel`
- **FR-1.2**: `package.json` name changed to `@superconductor/kernel`, version bumped to `2.0.0`
- **FR-1.3**: Atomic codemod script updates all references: `mcp_config.json`, GEMINI.md, all skill `.md` files under `~/.gemini/config/plugins/`, and workspace `package.json` files
- **FR-1.4**: All 14 existing Design OS MCP tools retained and functional post-rename
- **FR-1.5**: MCP server identifier in AGY config updated from `design-os-kernel` to `superconductor-kernel`

### FR-2: Graphify Intelligence Integration
- **FR-2.1**: `uv tool install graphifyy` verified during setup; tool presence added to `tool-registry.ts`
- **FR-2.2**: New intelligence pipeline phase `p9_graphify` in `pipeline.ts` invokes `graphify .` as a subprocess, outputs `superconductor/intelligence/09_graphify_graph.json`
- **FR-2.3**: `domain-partitioner.ts` reads Leiden community data from `09_graphify_graph.json` instead of naive directory splitting
- **FR-2.4**: `task-complexity-scorer.ts` uses centrality scores from graph for `crossCuttingRisk` dimension
- **FR-2.5**: Incremental mode: `graphify --update` run on changed files via `incremental-updater.ts`

### FR-3: Kernel Graph MCP Tools
- **FR-3.1**: `kernel_graph_get_node(node_id)` — returns node metadata and edge list from cached graph
- **FR-3.2**: `kernel_graph_get_neighbors(node_id, max_depth)` — returns K-hop subgraph
- **FR-3.3**: `kernel_graph_shortest_path(source, target)` — returns shortest dependency path
- **FR-3.4**: `kernel_intelligence_get_hotspots(metric)` — returns top-N nodes by churn/complexity/pagerank
- **FR-3.5**: `kernel_intelligence_get_dependency_graph(community_id)` — returns community subgraph

### FR-4: Quorum FSM (absorbs scripted_swarm_orchestrator)
- **FR-4.1**: `scripts/quorum-review.ts` implements FSM: `IDLE → REVIEW_PENDING → ANALYSIS → REMEDIATION_REQUIRED → APPROVED | FAILED | REQUIRES_HUMAN_INTERVENTION`
- **FR-4.2**: Reviewers dispatched in parallel (Security, Correctness, Adversarial) via `invoke_subagent`
- **FR-4.3**: Remediators dispatched one per finding domain in parallel
- **FR-4.4**: `MAX_QUORUM_LOOPS = 3` hard circuit breaker; on limit, FSM transitions to `REQUIRES_HUMAN_INTERVENTION` and halts
- **FR-4.5**: Deduplication check: if reviewer finding matches a finding from a previous loop verbatim, it is rejected (forces reviewer to acknowledge fix)
- **FR-4.6**: FSM state persisted to `superconductor/logs/quorum-state.json` (survives process restart)
- **FR-4.7**: Exit condition is exclusively `APPROVED` verdict from all reviewers — never test pass rate alone
- **FR-4.8**: `RemediatorPromptBuilder` enriches every raw `QuorumFinding` into a structured 7-field `RemediatorPrompt` before dispatch: `TASK`, `SCOPE`, `EXCLUDED`, `PATTERN`, `ANTI_PATTERNS`, `EVIDENCE_REQUIRED`, `DEFINITION_OF_DONE`. Remediators MUST receive a structured prompt — raw Quorum finding text is never passed directly

### FR-5: Audit Log Hardening
- **FR-5.1**: Replace regex string-matching guards for `yolo-audit.log` in `interceptor.ts` with application-level append-only enforcement
- **FR-5.2**: `YoloAuditLogger` uses `fs.appendFile` exclusively with mode `0o600`
- **FR-5.3**: Startup validation in `YoloAuditLogger.init()`: crash with descriptive error if file permissions cannot be set or file is writable by group/others
- **FR-5.4**: Interceptor regex guards remain as defense-in-depth layer (not primary protection)

### FR-6: SWARM GUARDRAIL via PolicyEngine
- **FR-6.1**: `PolicyEngine` enforces block on `write_file`/`replace_file_content`/`multi_replace_file_content` targeting `packages/*/src/**` when mode is `TRACKED`
- **FR-6.2**: Block emits the required error message: `"[Superconductor] Rogue write attempt detected. Aborting. I must dispatch a Processor subagent instead."`
- **FR-6.3**: `superconductor-kernel` exposes `kernel_policy_get_mode()` MCP tool returning current IDLE/TRACKED/YOLO state
- **FR-6.4**: Tests cover root agent write attempts to `packages/*/src/**` in TRACKED mode

---

## Non-Functional Requirements

- **NFR-1**: Graphify subprocess completes within 30s for repos up to 50k LOC; cached reads are <10ms
- **NFR-2**: Kernel MCP server startup time <2s; tool call latency <100ms for graph queries (read from cache)
- **NFR-3**: Quorum FSM state file write is atomic (write to `.tmp`, rename to final)
- **NFR-4**: All 438 existing tests continue to pass post-rename
- **NFR-5**: The codemod script is idempotent (running twice produces no diff)
- **NFR-6**: `uv` and Python 3.10+ are prerequisites; setup fails with actionable error message if absent

---

## Acceptance Criteria

- [ ] AC-1: `packages/superconductor-kernel` exists; `packages/design-os-kernel` does not
- [ ] AC-2: All 14 Design OS MCP tools respond correctly under new server identifier `superconductor-kernel`
- [ ] AC-3: `graphify .` runs successfully; `09_graphify_graph.json` is generated
- [ ] AC-4: `domain-partitioner.ts` uses Leiden communities from graph (not directory names)
- [ ] AC-5: `quorum-review.ts` FSM runs 3 full loop cycles without user intervention in a test scenario
- [ ] AC-6: FSM halts at `REQUIRES_HUMAN_INTERVENTION` after `MAX_QUORUM_LOOPS = 3`
- [ ] AC-7: `YoloAuditLogger` startup crashes if file permissions cannot be enforced
- [ ] AC-8: Root agent write to `packages/superconductor-kernel/src/index.ts` in TRACKED mode is blocked with the required error message
- [ ] AC-9: Codemod script produces zero remaining references to `design-os-kernel` or `@design-os/mcp-server`
- [ ] AC-10: `scripted_swarm_orchestrator` track is closed/archived (absorbed)
- [ ] AC-11: All 438+ tests pass

---

## Out of Scope

- Deep Research integration (separate track: `deep_research_integration_20260728`)
- Graphify MCP server mode (batch subprocess is sufficient for this track)
- Vertex AI / Gemini API provider (separate track: `gemini_api_deep_research_20260728`)
- SIEM/external log aggregation for audit trail (future track)
- Mobile or browser clients for the MCP server
