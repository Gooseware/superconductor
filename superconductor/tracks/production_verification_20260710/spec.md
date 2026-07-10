# Specification: Production-Grade Verification

## Overview

Phase 4 eliminates the AI self-validation bias by introducing three independent verification layers: headless visual auditing against a strict design spec, property-based testing to replace fragile example-based tests, and mutation testing to verify test suite quality. This ensures AI-generated code meets a human-auditable quality bar.

This is **Phase 4** of a 5-phase transformation roadmap.

## Architecture

- **Language:** TypeScript (Node.js)
- **Module Location:** `packages/engine/src/verification/` (extends engine)
- **Dependencies:** Phase 1 engine (scheduler, dispatcher), Phase 3 event store (for audit trail)

## Functional Requirements

### FR-1: DESIGN.md Schema & Headless VLM Auditor
- Define a strict `DESIGN.md` schema: hex color codes, spacing/padding rhythms, typography scale, component dimensions
- During the `/review` phase, automatically run a Playwright headless browser script to capture DOM screenshots of rendered components
- Feed screenshots + `DESIGN.md` tokens to AGY's vision capabilities for pixel-level compliance auditing
- Generate a structured audit report: pass/fail per rule, visual diff highlights, suggested fixes
- Support iterative fix loop: agent applies fixes, re-renders, re-audits (max 3 iterations)

### FR-2: Property-Based Testing (PBT) Integration
- Provide a PBT task template that instructs subagents to define mathematical invariants instead of example-based assertions
- Integrate with `fast-check` (TypeScript PBT framework)
- Validate that test files use PBT patterns for core logic modules (configurable scope)
- Reject example-based-only test suites for modules in the PBT scope with actionable feedback

### FR-3: Mutation Testing Integration
- Integrate Stryker mutation testing into the verification pipeline
- After tests pass, run mutation analysis on changed files
- Compute mutation score; reject test suites that survive >20% of mutations (configurable threshold)
- Generate a mutation report with surviving mutants and suggested assertion improvements
- Emit verification events to the Phase 3 event store

## Non-Functional Requirements

- **NFR-1:** VLM audit must complete within 60 seconds per component
- **NFR-2:** Mutation testing must be incremental — only test changed files, not the entire codebase
- **NFR-3:** All verification results must be persisted as git notes on the relevant commit

## Acceptance Criteria

1. `DESIGN.md` schema validates correctly against a sample design spec
2. VLM auditor captures screenshots and produces structured compliance reports
3. PBT validator correctly rejects example-only tests for in-scope modules
4. PBT validator accepts test files using `fast-check` generators and property assertions
5. Stryker integration runs incrementally on changed files and produces mutation scores
6. Mutation threshold enforcement rejects weak test suites with actionable feedback
7. All verification events are persisted to the event store
8. All unit tests pass with >80% coverage

## Out of Scope

- Visual regression testing (screenshot diffing across commits)
- AI-generated design specs (DESIGN.md is human-authored)
- Cross-browser visual testing
