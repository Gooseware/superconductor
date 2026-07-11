# Implementation Plan: Production-Grade Verification

## Phase 1: Verification Module Scaffolding [checkpoint: 3e58352]

- [x] Task: Create `packages/engine/src/verification/` directory structure and type definitions [TIER-3] [ca50877]
    - [ ] `vlm-auditor.types.ts`: `DesignSchema`, `AuditResult`, `VisualDiff`, `AuditEvent`
    - [ ] `pbt.types.ts`: `PbtValidationResult`, `PropertyDefinition`, `PbtEvent`
    - [ ] `mutation.types.ts`: `MutationScore`, `SurvivingMutant`, `MutationReport`, `MutationEvent`
    - [ ] Add new event types to the engine's `EngineEvent` union
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Verification Module Scaffolding' (Protocol in workflow.md) [3e58352]

## Phase 2: DESIGN.md Schema & Headless VLM Auditor (FR-1)

- [ ] Task: Write failing tests for DESIGN.md schema parser and VLM auditor [TIER-3]
    - [ ] Test: Parse a valid `DESIGN.md` into typed `DesignSchema` (colors, spacing, typography)
    - [ ] Test: Reject `DESIGN.md` with missing required fields
    - [ ] Test: Playwright script captures DOM screenshot for a rendered component
    - [ ] Test: Audit report flags non-compliant color usage
    - [ ] Test: Iterative fix loop terminates after max 3 iterations
- [ ] Task: Implement DESIGN.md schema parser in `src/verification/design-schema.ts` [TIER-3]
    - [ ] Define strict schema: hex colors, spacing rhythm (4px/8px grid), typography scale, component dimensions
    - [ ] Parse and validate `DESIGN.md` markdown into typed `DesignSchema`
- [ ] Task: Implement headless VLM auditor in `src/verification/vlm-auditor.ts` [TIER-4]
    - [ ] Launch Playwright headless browser and navigate to component URL
    - [ ] Capture full-page and component-level screenshots
    - [ ] Construct VLM prompt: screenshot + `DesignSchema` tokens + compliance checklist
    - [ ] Parse VLM response into structured `AuditResult` (pass/fail per rule, suggestions)
    - [ ] Implement iterative fix loop: apply fix → re-render → re-audit (max 3)
    - [ ] Emit `AuditEvent` to the event store
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: DESIGN.md Schema & VLM Auditor' (Protocol in workflow.md)

## Phase 3: Property-Based Testing Integration (FR-2)

- [ ] Task: Write failing tests for PBT validator [TIER-3]
    - [ ] Test: Accept test file using `fast-check` property assertions
    - [ ] Test: Reject test file with only example-based assertions for in-scope module
    - [ ] Test: Out-of-scope modules are not flagged
    - [ ] Test: Validation report includes actionable PBT conversion suggestions
- [ ] Task: Implement PBT validator in `src/verification/pbt-validator.ts` [TIER-3]
    - [ ] Parse test files to detect assertion patterns (example-based vs property-based)
    - [ ] Check `fast-check` import presence and `fc.property()` / `fc.assert()` usage
    - [ ] Apply scope filter from engine config (which modules require PBT)
    - [ ] Generate actionable feedback for non-compliant test files
    - [ ] Emit `PbtEvent` to the event store
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: PBT Integration' (Protocol in workflow.md)

## Phase 4: Mutation Testing Integration (FR-3)

- [ ] Task: Write failing tests for Stryker mutation testing integration [TIER-3]
    - [ ] Test: Run mutation analysis on a single changed file
    - [ ] Test: Compute mutation score from Stryker JSON output
    - [ ] Test: Reject test suite with mutation score below threshold (>20% surviving)
    - [ ] Test: Accept test suite with mutation score at or above threshold
    - [ ] Test: Mutation report includes surviving mutant details
- [ ] Task: Implement mutation testing integration in `src/verification/mutation-runner.ts` [TIER-3]
    - [ ] Generate Stryker config scoped to changed files only (incremental)
    - [ ] Execute `npx stryker run` and parse JSON report
    - [ ] Compute mutation score and identify surviving mutants
    - [ ] Enforce configurable threshold; emit pass/fail with actionable feedback
    - [ ] Emit `MutationEvent` to the event store
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Mutation Testing' (Protocol in workflow.md)

## Phase 5: Integration Testing

- [ ] Task: Write integration tests for the full verification pipeline [TIER-3]
    - [ ] Test: VLM audit + PBT validation + mutation testing run in sequence during review phase
    - [ ] Test: Verification failure blocks task completion with structured report
    - [ ] Test: All verification events are persisted to the event store
- [ ] Task: Verify all unit tests pass with >80% code coverage [TIER-1]
- [ ] Task: Regression test: verify Phases 1-3 engine and existing commands still function [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration Testing' (Protocol in workflow.md)

## Phase 6: Integration & Finalization

- [ ] Task: Integrate track 'production_verification_20260710' into main branch. [TIER-1]
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Integration & Finalization' (Protocol in workflow.md)
