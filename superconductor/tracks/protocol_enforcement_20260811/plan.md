# Implementation Plan: Superconductor Protocol Enforcement

**Track ID:** `protocol_enforcement_20260811`
**Spec:** `superconductor/tracks/protocol_enforcement_20260811/spec.md`
**Baseline tests:** 566 (must remain ≥ 566 after all phases)

---

## Phase 1: Fix Pipeline Inversion — `swarm-orchestrate` + `workflow.md` + `implement/SKILL.md`

**Target: FS-1 (Oracle before Quorum) + FS-4 (No Oracle post-quorum-green)**

- [ ] Task: Audit `swarm-orchestrate/SKILL.md` Pipeline Mode §4.2 Oracle cadence anti-pattern [TIER-1] [AGENT:superconductor-processor]
    - [ ] Read `~/.gemini/config/plugins/superconductor/skills/swarm-orchestrate/SKILL.md` §4.2 in full
    - [ ] Locate the `oracleCadence` section that fires Oracle concurrently every N tasks
    - [ ] Confirm evidence: "Every `oracleCadence` tasks (default: 3), the Oracle agent fires concurrently alongside Processor N and Reviewer N-1"

- [ ] Task: Fix `swarm-orchestrate/SKILL.md` Pipeline Mode Oracle to Advisory-Only [TIER-2] [AGENT:superconductor-processor]
    - [ ] Add `**ADVISORY ONLY**` label to the periodic Oracle cadence subsection
    - [ ] Add paragraph: "The Pipeline Mode periodic Oracle is advisory only. Its verdict MUST NOT be used as a merge gate or track completion signal. The mandatory gate Oracle runs ONCE after quorum reaches unanimous RESOLVED, with full diff context."
    - [ ] Add new subsection `### 4.3 Mandatory Post-Quorum Gate Oracle` stating: "After the Quorum loop reaches unanimous green (all 4 reviewers RESOLVED), the orchestrator MUST invoke a dedicated Gate Oracle using the full track diff. This is the ONLY Oracle verdict that unlocks merge."
    - [ ] Verify the Parallel Mode flow diagram already shows `ReviewP -- All Approved --> OracleP` and add a note confirming this is the canonical ordering
    - [ ] Commit: `docs(protocol_enforcement): Fix Pipeline Mode Oracle anti-pattern in swarm-orchestrate skill`

- [ ] Task: Add `QuorumValidator.gateOracle()` hard gate to `workflow.md` Commit Gate section [TIER-2] [AGENT:superconductor-processor]
    - [ ] Find the `## Commit Gate` section in `superconductor/workflow.md`
    - [ ] Add HARD GATE block immediately before the Oracle subsection:
        ```
        **HARD GATE — Oracle Precondition:**
        Before invoking the Oracle, the orchestrator MUST verify quorum state.
        Pseudocode: `QuorumValidator.gateOracle({ quorumPassed })` — throws `OracleGateError` if false.
        Source: `packages/superconductor-core/src/orchestration/quorum-validator.ts`
        Any Oracle verdict obtained before quorum-green is VOID and MUST be discarded.
        A new Oracle MUST be invoked post-quorum-green.
        ```
    - [ ] Add `Quorum → Oracle → Merge` as an explicit required sequence at the top of the Commit Gate section
    - [ ] Commit: `docs(protocol_enforcement): Wire QuorumValidator.gateOracle() into workflow.md Commit Gate`

- [ ] Task: Add Oracle pre-condition check to `implement/SKILL.md` §6.0 [TIER-2] [AGENT:superconductor-processor]
    - [ ] Find `~/.gemini/config/plugins/superconductor/skills/implement/SKILL.md` §6.0 Oracle Code Review Loop
    - [ ] Add Step 0 before "Initialize Oracle": "**Step 0 — Quorum Pre-Condition:** Verify `quorumPassed === true`. If the quorum loop has not yet completed with unanimous RESOLVED from all 4 reviewers (security, correctness, adversarial, regression), HALT. Return to the quorum loop. Oracle MUST NOT be invoked until quorum is green."
    - [ ] Commit: `docs(protocol_enforcement): Add quorum pre-condition gate to implement skill Oracle section`

- [ ] Task: User Manual Verification — Phase 1 [TIER-1] [AGENT:superconductor-processor]
    - [ ] Grep `workflow.md` for "HARD GATE" — must return ≥1 match
    - [ ] Grep `swarm-orchestrate/SKILL.md` for "Advisory" — must return ≥1 match
    - [ ] Grep `implement/SKILL.md` for "Step 0" and "Quorum Pre-Condition" — must return ≥1 match
    - [ ] Run `CI=true npx vitest run` from `packages/superconductor-core/` — must be ≥ 566 passing
    - [ ] Commit: `superconductor(checkpoint): Checkpoint end of Phase 1 — Pipeline Inversion Fixes`

