# Implementation Plan: Standalone Review — Swarm Remediation Engine
**Track:** `swarm_remediation_20260809`  
**Branch:** `track/swarm_remediation_20260809`  
**Target Branch:** `main`  
**Created:** 2026-08-09

---

## Phase 0: Swarm Preflight

- [x] Task: Verify `swarm-orchestrate` skill is installed and loaded (check `.agents/skills/` and `~/.agents/extensions/superconductor/skills/`) [TIER-1] [AGENT:superconductor-processor]
- [x] Task: Verify `deep_research_integration` capability is available (`packages/engine/src/research/`) [TIER-1] [AGENT:superconductor-processor]
- [x] Task: Verify `IntelligenceSnapshotReader` is available in `packages/superconductor-core/src/intelligence/` [TIER-1] [AGENT:superconductor-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Schema & Domain Configuration

- [x] Task: Write failing tests for `DomainClassifier` utility (domain-map loading, path-to-domain matching, fallback to `general-remediator`, custom override support) [TIER-3] [AGENT:superconductor-processor] (Commit: 4e751bea)
    - [x] Test: empty path returns `general-remediator`
    - [x] Test: `auth/jwt.ts` maps to `security-remediator`
    - [x] Test: `ui/Button.tsx` maps to `frontend-remediator`
    - [x] Test: custom domain-map.json override takes precedence
- [x] Task: Implement `DomainClassifier` in `packages/superconductor-core/src/remediation/domain-classifier.ts` [TIER-3] [AGENT:superconductor-processor] (Commit: 47ec85d6)
- [x] Task: Create `domain-map.json` default config in `packages/superconductor-core/src/remediation/` with all domain mappings from spec FR-2 [TIER-3] [AGENT:superconductor-processor] (Commit: 47ec85d6)
- [x] Task: Write failing tests for `RemediationStateObject` JSON schema validation [TIER-3] [AGENT:superconductor-processor] (Commit: f6e73236)
    - [x] Test: valid state object passes schema
    - [x] Test: missing `findingIndex` fails validation
    - [x] Test: invalid `outcome` enum value fails
- [x] Task: Create `remediation-state.schema.json` in `superconductor/schema/` [TIER-3] [AGENT:superconductor-processor] (Commit: 2f28088c)
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Schema & Domain Configuration' (Protocol in workflow.md) [checkpoint: aed5a21]

---

## Phase 2: RemediationOrchestrator Core

- [x] Task: Write failing tests for `RemediationOrchestrator` FSM state transitions (IDLE→ANALYZING→DISPATCHING→REMEDIATING→RE-REVIEWING→RESOLVED|ESCALATED) [TIER-3] [AGENT:superconductor-processor]
    - [x] Test: IDLE transitions to ANALYZING on `start()`
    - [x] Test: DISPATCHING transitions to REMEDIATING after domain classification
    - [x] Test: REMEDIATING transitions to RE-REVIEWING after fix attempt
    - [x] Test: RE-REVIEWING transitions to RESOLVED on `json:review-findings` with `status: RESOLVED`
    - [x] Test: RE-REVIEWING transitions to ESCALATED after 2 retries
- [x] Task: Implement `RemediationOrchestrator` class in `packages/superconductor-core/src/remediation/remediation-orchestrator.ts` [TIER-4] [AGENT:superconductor-dreamer]
    - [x] Sub-task: Implement FSM state machine with transitions
    - [x] Sub-task: Implement `RemediationStateObject` management and persistence
    - [x] Sub-task: Implement domain-batch grouping logic (group findings by domain before dispatch)
    - [x] Sub-task: Implement retry counter and budget enforcement (max 2 retries per domain batch)
    - [x] Sub-task: Implement hard timeout (10 min) per domain agent with ESCALATED fallback
- [x] Task: Write failing tests for domain batch grouping (multiple findings → single agent, not N agents) [TIER-3] [AGENT:superconductor-processor]
    - [x] Test: 3 auth findings → 1 security-remediator agent
    - [x] Test: mixed domains → correct agent count
- [x] Task: Implement agent spawn protocol using `invoke_subagent` with SenderID verification in the orchestrator [TIER-3] [AGENT:superconductor-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 2: RemediationOrchestrator Core' (Protocol in workflow.md) [checkpoint: 18/18 tests, SHA: 7611e8a]

---

## Phase 3: Bias-Isolated Review Gate (Oracle Reusable Component)

- [x] Task: Write failing tests for `BiasIsolatedReviewGate` (67e612e1) (verify fresh conversation IDs, verify only fingerprint+diff is passed, verify prior reasoning is NOT passed) [TIER-3] [AGENT:superconductor-processor]
    - [x] Test: fresh gate spawns reviewers with new conversation IDs (67e612e1)
    - [x] (67e612e1) Test: gate context does NOT contain prior reviewer reasoning text
    - [x] (67e612e1) Test: gate context DOES contain finding fingerprint (severity, rule_id, file)
    - [x] (67e612e1) Test: gate context DOES contain git diff of fix
- [x] (67e612e1) Task: Implement `BiasIsolatedReviewGate` in `packages/superconductor-core/src/remediation/bias-isolated-review-gate.ts` [TIER-4] [AGENT:superconductor-dreamer]
    - [x] (67e612e1) Sub-task: Implement context stripping logic (whitelist-only: fingerprint + diff + preflight)
    - [x] (67e612e1) Sub-task: Invoke `quorum-review.ts` with stripped context (DRY reuse, no re-implementation)
    - [x] (67e612e1) Sub-task: Parse and forward `json:review-findings` with SenderID verification back to orchestrator
- [x] (67e612e1) Task: Superconductor - User Manual Verification 'Phase 3: Bias-Isolated Review Gate' (Protocol in workflow.md) [checkpoint: 26/26 tests, SHA: 67e612e]

---


> [!checkpoint] Phase 3 completed.

## Phase 4: Deep Research Escalation Integration

- [x] Task: Write failing tests for deep research request construction (full context injection, prior attempts included, spotlighting delimiters present) [TIER-3] [AGENT:superconductor-processor] (Commit: f8d61b11)
    - [x] Test: research request contains prior fix attempts
    - [x] Test: research result injection uses spotlighting delimiters (`<DEEP_RESEARCH_RESULT>` tags)
    - [x] Test: policy-decision findings are flagged for human review (not auto-applied)
- [x] Task: Implement `DeepResearchEscalationHandler` in `packages/superconductor-core/src/remediation/deep-research-escalation-handler.ts` [TIER-4] [AGENT:superconductor-dreamer] (Commit: f8d61b11)
    - [x] Sub-task: Construct research request payload from finding + code context + failed attempts
    - [x] Sub-task: Call existing `deep_research_integration` capability with constructed payload
    - [x] Sub-task: Inject result into remediator context using spotlighted delimiters (prompt injection defense)
    - [x] Sub-task: Classify research result as auto-applicable vs. policy-decision-required
- [x] Task: Write failing tests for policy-decision escalation (human intervention path) [TIER-3] [AGENT:superconductor-processor] (Commit: f8d61b11)
    - [x] Test: policy-flagged finding triggers `ask_question` with terminal options only
    - [x] Test: `Acknowledge & Abort` option halts pipeline
    - [x] Test: `Acknowledge & Revert` option reverts remediation branch changes
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Deep Research Escalation Integration' (Protocol in workflow.md) [checkpoint: 36/36 tests, Oracle-all-clear, SHAs: f8d61b1 + 1f59785]

---

## Phase 5: Remediation Log & Observability

- [x] Task: Write failing tests for `RemediationLogWriter` (log structure, per-finding entries, SHA tracking, token stats) [TIER-3] [AGENT:superconductor-processor] (Commit: cc66385)
    - [x] Test: log contains correct domain per finding
    - [x] Test: log contains outcome (RESOLVED|ESCALATED|HUMAN_REQUIRED)
    - [x] Test: log contains fix commit SHA for RESOLVED findings
    - [x] Test: `--stats` flag appends token usage section
- [x] Task: Implement `RemediationLogWriter` in `packages/superconductor-core/src/remediation/remediation-log-writer.ts` [TIER-3] [AGENT:superconductor-processor] (Commit: 77c923f)
- [x] Task: Wire token tracking (`recordTokenUsage`) for each domain agent into the log [TIER-3] [AGENT:superconductor-processor] (Commit: a47b825)
- [x] Task: Superconductor - User Manual Verification 'Phase 5: Remediation Log & Observability' (Protocol in workflow.md) [checkpoint: Phase 5 completed, 38/38 tests passing]

---

## Phase 6: Standalone Review SKILL.md Extension (§9.0)

- [x] Task: Draft §9.0 Swarm Remediation Protocol section content (FSM diagram, Domain Map table, hand-off protocol, re-review protocol, deep research escalation, observability) [TIER-4] [AGENT:superconductor-dreamer] (Commit: 0266a93a)
- [x] Task: Append §9.0 to `skills/standalone-review/SKILL.md` [TIER-3] [AGENT:superconductor-processor] (Commit: 0266a93a)
    - [x] Sub-task: Add post-review hand-off trigger (§9.1)
    - [x] Sub-task: Add Domain Map table (§9.2)
    - [x] Sub-task: Add Remediation FSM lifecycle diagram (§9.3)
    - [x] Sub-task: Add Fresh Review Gate protocol (§9.4)
    - [x] Sub-task: Add Deep Research Escalation protocol (§9.5)
    - [x] Sub-task: Add Observability & Audit Trail spec (§9.6)
    - [x] Sub-task: Add flag compatibility matrix (`--fast`, `--deep`, `--headless`, `--stats`, `--remediate`) (§9.7)
- [x] Task: Superconductor - User Manual Verification 'Phase 6: Standalone Review SKILL.md Extension' (Protocol in workflow.md) [checkpoint: 76 lines appended, §9.1-§9.7 confirmed at lines 346-420, SHA: 0266a93a]

---

## Phase 7: Standalone Remediation Skill

- [x] Task: Create `skills/standalone-remediation/` directory and `SKILL.md` [TIER-3] [AGENT:superconductor-processor] (Commit: 76ff8a9c)
    - [x] Sub-task: Write skill frontmatter (name, description, detection signals)
    - [x] Sub-task: Write §1.0 Input Resolution (accept review report path as input)
    - [x] Sub-task: Write §2.0 Findings Parser (parse review report into structured finding objects)
    - [x] Sub-task: Write §3.0 Swarm Launch (delegate to `RemediationOrchestrator` with parsed findings)
    - [x] Sub-task: Write §4.0 Output Protocol (remediation log + updated review report)
- [x] Task: Write integration test: standalone-remediation skill can consume an existing review report and produce remediation log [TIER-3] [AGENT:superconductor-reviewer] (Commit: 76ff8a9c)
- [x] Task: Superconductor - User Manual Verification 'Phase 7: Standalone Remediation Skill' (Protocol in workflow.md) [checkpoint: Phase 7 completed, 41/41 tests passing]

---

## Phase 8: End-to-End Integration & Wiring

- [x] Task: Wire `RemediationOrchestrator` into standalone-review pipeline (post-findings-report hook) in review SKILL.md §6.0 [TIER-3] [AGENT:superconductor-processor] (Commit: 4c240a70)
- [x] Task: Implement `--remediate` flag handling in standalone-review INPUT RESOLUTION PROTOCOL (§2.0) [TIER-3] [AGENT:superconductor-processor] (Commit: 4c240a70)
- [x] Task: Implement `--headless` auto-launch logic (auto-trigger remediation for CRITICAL/HIGH findings) [TIER-3] [AGENT:superconductor-processor] (Commit: 4c240a70)
- [ ] Task: Run full end-to-end integration test: review a known-bad diff, verify remediation launches, agents are spawned per domain, fresh reviewers validate fixes, log is emitted [TIER-4] [AGENT:superconductor-oracle]
- [x] Task: Run coverage report and verify >80% coverage for all new `packages/superconductor-core/src/remediation/` modules [TIER-1] [AGENT:superconductor-processor] (Coverage: 91.58%)
- [x] Task: Superconductor - User Manual Verification 'Phase 8: End-to-End Integration & Wiring' (Protocol in workflow.md) [checkpoint: SKILL.md flags added, coverage 91.58%, 41 tests passing]

---

## Phase 9: Integration & Finalization

- [ ] Task: Integrate track 'swarm_remediation_20260809' into main branch. [TIER-3] [AGENT:superconductor-processor]

---

## Proactive Planning Notes (Oracle)

- `DomainClassifier` and `BiasIsolatedReviewGate` are explicitly designed for reuse outside this track — consider publishing to `superconductor-kernel` registry post-track.
- `RemediationOrchestrator` leverages `quorum-review.ts` (DRY) — no re-implementation of reviewer fan-out.
- `domain-map.json` is config-file driven — projects can override without forking core.
- `RemediationStateObject` schema is in `superconductor/schema/` — CI tooling can validate state files.

---

## Swarm Blueprint

| Wave | Task | Model Tier | Agent Role | Notes |
|------|------|-----------|------------|-------|
| 0 | Phase 0 preflight tasks | TIER-1 | processor | Deterministic verification |
| 1 | Phase 1: DomainClassifier tests | TIER-3 | processor | TDD Red phase |
| 1 | Phase 1: DomainClassifier impl | TIER-3 | processor | TDD Green phase |
| 1 | Phase 1: Schema tests | TIER-3 | processor | TDD Red |
| 1 | Phase 1: Schema creation | TIER-3 | processor | TDD Green |
| 2 | Phase 2: FSM tests | TIER-3 | processor | TDD Red |
| 2 | Phase 2: RemediationOrchestrator | TIER-4 | dreamer | Architecture-heavy |
| 2 | Phase 2: Batch grouping tests | TIER-3 | processor | |
| 2 | Phase 2: Agent spawn protocol | TIER-3 | processor | |
| 3 | Phase 3: BiasIsolatedReviewGate tests | TIER-3 | processor | TDD Red |
| 3 | Phase 3: BiasIsolatedReviewGate impl | TIER-4 | dreamer | Context stripping logic |
| ☁ | Oracle Cadence #1 (after Wave 3) | TIER-4 | oracle | Advisory score |
| 4 | Phase 4: Deep Research tests | TIER-3 | processor | TDD Red |
| 4 | Phase 4: DeepResearchEscalationHandler | TIER-4 | dreamer | |
| 4 | Phase 4: Policy escalation tests | TIER-3 | processor | |
| 5 | Phase 5: RemediationLogWriter tests | TIER-3 | processor | TDD Red |
| 5 | Phase 5: RemediationLogWriter impl | TIER-3 | processor | |
| 5 | Phase 5: Token tracking wiring | TIER-3 | processor | |
| ☁ | Oracle Cadence #2 (after Wave 5) | TIER-4 | oracle | Advisory score |
| 6 | Phase 6: SKILL.md §9.0 draft | TIER-4 | dreamer | |
| 6 | Phase 6: SKILL.md §9.0 append | TIER-3 | processor | |
| 7 | Phase 7: standalone-remediation SKILL.md | TIER-3 | processor | |
| 7 | Phase 7: Integration test | TIER-3 | reviewer | |
| 8 | Phase 8: Wiring + flags | TIER-3 | processor | |
| 8 | Phase 8: E2E integration test | TIER-4 | oracle | Final validation |
| 8 | Phase 8: Coverage verification | TIER-1 | processor | Deterministic |
| ☁ | Oracle Final Audit | TIER-4 | oracle | Full spec alignment |
| 9 | Integration & merge | TIER-3 | processor | |

**Estimated track cost:** ~28 tasks · 9 phases · Oracle cadence every 3 waves · Deep research capability required
