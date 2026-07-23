# Spec: Coverage Stats Deduplication & Category Preservation

## Overview
Two semantic defects discovered in adversarial_code_review_v6.md (advisory severity) are addressed in this track. Both are low-risk, high-clarity improvements that fix misleading output for downstream consumers of the review engine's aggregation APIs.

## Defect 1: Misleading `files_examined` Count

### Problem
`aggregate-coverage-manifest.ts` computes `coverage_stats.files_examined` as the raw sum of examined array entries across all reviewers. If both the security reviewer and correctness reviewer examine `auth.ts`, the count shows 2 — but only 1 unique file was examined. The field name `files_examined` implies unique file count to any external consumer.

Executed proof:
```
r1 examined [scripts/a.ts, scripts/b.ts]  → 2 entries
r2 examined [scripts/a.ts]                → 1 entry
coverage_stats.files_examined = 3         (incorrect: only 2 unique files)
```

### Fix
- Rename internal accumulator to `total_examination_entries` (for backward compatibility as an additional field)
- Compute `files_examined` as the count of unique file paths across all examined arrays
- Add `total_examination_entries` as a separate field for callers that need the raw sum

## Defect 2: Silent Category Loss on Cross-Category Deduplication

### Problem
`aggregate-findings.ts` deduplicates findings by `(file, isLineRangeClose)` regardless of category. When a security finding and a correctness finding occupy the same line range in the same file, they are merged — the first-encountered category wins, and the second is permanently discarded.

Executed proof:
```
r1: file=x.ts, line=10, category=security, is_security_critical=true
r2: file=x.ts, line=10, category=correctness
Result: merged count=1, category=security, correctness concern LOST
```

### Fix
- Add `categories: string[]` field to `ReviewFinding` interface
- During deduplication, OR-merge the `categories` arrays
- Update `review-finding.schema.json` to add optional `categories` array field
- The primary `category` field remains for backward compat (first-encountered value)

## Non-Functional Requirements
- Backward compatible: existing `category` field unchanged in interface and schema
- All existing 17 engine tests must continue to pass
- TypeScript only, no new dependencies

## Acceptance Criteria
- [ ] `coverage_stats.files_examined` returns unique file count (not entry sum)
- [ ] `coverage_stats.total_examination_entries` added as the raw sum field
- [ ] `ReviewFinding` interface has `categories?: string[]` field
- [ ] Deduplication merges `categories` arrays via union (no duplicates)
- [ ] `review-finding.schema.json` updated with optional `categories` array
- [ ] All 17 existing engine tests pass
- [ ] Test: r1 examines [a.ts, b.ts], r2 examines [a.ts] → files_examined=2, total_examination_entries=3
- [ ] Test: security + correctness finding at same line → merged finding has categories=['security','correctness']
- [ ] Test: same category finding at same line → categories=['security'] (no duplicate)

## Out of Scope
- Changing deduplication key (still file + line_range proximity)
- Removing the primary `category` field
- Modifying the arbiter briefing format
