# Specification: Autonomous Curator

## Overview

Phase 5 closes the feedback loop by making Superconductor a self-improving system. It ingests runtime telemetry (token usage, success rates, failure patterns) and automatically synthesizes optimized agent skills from historical track data. The result: each completed track makes all future tracks faster and cheaper.

This is **Phase 5** of a 5-phase transformation roadmap.

## Architecture

- **Language:** TypeScript (Node.js)
- **Module Location:** `packages/engine/src/curator/` (extends engine)
- **Dependencies:** Phase 3 event store (SQLite), Phase 2 routing telemetry

## Functional Requirements

### FR-1: Telemetry Ingester
- Parse AGY's real-time status line JSON for quota usage, context window size, and execution state
- Compute derived metrics per task and per track:
  - **Token-to-Success Ratio:** total tokens consumed / tasks completed
  - **Edit Match Failure Rate:** proposed diffs that failed to apply / total diffs
  - **Escalation Frequency:** model upgrades triggered / total tasks
  - **Time-to-Green:** average time from Red phase to Green phase per task
- Store all metrics in the Phase 3 SQLite event store with proper indexing
- Expose a query API for metric aggregation across tracks

### FR-2: Automated Skill Synthesizer
- Analyze completed track event logs to identify recurring patterns:
  - Repeated manual interventions for the same error class
  - Common escalation triggers that could be pre-empted
  - Boilerplate task sequences that appear across tracks
- Generate optimized, token-efficient markdown skill files (`.md`) with:
  - Concise system prompt instructions
  - Code templates for the identified pattern
  - Detection signals for automatic activation
- Save synthesized skills to the configured skills directory
- Support a scheduled background mode: run weekly analysis via a cron-like trigger
- Include a confidence score for each synthesized skill; only auto-install above threshold (configurable)

## Non-Functional Requirements

- **NFR-1:** Telemetry ingestion must not add >10ms overhead per event
- **NFR-2:** Skill synthesis must be idempotent — re-running on the same data produces the same skills
- **NFR-3:** Synthesized skills must pass the existing skill schema validation

## Acceptance Criteria

1. Telemetry ingester correctly parses AGY status JSON and computes all 4 derived metrics
2. Metrics are queryable by task ID, track ID, and time range
3. Skill synthesizer identifies at least one recurring pattern from a sample event log
4. Generated skill files conform to the SKILL.md schema (frontmatter + markdown body)
5. Confidence scoring correctly ranks synthesized skills
6. Skills at or above the threshold are saved to the correct directory
7. Scheduled mode executes analysis on a configurable interval
8. All unit tests pass with >80% coverage

## Out of Scope

- Real-time telemetry dashboards or web UI
- Cost alerting or budget enforcement
- Skill marketplace or sharing across projects
