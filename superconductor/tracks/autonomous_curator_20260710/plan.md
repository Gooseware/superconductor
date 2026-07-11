# Implementation Plan: Autonomous Curator

## Phase 1: Curator Module Scaffolding [checkpoint: 1c22749]

- [x] Task: Create `packages/engine/src/curator/` directory structure and type definitions [TIER-3] [4ecb696]
    - [ ] `telemetry.types.ts`: `AgyStatusPayload`, `TaskMetrics`, `TrackMetrics`, `MetricQuery`
    - [ ] `synthesizer.types.ts`: `PatternMatch`, `SynthesizedSkill`, `ConfidenceScore`, `SynthesisEvent`
    - [ ] Add new event types to the engine's `EngineEvent` union
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Curator Module Scaffolding' (Protocol in workflow.md) [1c22749]

## Phase 2: Telemetry Ingester (FR-1) [checkpoint: 0333d1e]

- [x] Task: Write failing tests for telemetry ingester [TIER-3] [9d848ec]
    - [ ] Test: Parse AGY status line JSON into typed `AgyStatusPayload`
    - [ ] Test: Compute Token-to-Success Ratio from task events
    - [ ] Test: Compute Edit Match Failure Rate from diff events
    - [ ] Test: Compute Escalation Frequency from routing events
    - [ ] Test: Compute Time-to-Green from TDD phase timestamps
    - [ ] Test: Store metrics in SQLite with proper indexing
    - [ ] Test: Query metrics by task ID, track ID, and time range
- [x] Task: Implement telemetry ingester in `src/curator/telemetry-ingester.ts` [TIER-3] [961e72a]
    - [ ] Parse AGY status JSON stream (line-delimited)
    - [ ] Subscribe to engine event bus for real-time metric computation
    - [ ] Compute all 4 derived metrics with rolling aggregation
    - [ ] Persist metrics to SQLite event store with dedicated indexes
    - [ ] Expose `queryMetrics(filter)` API for aggregation
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Telemetry Ingester' (Protocol in workflow.md) [0333d1e]

## Phase 3: Automated Skill Synthesizer (FR-2)

- [ ] Task: Write failing tests for skill synthesizer [TIER-3]
    - [ ] Test: Identify recurring manual intervention pattern from sample event log
    - [ ] Test: Identify recurring escalation trigger pattern
    - [ ] Test: Identify boilerplate task sequence pattern
    - [ ] Test: Generate valid SKILL.md with frontmatter and detection signals
    - [ ] Test: Confidence scoring ranks high-frequency patterns above low-frequency
    - [ ] Test: Skills above threshold are saved to the configured directory
    - [ ] Test: Skills below threshold are logged but not installed
    - [ ] Test: Idempotent: re-running on same data produces same skills
- [ ] Task: Implement skill synthesizer in `src/curator/skill-synthesizer.ts` [TIER-4]
    - [ ] Query event store for completed track logs
    - [ ] Pattern detection: cluster similar failure sequences, manual interventions, and repeated task structures
    - [ ] Generate SKILL.md content: concise instructions, code templates, detection signals
    - [ ] Compute confidence score based on pattern frequency, recency, and consistency
    - [ ] Save skills above threshold to configurable directory
    - [ ] Support scheduled execution mode via a `runAnalysis()` entry point
    - [ ] Emit `SynthesisEvent` for each generated skill
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Automated Skill Synthesizer' (Protocol in workflow.md)

## Phase 4: Integration Testing

- [ ] Task: Write integration tests for the curator pipeline [TIER-3]
    - [ ] Test: Telemetry ingester + event store + synthesizer produce skills from a sample track history
    - [ ] Test: Generated skills pass schema validation
    - [ ] Test: Metrics dashboard query returns correct aggregates across multiple tracks
- [ ] Task: Verify all unit tests pass with >80% code coverage [TIER-1]
- [ ] Task: Regression test: verify Phases 1-4 engine and existing commands still function [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Integration Testing' (Protocol in workflow.md)

## Phase 5: Integration & Finalization

- [ ] Task: Integrate track 'autonomous_curator_20260710' into main branch. [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration & Finalization' (Protocol in workflow.md)
