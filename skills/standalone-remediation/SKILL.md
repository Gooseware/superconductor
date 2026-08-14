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

## 2.0 Findings Parser & Domain Grouping

- Parse the `json:review-findings` block from the review report
- Map each finding to `FindingFingerprint: { id, severity, ruleId, file, domain }`
- Filter by severity if `--severity=<level>` flag provided (e.g. `--severity=CRITICAL,HIGH`)
- Group by domain using `DomainClassifier` across standard domains:
  - `security`: `auth/`, `security/`, `middleware/`, `session/`, `jwt/`, `credentials/`
  - `logic`: `src/logic/`, `services/`, `controllers/`, `handlers/`, `core/`
  - `tests`: `test/`, `tests/`, `__tests__/`, `*.spec.*`, `*.test.*`
  - `types`: `types/`, `*.d.ts`, `interfaces/`
  - `config`: `config/`, `*.json`, `*.yaml`, `*.yml`, `*.toml`
- Emit domain assignment summary table

## 3.0 Autonomous Remediation Loop Execution

- The Swarm Remediation Engine operates in a continuous automated loop:
  1. **Check findings:** If zero findings or status is `RESOLVED`, stop immediately (all green).
  2. **Domain-split dispatch:** If findings exist (`NEEDS_FIXES`), dispatch parallel remediator subagents in isolated git worktrees using `DomainSplitRemediationDispatcher`.
  3. **Zero-bias re-review:** Re-run fresh Quorum review on updated diff.
  4. **Loop:** Repeat until 100% green or circuit breaker trips.
- **Circuit breaker:** Hard cap of 3–5 cycles or instant halt on `STAGNANT_DIFF`.
- **Deep Research Escalation:** Triggered when circuit breaker is reached.
- In `--headless` mode: suppress interactive prompts, auto-choose defaults.
- Hard-block: if any CRITICAL finding reaches HUMAN_REQUIRED, halt and present `Acknowledge & Abort` | `Acknowledge & Revert`.

## 4.0 Output Protocol

- Write `remediation_log.md` alongside the input review report
- Emit final summary table:
  ```
  | Finding ID | Domain | Outcome | Attempts | Deep Research |
  |------------|--------|---------|----------|---------------|
  ```
- Exit codes:
  - `0`: All findings RESOLVED (100% green)
  - `1`: Some findings ESCALATED / HALTED (not CRITICAL)
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
