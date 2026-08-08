---
name: standalone-remediation
description: >
  Runs the Swarm Remediation Engine against an existing review report.
  Spawns domain-specialized agents to fix findings, calls Deep Research for
  complex issues, and validates all fixes via zero-bias re-review before merge.
  Use when you want to (re-)remediate findings from a prior review run without
  re-running the full review pipeline.
triggers:
  - /superconductor:remediate
  - "remediate findings"
  - "fix review findings"
  - "run remediation"
---

## 1.0 Input Resolution Protocol

- Accept review report path as argument: `/superconductor:remediate [path-to-review-report.md]`
- If no path provided: scan for most recent review report in project root (glob: `*review-report*.md`, `*findings*.md`)
- Validate: file must contain `json:review-findings` fenced block
- Extract findings from the `json:review-findings` block
- Parse severity, ruleId, file, description per finding
- Emit: `✓ Found <N> findings in <report-file> (<CRITICAL: X, HIGH: Y, MEDIUM: Z>)`

## 2.0 Findings Parser

- Parse the `json:review-findings` block from the review report
- Map each finding to `FindingFingerprint: { id, severity, ruleId, file }`
- Filter by severity if `--severity=<level>` flag provided (e.g. `--severity=CRITICAL,HIGH`)
- Group by domain using `DomainClassifier`
- Emit domain assignment summary table

## 3.0 Swarm Launch Protocol

- Instantiate `RemediationOrchestrator` with parsed findings
- Pass `DeepResearchEscalationHandler` as option
- Pass `BiasIsolatedReviewGate` as option
- Call `orchestrator.start()`
- Monitor FSM state and emit progress updates
- In `--headless` mode: suppress interactive prompts, auto-choose defaults
- Hard-block: if any CRITICAL finding reaches HUMAN_REQUIRED, halt and present `Acknowledge & Abort` | `Acknowledge & Revert`

## 4.0 Output Protocol

- Write `remediation_log.md` alongside the input review report
- Emit final summary table:
  ```
  | Finding ID | Domain | Outcome | Attempts | Deep Research |
  |------------|--------|---------|----------|---------------|
  ```
- Exit codes:
  - `0`: All findings RESOLVED
  - `1`: Some findings ESCALATED (not CRITICAL)
  - `2`: HUMAN_REQUIRED (CRITICAL unresolved — pipeline blocked)

## 5.0 Flag Reference

| Flag | Effect |
|------|--------|
| `--severity=<level>` | Only remediate findings at or above severity |
| `--domain=<domain>` | Only remediate findings in specified domain |
| `--dry-run` | Show remediation plan without applying fixes |
| `--headless` | Non-interactive mode (auto-defaults) |
| `--stats` | Include token usage in remediation_log.md |
| `--no-deep-research` | Skip deep research escalation (stay in-swarm only) |
