# Spec: ABI Retrospective Protocol Formalization

## Overview
Automating the "Always Be Improving" retrospective loop that currently requires manual agent execution after each track's review cycle. The protocol inductively builds institutional memory by extracting patterns from review artifacts and injecting them as new shenanigan rules into adversarial-audit.md.

## Problem
After every Superconductor Oracle review pass, a human (or agent) must manually:
1. Read all generated review artifacts (adversarial_code_review_vN.md)
2. Extract new failure patterns not yet in the shenanigan checklist
3. Write new inducted rows with provenance comments into adversarial-audit.md
4. Update standalone-review/SKILL.md and any other affected skills
5. Commit and push

This has been done 6 times in one session manually. Each round took ~10 minutes. At scale (multiple tracks/day), this represents significant unrecoverable review quality debt.

## Functional Requirements

### FR-1: Review Artifact Scanner
- Script reads all `adversarial_code_review_v*.md` artifacts in `.gemini/antigravity-cli/brain/<conversation-id>/`
- Extracts findings with severity 🟡 Medium or higher that do not already exist in `adversarial-audit.md`
- Produces a structured list of induction candidates with provenance (track_id, date, trigger description)

### FR-2: Shenanigan Induction Engine
- For each induction candidate, generates the inducted row format:
  `| N | **Pattern Name** | Description | <!-- Inducted: track_id — date — trigger -->`
- Appends rows to the living shenanigan table in `adversarial-audit.md`
- Guarantees no duplicate inductions (checks existing table before writing)

### FR-3: Skill Update Propagation
- After inducting new shenanigans, checks if `standalone-review/SKILL.md` §4.1 Embedded Shenanigan Checklist needs updating
- If new items were inducted, appends them to the embedded checklist
- Generates a human-readable summary of all changes made

### FR-4: Retrospective Report
- Writes a `retrospective-<track_id>-<date>.md` to the track directory
- Contents: findings extracted, shenanigans inducted, skills updated, review quality trend (v1 finding count vs vN finding count)

### FR-5: CLI Integration
- Exposed as a standalone script: `scripts/abi-retrospective.ts`
- Invocable as: `npx tsx scripts/abi-retrospective.ts --track <track_id> --artifacts-dir <path>`
- Defaults: artifacts-dir defaults to `~/.gemini/antigravity-cli/brain/` (scans most recent conversation)

## Non-Functional Requirements
- TypeScript, no new runtime dependencies (fs, path only)
- Idempotent: running twice produces no duplicate inductions
- Must not modify adversarial-audit.md if zero new patterns are found
- All operations logged to stdout with ✅/⚠️/❌ prefixes

## Acceptance Criteria
- [ ] `scripts/abi-retrospective.ts` exists and is executable via `npx tsx`
- [ ] Script reads review artifact files and extracts findings
- [ ] Script correctly identifies findings not yet in shenanigan table
- [ ] Script appends inducted rows with provenance comments
- [ ] Idempotency: running twice does not create duplicate rows
- [ ] Retrospective report is written to track directory
- [ ] All 6 shenanigans from review_panel_20260722 correctly identified as already-inducted (smoke test)
- [ ] Test: scan with zero new findings → adversarial-audit.md unchanged, report says "0 new patterns inducted"
- [ ] Test: scan with 1 new finding → exactly 1 row appended, report says "1 new pattern inducted"
- [ ] Test: duplicate induction → no second row written, idempotency confirmed

## Out of Scope
- Auto-generating new shenanigan descriptions (human-in-the-loop for wording)
- Git commit automation (human approves the commit)
- Modifying plan.md or spec.md files
