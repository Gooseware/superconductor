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

## Authoritative Remediation Dogma

All remediation agents and workflows MUST strictly adhere to [`packages/superconductor-core/prompts/remediation_dogma.md`](file:///home/gooseware/repos/gemini/extensions/superconductor/packages/superconductor-core/prompts/remediation_dogma.md) as the authoritative remediation dogma.

Shallow call-site patches (such as appending `?? 0`, `|| []`, or empty `catch {}` blocks) are strictly prohibited. Remediation must cure the root disease at its origin, not merely suppress immediate symptoms.

### The 5 Core Remediator Mandates

All remediators dispatched during remediation loops MUST strictly follow these 5 core mandates:

1. **Root-Cause Inception Mandate (No Defensive Nulling):**
   - Strictly prohibit call-site fallbacks masking missing or uninitialized state (`?? 0`, `|| []`, `catch {}`).
   - Remediators must trace errors backward to the state origin or lifecycle initializer (factory function, constructor, migration script, or ingestion pipeline). If state is missing or malformed at the call site, the bug MUST be fixed at the point of inception.

2. **Atomic Single Source of Truth / Dual-Write Invariant:**
   - If data must exist in two representations (e.g. cache and database, or dual ledger tables), mutations MUST be executed within an atomic database transaction, or refactored into a single store with on-demand computation.
   - Logging a divergence warning while continuing execution is strictly classified as a fatal defect.

3. **Production Schema Fidelity & Execution Environment Mandate:**
   - Mandatory verification against real production SQLite schema migrations (including `CHECK` constraints, foreign keys, and indexes) rather than legacy, simplified, or synthetic test schemas.
   - For Cloudflare Workers and Durable Objects: asynchronous operations (caching, telemetry, metrics, alerts) must always receive and invoke execution context (`ctx.waitUntil`). Passing a bare `env` and dropping promises across isolate boundaries is strictly prohibited.

4. **Strict Monotonicity & Sequence Rules:**
   - Polling, synchronization, and CRDT handlers must enforce strict monotonicity (`headSeq > current.lastSeq`).
   - Stale asynchronous network responses must never overwrite newer real-time state.

5. **Zero Test-Fixture Weakening:**
   - Strictly forbid auto-generating test fixtures or snapshots inside test assertions (e.g., calling `fs.writeFileSync` in tests to bypass validation).
   - Replace flaky wall-clock assertions (`toBeLessThan(Xms)`) with deterministic algorithmic operation counters or logical state assertions.

---

## 1.0 Input Resolution Protocol

- Accept review report path as argument: `/superconductor:remediate [path-to-review-report.md]`
- If no path provided: scan for most recent review report in project root (glob: `*review-report*.md`, `*findings*.md`)
- Validate: file must contain `json:review-findings` fenced block
- Extract findings from the `json:review-findings` block
- Parse severity, ruleId, file, description, repro_script, and execution_proof per finding
- Emit: `✓ Found <N> findings in <report-file> (<CRITICAL: X, HIGH: Y, MEDIUM: Z>)`

## 2.0 Findings Parser & Domain Grouping

- Parse the `json:review-findings` block from the review report
- Map each finding to `FindingFingerprint: { id, severity, ruleId, file, domain, repro_script, execution_proof }`
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
     - Each remediator is instructed with `packages/superconductor-core/prompts/remediation_dogma.md` and the 5 core mandates.
     - Remediators receive the finding's `repro_script` and `execution_proof` to reproduce the failure before applying fixes.
     - Remediators must verify the fix against the repro script and complete the Pre-Submission Invariant Checklist from `remediation_dogma.md`.
  3. **Diff-on-diff validation:** Audit fix commits (`git diff HEAD~1..HEAD`) to ensure no secondary regressions or swallowed errors were introduced.
  4. **Zero-bias re-review:** Re-run fresh Quorum review on updated diff.
  5. **Loop:** Repeat until 100% green or circuit breaker trips.
- **Circuit breaker:** Hard cap of 3–5 cycles or instant halt on `STAGNANT_DIFF`.
- **Deep Research Escalation:** Triggered when circuit breaker is reached.
- In `--headless` mode: suppress interactive prompts, auto-choose defaults.
- Hard-block: if any CRITICAL finding reaches HUMAN_REQUIRED, halt and present `Acknowledge & Abort` | `Acknowledge & Revert`.

### 3.1 Invariant-First Remediator Protocol

All remediators dispatched by `DomainSplitRemediationDispatcher` MUST strictly enforce the **Invariant-First Remediation Protocol** and reject local-patch pathologies:

1. **Inception Mandate (No Call-Site Defensive Nulling):**
   - Strictly FORBID defensive null fallbacks (`?? 0`, `|| []`, `?? ''`, `?.`, empty `catch {}`) at consumer sites to mask unhydrated data.
   - Trace backward to data lifecycle inception (store initializer, migration script, ingestion pipeline) and persist valid state at origin.
   - Missing data is an upstream contract breach, not an optional value to gloss over.

2. **Atomic Dual-Write & Single Source of Truth (SSOT):**
   - Dual-store representations MUST be updated atomically within a single transaction/action, or the redundant store eliminated.
   - Emitting warning logs (`console.warn`) on store divergence while proceeding is strictly classified as a fatal defect.

3. **Execution Fidelity:**
   - Execute all verification against real production database migrations, SQLite `CHECK` constraints, foreign keys, and indexes.
   - Cloudflare Workers and Durable Objects handlers MUST pass all async background tasks to `ctx.waitUntil` (never drop promises on bare `env`).

4. **Strict Sequence Monotonicity:**
   - State synchronization, event streams, and CRDT handlers must enforce strict sequence monotonicity (`headSeq > current.lastSeq`).
   - Out-of-order or stale network responses must never overwrite newer state.

5. **Zero Test Weakening (Anti-Test-Theatre):**
   - NEVER auto-generate test fixtures or snapshots on the fly (`writeFileSync` in assertions). Missing fixtures must fail immediately.
   - Replace wall-clock assertions (`toBeLessThan(Xms)`) with deterministic algorithmic operation counters (step counts, iterations).
   - Never raise timeout limits to mask race conditions or unhandled locks.

`DomainSplitRemediationDispatcher` dynamically injects `INVARIANT_REMEDIATION_DOGMA` and domain-specific inception guidance into every spawned processor subagent prompt on every dispatch.

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
