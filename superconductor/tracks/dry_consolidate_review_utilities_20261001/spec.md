# Track Specification: Consolidate Review Parsing & Block Extraction into Core Pipeline

## 1. Overview
This track focuses on consolidating the logic for extracting Markdown fenced blocks and parsing/aggregating review findings into a unified, authoritative interface within `@superconductor/core`. It replaces direct, fragile script-level dependencies on compiled build artifacts with a deeply cohesive `ReviewFindingsPipeline` module.

## 2. Architecture Committee Report
**Current State:**
- `scripts/aggregate-findings.ts` and `scripts/extract-fenced-block.ts` are shadow scripts operating outside the core abstraction.
- They import directly from `../packages/superconductor-core/dist/`, relying on transpiled artifacts which causes friction when unbuilt.

**Future State:**
- `@superconductor/core/src/review/` exports an authoritative `ReviewFindingsPipeline`.
- The pipeline encapsulates Markdown fence extraction, schema validation, finding mapping, and severity aggregation.
- The CLI scripts (or `@superconductor/core/cli` wrappers) consume this seam exclusively and support TypeScript execution (e.g., via `tsx`).

## 3. Functional Requirements
- **FR-1:** Create a consolidated `ReviewFindingsPipeline` interface within `@superconductor/core/src/review/`.
- **FR-2:** Move and integrate Markdown fence extraction logic into the new pipeline.
- **FR-3:** Move and integrate findings aggregation logic (schema validation, severity calculation, finding mapping) into the pipeline.
- **FR-4:** Refactor CLI scripts to utilize the new `ReviewFindingsPipeline` interface, supporting native execution.

## 4. Non-Functional Requirements
- **Zero Regression:** The output JSON schema for review findings must remain exactly identical to the previous implementation.
- **Backward Compatibility:** All existing consumers (e.g., `standalone-review`, `quorum-enforcer`) must function without modification to their invocation strategies.
- **Performance:** Ensure no significant latency is introduced during parsing or extraction.

## 5. Acceptance Criteria
- **AC-1:** `@superconductor/core/src/review/index.ts` exports `ReviewFindingsPipeline`.
- **AC-2:** Direct imports to `../packages/superconductor-core/dist/` in review-related scripts are entirely eliminated.
- **AC-3:** Markdown extraction works flawlessly for single and multi-block scenarios with validated JSON schemas.
- **AC-4:** Severity aggregation correctly maps and weights findings as per the original logic.
- **AC-5:** Running the refactored CLI script natively using `tsx` or standard Node processes produces correct outputs on a test corpus.

## 6. Out of Scope
- Adding new review rules or severity weightings.
- Modifying the AI prompt injection or review generation logic (only parsing/extraction is in scope).