---

## Phase 2: No-Polling Rule + `BackgroundTaskMonitor`

**Target: FS-2 (49-min polling stall + 81-min hung task)**

- [ ] Task: Write failing tests for `BackgroundTaskMonitor` (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: `detectHungOutput("Press Ctrl+C to quit")` → returns `true`
    - [ ] Test: `detectHungOutput("press any key to continue")` → returns `true`
    - [ ] Test: `detectHungOutput("[Y/n]")` → returns `true`
    - [ ] Test: `detectHungOutput("normal build output")` → returns `false`
    - [ ] Test: `launch(cmd, { maxDurationMs: 100 })` — mock shell takes 200ms → throws `TimeoutError`
    - [ ] Test: `launch(cmd)` — mock shell outputs "Press Ctrl+C" → throws `HungTaskError`
    - [ ] Test: `kill(taskId)` delegates to `ShellRunner.exec("kill <pid>")`
    - [ ] Test: successful task resolves with stdout
    - [ ] Confirm all tests fail (Red)

- [ ] Task: Implement `BackgroundTaskMonitor` [TIER-3] [AGENT:superconductor-processor]
    - [ ] File: `packages/superconductor-core/src/orchestration/background-task-monitor.ts`
    - [ ] `TimeoutError`, `HungTaskError` error classes
    - [ ] `HUNG_PATTERNS: string[]` — `['Press Ctrl+C', 'press any key', 'waiting for input', '[Y/n]', '[y/N]', 'Enter password', 'Password:']`
    - [ ] `detectHungOutput(output: string): boolean` — checks output against HUNG_PATTERNS (case-insensitive)
    - [ ] `launch(cmd: string, opts?: { maxDurationMs?: number }): Promise<{ stdout: string; exitCode: number }>` — runs via ShellRunner, polls output chunks, throws on timeout or hung pattern
    - [ ] `kill(taskId: string): Promise<void>`
    - [ ] Injectable `ShellRunner` interface
    - [ ] Run tests — all must pass (Green)
    - [ ] Coverage: >85% on new code
    - [ ] Export from `packages/superconductor-core/src/orchestration/index.ts`
    - [ ] Commit: `track(protocol_enforcement_20260811): phase2 - BackgroundTaskMonitor`

- [ ] Task: Add no-polling rule to `workflow.md` and `GEMINI.md` [TIER-2] [AGENT:superconductor-processor]
    - [ ] Add `### Anti-Patterns (PROHIBITED)` section to `superconductor/workflow.md`:
        ```markdown
        ### Anti-Patterns (PROHIBITED)

        #### Polling Loop
        Calling `manage_subagents(action="list")` or `manage_task(action="status")` in a loop is PROHIBITED.
        After spawning subagents or background tasks, the orchestrator MUST stop calling tools.
        The messaging system delivers subagent responses reactively — polling blocks delivery.
        Rule: maximum 1 status check per subagent per orchestrator turn, then STOP and yield.

        #### Hero-Agenting
        See § Post-Quorum Remediation Protocol (Phase 3).

        #### Background Task Neglect
        Background tasks MUST be monitored for hung state. A task that has not produced
        output within 30 minutes MUST be killed and re-launched. Use `BackgroundTaskMonitor`
        (`packages/superconductor-core/src/orchestration/background-task-monitor.ts`) as
        the mandatory wrapper for all background task launches during track execution.
        ```
    - [ ] Add no-polling rule to `GEMINI.md` SWARM GUARDRAILS section:
        ```markdown
        - **No Polling Loops**: After spawning subagents or background tasks, the root agent MUST stop calling tools and yield. Maximum 1 status check per turn. Polling `manage_subagents list` in a loop BLOCKS incoming messages and is PROHIBITED.
        ```
    - [ ] Commit: `docs(protocol_enforcement): Add no-polling rule to workflow.md + GEMINI.md`

- [ ] Task: User Manual Verification — Phase 2 [TIER-1] [AGENT:superconductor-processor]
    - [ ] Grep `workflow.md` for "Anti-Patterns" — must return ≥1 match
    - [ ] Grep `GEMINI.md` for "No Polling Loops" — must return ≥1 match
    - [ ] `CI=true npx vitest run src/orchestration/background-task-monitor.test.ts` — must pass
    - [ ] `CI=true npx vitest run` — must be ≥ 566 + new BackgroundTaskMonitor tests
    - [ ] Commit: `superconductor(checkpoint): Checkpoint end of Phase 2 — No-Polling + BackgroundTaskMonitor`

---

## Phase 3: Flash Mob Remediation Mandate

**Target: FS-3 (Hero-Agenting — 19 quorum passes from single remediation wave)**

- [ ] Task: Add `### Post-Quorum Remediation Protocol` to `workflow.md` [TIER-2] [AGENT:superconductor-processor]
    - [ ] Add the following section to `superconductor/workflow.md` immediately after the Quorum Loop section:
        ```markdown
        ### Post-Quorum Remediation Protocol (MANDATORY)

        When any quorum reviewer returns `NEEDS_FIXES`:

        1. **Collect all findings.** Aggregate findings from ALL 4 reviewers into a unified list.
        2. **Domain-split dispatch (MUST).** Use `DomainSplitRemediationDispatcher`
           (`packages/superconductor-core/src/remediation/domain-split-remediation-dispatcher.ts`)
           to group findings by domain and spawn one Flash remediator per domain in parallel.
        3. **MUST NOT self-fix.** The root orchestrator agent MUST NOT call `write_to_file`,
           `multi_replace_file_content`, `replace_file_content`, or `run_command` to fix findings
           directly. This constitutes "Hero-Agenting" and is a protocol violation.
        4. **MUST NOT spawn a single monolithic remediator.** Every remediator agent MUST have
           a singular focused task: one domain, one file, one concern.
        5. **Re-run full quorum.** After ALL remediators complete and merge, re-run the full
           4-reviewer quorum (all 4 types: security, correctness, adversarial, regression).
        6. **Loop.** Repeat until quorum is unanimous green. Maximum 5 remediation cycles
           before escalating to Oracle for architectural guidance.
        ```
    - [ ] Commit: `docs(protocol_enforcement): Add mandatory flash mob remediation protocol to workflow.md`

- [ ] Task: Add self-fix prohibition to `GEMINI.md` SWARM GUARDRAILS [TIER-2] [AGENT:superconductor-processor]
    - [ ] Add to the SWARM GUARDRAILS section:
        ```markdown
        - **No Hero-Agenting in Remediation**: When quorum returns `NEEDS_FIXES`, the root agent MUST NOT self-fix using write or shell tools. MUST dispatch `DomainSplitRemediationDispatcher`. Violation emits: "[Superconductor] Hero-agenting detected in remediation. Aborting. I must dispatch domain-split remediators instead."
        ```
    - [ ] Commit: `docs(protocol_enforcement): Add hero-agenting prohibition to GEMINI.md SWARM GUARDRAILS`

- [ ] Task: Update `standalone-review/SKILL.md` remediation section with MUST language [TIER-2] [AGENT:superconductor-processor]
    - [ ] Find the remediation dispatch section in `~/.gemini/config/plugins/superconductor/skills/standalone-review/SKILL.md`
    - [ ] Strengthen existing `DomainSplitRemediationDispatcher` reference from descriptive to prescriptive:
        - Change "Findings sharing the same domain are BATCHED to a single live agent" → add "MUST" and cross-reference to `workflow.md § Post-Quorum Remediation Protocol`
        - Add: "Self-fixing by the root agent is PROHIBITED. See workflow.md § Anti-Patterns."
    - [ ] Commit: `docs(protocol_enforcement): Strengthen DomainSplitRemediationDispatcher MUST language in standalone-review`

- [ ] Task: User Manual Verification — Phase 3 [TIER-1] [AGENT:superconductor-processor]
    - [ ] Grep `workflow.md` for "Post-Quorum Remediation Protocol" — must return ≥1
    - [ ] Grep `workflow.md` for "MUST NOT self-fix" — must return ≥1
    - [ ] Grep `GEMINI.md` for "Hero-Agenting" — must return ≥1
    - [ ] Run full test suite — must be ≥ previous phase count
    - [ ] Commit: `superconductor(checkpoint): Checkpoint end of Phase 3 — Flash Mob Remediation Mandate`

---

## Phase 4: `SwarmAuthorizer` Export + `WorkspaceGuard` Merge Wiring

**Target: FS-5 (SwarmAuthorizer trailer missing on merge)**

- [ ] Task: Write failing tests for SwarmAuthorizer export and merge flow wiring (Red Phase) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: `import { SwarmAuthorizer } from 'superconductor-core'` resolves without error
    - [ ] Test: `SwarmAuthorizer.generateTrailer(['id1', 'id2'])` returns string containing both IDs
    - [ ] Test: `SwarmAuthorizer.validateTrailer(msg)` returns `true` for valid trailer, `false` for missing
    - [ ] Test: Merge CLI called without trailer → throws `UnauthorizedMergeError`
    - [ ] Test: Merge CLI called with valid trailer → resolves
    - [ ] Confirm all tests fail (Red)

- [ ] Task: Fix `SwarmAuthorizer` export from `track/index.ts` [TIER-3] [AGENT:superconductor-processor]
    - [ ] File: `packages/superconductor-core/src/track/index.ts`
    - [ ] Add: `export * from './swarm-authorizer.js';`
    - [ ] Verify `SwarmAuthorizer` is now accessible from package root via `src/index.ts`
    - [ ] Run tests — export tests must pass

- [ ] Task: Wire `WorkspaceGuard.commitToMain()` into merge flow [TIER-3] [AGENT:superconductor-processor]
    - [ ] Locate the Superconductor merge entry point — check `packages/superconductor-core/src/cli/` for merge commands, or the `GitWorkflowManager` utility referenced in `implement/SKILL.md`
    - [ ] Add merge flow sequence:
        ```typescript
        const trailer = SwarmAuthorizer.generateTrailer(reviewerConvIds);
        await workspaceGuard.commitToMain({ trailerPresent: !!trailer });
        // proceeds with git merge --no-ff -m `${mergeMessage}\n\n${trailer}`
        ```
    - [ ] If no dedicated merge CLI exists, create `packages/superconductor-core/src/cli/merge-track.ts` with the above wiring
    - [ ] Run tests — merge wiring tests must pass

- [ ] Task: Strengthen `scripts/hooks/commit-msg` to use `SwarmAuthorizer.validateTrailer()` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Update `scripts/hooks/commit-msg`:
        - Remove weak bash `grep -q "Swarm-Authorized: true"` match
        - Replace with: `node --input-type=module <<< "import { SwarmAuthorizer } from './packages/superconductor-core/dist/index.js'; process.exit(SwarmAuthorizer.validateTrailer(require('fs').readFileSync(process.argv[1], 'utf8')) ? 0 : 1);" "$1"`
        - Or simpler: extract to `scripts/validate-trailer.js` that imports built `SwarmAuthorizer`
    - [ ] Test that a commit message with a valid trailer passes the hook
    - [ ] Test that a commit message without a trailer fails the hook
    - [ ] Commit: `track(protocol_enforcement_20260811): phase4 - SwarmAuthorizer export + WorkspaceGuard merge wiring + commit hook`

- [ ] Task: User Manual Verification — Phase 4 [TIER-1] [AGENT:superconductor-processor]
    - [ ] Grep `packages/superconductor-core/src/track/index.ts` for "swarm-authorizer" — must match
    - [ ] Run: `node -e "const {SwarmAuthorizer} = require('./packages/superconductor-core/dist/index.js'); console.log(SwarmAuthorizer.generateTrailer(['a','b']))"` — must print trailer string
    - [ ] Run full test suite — must be ≥ previous phase count
    - [ ] Commit: `superconductor(checkpoint): Checkpoint end of Phase 4 — SwarmAuthorizer wired`

---

## Phase 5: Integration Verification + tracks.md Update

- [ ] Task: End-to-end protocol compliance verification [TIER-1] [AGENT:superconductor-processor]
    - [ ] Run full test suite: `CI=true npx vitest run` from `packages/superconductor-core/` — must be ≥ 566 + all new tests (BackgroundTaskMonitor + SwarmAuthorizer + merge flow)
    - [ ] Verify all 16 ACs pass (grep audit):
        - AC-1: `grep "HARD GATE" superconductor/workflow.md` — returns match
        - AC-2: `grep "Advisory" ~/.gemini/config/plugins/superconductor/skills/swarm-orchestrate/SKILL.md` — returns match
        - AC-3: `grep "Step 0" ~/.gemini/config/plugins/superconductor/skills/implement/SKILL.md` — returns match
        - AC-5: `grep "Anti-Patterns" superconductor/workflow.md` — returns match
        - AC-6: `grep "No Polling Loops" GEMINI.md` — returns match
        - AC-10: `grep "Post-Quorum Remediation Protocol" superconductor/workflow.md` — returns match
        - AC-11: `grep "Hero-Agenting" GEMINI.md` — returns match
        - AC-13: `grep "swarm-authorizer" packages/superconductor-core/src/track/index.ts` — returns match

- [ ] Task: Update tracks.md registry [TIER-1] [AGENT:superconductor-processor]
    - [ ] Add `protocol_enforcement_20260811` entry to `superconductor/tracks.md` as `[~]` (in progress when track starts, will be updated to `[x]` at completion)
    - [ ] Commit: `chore(superconductor): Mark track protocol_enforcement_20260811 complete`

---

## Quorum & Oracle Gate (Non-Negotiable)

Per the protocol this very track enforces:

1. **Quorum Round 1:** Spawn all 4 reviewers (flash): security, correctness, adversarial, regression
2. If NEEDS_FIXES → domain-split remediators (one per domain) → re-run full quorum
3. Loop until quorum unanimous green
4. **Oracle (pro):** Only after quorum green. Full diff review against this spec.
5. Oracle READY → merge to main with SwarmAuthorizer trailer

**Irony note:** This track is the one that makes the above non-optional. The quorum running this track will use the rules we're writing. If the agent implementing this track skips quorum — it has failed to implement the track it's supposed to be implementing.
