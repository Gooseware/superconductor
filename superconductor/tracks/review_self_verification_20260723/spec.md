# Spec: Review Self-Verification Gate

## Overview
Builds an enforcement mechanism for the §9 Mandatory Execution Verification Protocol. Before the standalone-review orchestrator can write or announce a verdict, it must pass a self-check that verifies the §9.4 Verdict Certification Block is present and non-empty in the generated report.

## Problem
The §9 protocol exists in adversarial-audit.md and standalone-review/SKILL.md but is instruction-only. A reviewer model can declare "APPROVED" or "CLEAN PASS" without including the mandatory execution evidence block. This produces grade inflation (Shenanigan #11) with no mechanical block.

## Functional Requirements

### FR-1: Verdict Certification Block Parser
- Script `scripts/review-self-check.ts` reads a review report markdown file
- Detects presence of `## Execution Evidence` section
- Validates that the section contains at least one non-empty `[x]` checked item
- Validates that `Terminal output:` line is present and not `[pasted inline above]` as placeholder-only

### FR-2: Gate Enforcement
- Returns exit code 0 if §9.4 block is present and valid
- Returns exit code 1 if block is missing or all items are unchecked `[ ]`
- Returns exit code 2 if block is present but `Terminal output:` line is blank/placeholder
- Prints a clear failure reason to stderr on non-zero exit

### FR-3: Integration into standalone-review Pipeline
- After the review report is written to disk (§6.0 Output Protocol), standalone-review SKILL.md instructs the orchestrator to run `npx tsx scripts/review-self-check.ts <report-path>`
- If exit code is non-zero: announce the failure reason and request the reviewer re-run with execution evidence
- If exit code is 0: proceed to announce the report path to the user

### FR-4: Bypass Flag
- `--skip-self-check` flag added to standalone-review input resolution
- Allows bypass for automated/headless contexts where execution evidence is captured separately
- When used, appends `[Self-Check Bypassed: --skip-self-check]` to the report header

## Non-Functional Requirements
- TypeScript, no new runtime dependencies
- Script is idempotent and read-only (never modifies the report file)
- Clear, actionable error messages pointing to §9 of adversarial-audit.md
- Runs in < 100ms on any size report file

## Acceptance Criteria
- [ ] `scripts/review-self-check.ts` exists and is executable via `npx tsx`
- [ ] Exit 0 when §9.4 block is present with at least one [x] and a non-placeholder Terminal output line
- [ ] Exit 1 when §9.4 block is missing entirely
- [ ] Exit 1 when §9.4 block is present but all items are unchecked [ ]
- [ ] Exit 2 when Terminal output line is missing or is bare placeholder text
- [ ] standalone-review/SKILL.md §6.0 updated to run self-check before announcing report path
- [ ] Test: valid certification block → exit 0
- [ ] Test: missing block → exit 1 with actionable stderr message
- [ ] Test: all-unchecked block → exit 1
- [ ] Test: missing terminal output → exit 2
- [ ] Test: --skip-self-check flag → exit 0 regardless of block content, adds bypass annotation

## Out of Scope
- Modifying review report content (self-check is read-only)
- Validating the quality of execution evidence (only structural presence is checked)
- Integration with CI/CD pipelines
