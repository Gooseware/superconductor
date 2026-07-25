# Implementation Plan: Swarm Protocol Strict Guardrails & Anti-Rogue Agent Enforcement

## Phase 1: Policy Hardening (Instructional Layer)

- [ ] **1.1** Update `superconductor/GEMINI.md` — add a `SWARM GUARDRAILS` section with the explicit behavioural model:
  - When Superconductor is active + swarm mode: root agent MUST NOT write to `packages/*/src/**` directly. Must use `invoke_subagent` → Processor.
  - When Superconductor is active (any mode): root agent MUST NOT commit a track branch until Quorum loop is complete and green.
  - Include the specific error message the root agent must emit when it catches itself violating this rule.

- [ ] **1.2** Update `superconductor/workflow.md` — add an explicit `## Commit Gate` section that states:
  - Sequential mode and swarm mode both require the Quorum → Remediate → Quorum loop to complete before the finalization commit step.
  - The finalization commit (`chore(superconductor): Mark track X as complete`) is explicitly gated — it MUST NOT run until all 4 reviewers report `RESOLVED`.

- [ ] **1.3** Update `WORKFLOW_EXCELLENCE_BLUEPRINT.md` — document the "Lone-Wolf Commit" as a named anti-pattern with its detection signature and correct resolution.

---

## Phase 2: Git Hook Commit Gate

- [ ] **2.1** Create `scripts/hooks/pre-commit` shell script with the following logic:
  ```
  1. Check superconductor/tracks.md for any line matching '[~]'
  2. If no active track found → exit 0 (no-op, hook is dormant)
  3. If active track found:
     a. Check git staged files for any matching packages/*/src/**
     b. If no src/ files staged → exit 0
     c. If src/ files staged → inspect COMMIT_EDITMSG for 'Swarm-Authorized: true'
     d. If trailer present → exit 0 (allow commit)
     e. If trailer missing → print error and exit 1 (block commit)
  ```
  - Error message: `[Superconductor] Commit blocked: active track detected and src/ changes require Swarm Authorization. Complete the Review Quorum first.`
  - If `SUPERCONDUCTOR_BYPASS=1` is set at step (e): allow the commit, append a bypass entry to `superconductor/swarm_compliance.log` (ISO timestamp, `git config user.name`, staged files list, `SUPERCONDUCTOR_BYPASS_REASON` if set).

- [ ] **2.2** Create `scripts/hooks/install-hooks.sh` — copies `pre-commit` into `.git/hooks/pre-commit`, sets executable bit, and is idempotent (safe to re-run). **Installs once permanently** — no per-track install/uninstall logic needed.

- [ ] **2.3** Update `superconductor/setup` skill and `scripts/setup.ts` — call `install-hooks.sh` as part of setup. Document that the hook is a permanent install that self-activates/deactivates based on track state.

- [ ] **2.4** Write unit tests in `tests/scripts/hook-enforcement.test.ts` covering:
  - No active `[~]` track in `tracks.md` → hook exits as no-op regardless of staged files.
  - Active `[~]` track, no `src/` files staged → hook allows commit.
  - Active `[~]` track, `src/` files staged, trailer present → hook allows commit.
  - Active `[~]` track, `src/` files staged, no trailer → hook blocks commit.
  - Active `[~]` track, `src/` files staged, no trailer, `SUPERCONDUCTOR_BYPASS=1` → allowed, bypass written to `swarm_compliance.log`.

---

## Phase 3: Swarm Orchestrator Authorization Stamping

- [ ] **3.1** Create `packages/superconductor-core/src/track/swarm-authorizer.ts`:
  - `SwarmAuthorizer.generateTrailer(reviewerConvIds: string[]): string` — produces `Swarm-Authorized: true | reviewers: <id1>,<id2>,<id3>,<id4>`.
  - `SwarmAuthorizer.validateTrailer(commitMsg: string): boolean` — used by the hook.

- [ ] **3.2** Update `swarm-orchestrate` skill (`SKILL.md`) — in the finalization step (§3.2 / §4.1), after unanimous `RESOLVED` from all reviewers, the Orchestrator MUST call `SwarmAuthorizer.generateTrailer()` and append it to the commit message before running `git commit`.

- [ ] **3.3** Update the sequential mode workflow (`workflow.md`) — after the Quorum loop completes and all reviewers are `RESOLVED`, invoke `SwarmAuthorizer.generateTrailer()` before the finalization commit.

- [ ] **3.4** Write unit tests in `tests/track/swarm-authorizer.test.ts` covering:
  - Trailer generation with 4 reviewer IDs produces correct format.
  - Trailer validation correctly identifies valid/invalid trailers.
  - Missing reviewer IDs are rejected.

---

## Phase 4: Compliance Audit Tool

- [ ] **4.1** Create `scripts/audit-swarm-compliance.ts`:
  - Scans `git log` for commits that touched `packages/*/src/` files.
  - Reports any commit missing `Swarm-Authorized: true` as a **violation**.
  - Also surfaces any entries in `superconductor/swarm_compliance.log` (bypass events) for human review.
  - Output: human-readable summary to stdout. This is a **manual diagnostic tool only** — it does not gate anything.

- [ ] **4.2** Write unit tests in `tests/scripts/audit-swarm-compliance.test.ts` covering:
  - Correctly identifies compliant commits.
  - Correctly flags non-compliant commits.
  - Correctly surfaces bypass log entries.

- [ ] **4.3** Add `"audit:swarm": "npx tsx scripts/audit-swarm-compliance.ts"` to `packages/superconductor-core/package.json` scripts.
