# Specification: Token Economics & Dynamic Routing

## Overview

Phase 2 optimizes Superconductor's token consumption and model routing. It extends the Phase 1 engine with intelligent cost management: trimming unnecessary AGY tool surfaces, dynamically escalating from cheap to frontier models on repeated failures, and leveraging LLM prompt caching via structured payload ordering.

This is **Phase 2** of a 5-phase transformation roadmap.

## Architecture

- **Language:** TypeScript (Node.js)
- **Module Location:** `packages/engine/src/routing/` (extends the Phase 1 engine module)
- **Dependencies:** Phase 1 engine (DAG scheduler, dispatcher)

## Functional Requirements

### FR-1: Tool Surface Analyzer
- Query active AGY plugins/MCP servers via `agy plugin list`
- Accept a per-DAG-node tool allowlist derived from the task's `role` and `files[]` metadata
- Generate `--disable-plugin` flags for each subagent spawn to trim unused tool definitions
- Emit telemetry events with estimated token savings per trim

### FR-2: Dynamic Escalation Router
- Monitor subagent task outcomes against TDD cycle results (Red→Green pass/fail)
- Track escalation signals with configurable thresholds:
  - Consecutive Red→Green failures (default: 3 strikes)
  - Token budget exceeded without task completion
  - Edit match failures (diffs failing to apply cleanly)
- On threshold breach: kill the current subagent, escalate the task context to a frontier model (`--model pro`)
- On success after escalation: downshift subsequent tasks back to the cheaper model
- Maintain an escalation history log per track for post-mortem analysis

### FR-3: Prefix Prompt Cache Manager
- Structure subagent prompt payloads with a deterministic prefix ordering:
  1. Static context: `AGENTS.md`, design docs, repo AST maps
  2. Semi-static context: Phase-level instructions, file contents
  3. Dynamic context: Task-specific instructions, delta updates
- Compute a content hash for each prefix segment to detect cache invalidation
- Emit telemetry: estimated cache hit ratio and input token savings

## Non-Functional Requirements

- **NFR-1:** Must integrate with the Phase 1 dispatcher without breaking existing dispatch flow
- **NFR-2:** Escalation routing must be pluggable — custom policies can be injected
- **NFR-3:** All routing decisions must be logged as structured events for Phase 5 telemetry

## Acceptance Criteria

1. Tool surface analyzer correctly identifies and disables unused plugins for a given task
2. Escalation router triggers model upgrade after 3 consecutive TDD failures
3. Escalation router downgrades model after successful task completion post-escalation
4. Combined signal thresholds are configurable via engine config
5. Prompt payloads maintain deterministic prefix ordering across identical task contexts
6. All unit tests pass with >80% coverage

## Out of Scope

- Actual AGY quota API integration (uses mocked telemetry)
- Real-time cost dashboards (Phase 5)
- Billing alerts or hard budget caps
