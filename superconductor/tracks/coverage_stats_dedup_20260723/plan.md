# Implementation Plan: Coverage Stats Dedup & Category Preservation

**Track ID:** coverage_stats_dedup_20260723
**Target Branch:** main

---

## Phase 0: Swarm Preflight
- [x] Task: Verify swarm-orchestrate skill is installed, confirm test suite baseline (17 tests passing) [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Coverage Stats Unique File Count
- [x] Task: Write failing tests for unique files_examined count [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: r1 examines [a.ts, b.ts], r2 examines [a.ts] → files_examined=2, total_examination_entries=3
    - [x] Test: zero reviewers → files_examined=0, total_examination_entries=0
    - [x] Test: single reviewer, single file → files_examined=1, total_examination_entries=1
- [x] Task: Implement unique file count in aggregate-coverage-manifest.ts [TIER-2] [AGENT:caduceus-processor]
    - [x] Collect all examined file paths across all manifests into a Set
    - [x] files_examined = Set.size (unique paths)
    - [x] total_examination_entries = raw sum (existing behavior preserved as new field)
    - [x] Update AggregatedCoverageResult interface
- [x] Task: Update standalone-review.test.ts assertion for files_examined (was 2, semantically still 2 for existing fixture) [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Coverage Stats' (Protocol in workflow.md)

## Phase 2: Category Preservation
- [x] Task: Write failing tests for cross-category deduplication [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: security + correctness finding at same line → categories=['security','correctness']
    - [x] Test: same category finding at same line → categories=['security'] (no duplicate)
    - [x] Test: single finding → categories=['<its category>']
- [x] Task: Add categories field to ReviewFinding interface in aggregate-findings.ts [TIER-2] [AGENT:caduceus-processor]
    - [x] Add `categories?: string[]` to ReviewFinding interface
    - [x] Initialize categories during dedup push: `copy.categories = [f.category]`
    - [x] Merge during dedup match: union of existing.categories and f.category
- [x] Task: Update review-finding.schema.json to add optional categories array [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Category Preservation' (Protocol in workflow.md)

## Phase 3: Integration & Finalization
- [x] Task: Run full test suite (all 17+ engine tests + standalone + e2e) and confirm zero regressions [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Integrate track 'coverage_stats_dedup_20260723' into main branch [TIER-1] [AGENT:caduceus-triage]
