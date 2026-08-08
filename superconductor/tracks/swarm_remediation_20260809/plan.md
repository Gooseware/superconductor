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

- [ ] Task: Write failing tests for `DomainClassifier` utility (domain-map loading, path-to-domain matching, fallback to `general-remediator`, custom override support) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: empty path returns `general-remediator`
    - [ ] Test: `auth/jwt.ts` maps to `security-remediator`
    - [ ] Test: `ui/Button.tsx` maps to `frontend-remediator`
    - [ ] Test: custom domain-map.json override takes precedence
- [ ] Task: Implement `DomainClassifier` in `packages/superconductor-core/src/remediation/domain-classifier.ts` [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Create `domain-map.json` default config in `packages/superconductor-core/src/remediation/` with all domain mappings from spec FR-2 [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Write failing tests for `RemediationStateObject` JSON schema validation [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: valid state object passes schema
    - [ ] Test: missing `findingIndex` fails validation
    - [ ] Test: invalid `outcome` enum value fails
- [ ] Task: Create `remediation-state.schema.json` in `superconductor/schema/` [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Schema & Domain Configuration' (Protocol in workflow.md)

---

## Phase 2: RemediationOrchestrator Core

- [ ] Task: Write failing tests for `RemediationOrchestrator` FSM state transitions (IDLE→ANALYZING→DISPATCHING→REMEDIATING→RE-REVIEWING→RESOLVED|ESCALATED) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: IDLE transitions to ANALYZING on `start()`
    - [ ] Test: DISPATCHING transitions to REMEDIATING after domain classification
    - [ ] Test: REMEDIATING transitions to RE-REVIEWING after fix attempt
    - [ ] Test: RE-REVIEWING transitions to RESOLVED on `json:review-findings` with `status: RESOLVED`
    - [ ] Test: RE-REVIEWING transitions to ESCALATED after 2 retries
- [ ] Task: Implement `RemediationOrchestrator` class in `packages/superconductor-core/src/remediation/remediation-orchestrator.ts` [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Sub-task: Implement FSM state machine with transitions
    - [ ] Sub-task: Implement `RemediationStateObject` management and persistence
    - [ ] Sub-task: Implement domain-batch grouping logic (group findings by domain before dispatch)
    - [ ] Sub-task: Implement retry counter and budget enforcement (max 2 retries per domain batch)
    - [ ] Sub-task: Implement hard timeout (10 min) per domain agent with ESCALATED fallback
- [ ] Task: Write failing tests for domain batch grouping (multiple findings → single agent, not N agents) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: 3 auth findings → 1 security-remediator agent
    - [ ] Test: mixed domains → correct agent count
- [ ] Task: Implement agent spawn protocol using `invoke_subagent` with SenderID verification in the orchestrator [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: RemediationOrchestrator Core' (Protocol in workflow.md)

---

## Phase 3: Bias-Isolated Review Gate (Oracle Reusable Component)

- [ ] Task: Write failing tests for `BiasIsolatedReviewGate` (verify fresh conversation IDs, verify only fingerprint+diff is passed, verify prior reasoning is NOT passed) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: fresh gate spawns reviewers with new conversation IDs
    - [ ] Test: gate context does NOT contain prior reviewer reasoning text
    - [ ] Test: gate context DOES contain finding fingerprint (severity, rule_id, file)
    - [ ] Test: gate context DOES contain git diff of fix
- [ ] Task: Implement `BiasIsolatedReviewGate` in `packages/superconductor-core/src/remediation/bias-isolated-review-gate.ts` [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Sub-task: Implement context stripping logic (whitelist-only: fingerprint + diff + preflight)
    - [ ] Sub-task: Invoke `quorum-review.ts` with stripped context (DRY reuse, no re-implementation)
    - [ ] Sub-task: Parse and forward `json:review-findings` with SenderID verification back to orchestrator
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Bias-Isolated Review Gate' (Protocol in workflow.md)

---

## Phase 4: Deep Research Escalation Integration

- [ ] Task: Write failing tests for deep research request construction (full context injection, prior attempts included, spotlighting delimiters present) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: research request contains prior fix attempts
    - [ ] Test: research result injection uses spotlighting delimiters (`<DEEP_RESEARCH_RESULT>` tags)
    - [ ] Test: policy-decision findings are flagged for human review (not auto-applied)
- [ ] Task: Implement `DeepResearchEscalationHandler` in `packages/superconductor-core/src/remediation/deep-research-escalation-handler.ts` [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Sub-task: Construct research request payload from finding + code context + failed attempts
    - [ ] Sub-task: Call existing `deep_research_integration` capability with constructed payload
    - [ ] Sub-task: Inject result into remediator context using spotlighted delimiters (prompt injection defense)
    - [ ] Sub-task: Classify research result as auto-applicable vs. policy-decision-required
- [ ] Task: Write failing tests for policy-decision escalation (human intervention path) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: policy-flagged finding triggers `ask_question` with terminal options only
    - [ ] Test: `Acknowledge & Abort` option halts pipeline
    - [ ] Test: `Acknowledge & Revert` option reverts remediation branch changes
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Deep Research Escalation Integration' (Protocol in workflow.md)

---

## Phase 5: Remediation Log & Observability

- [ ] Task: Write failing tests for `RemediationLogWriter` (log structure, per-finding entries, SHA tracking, token stats) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: log contains correct domain per finding
    - [ ] Test: log contains outcome (RESOLVED|ESCALATED|HUMAN_REQUIRED)
    - [ ] Test: log contains fix commit SHA for RESOLVED findings
    - [ ] Test: `--stats` flag appends token usage section
- [ ] Task: Implement `RemediationLogWriter` in `packages/superconductor-core/src/remediation/remediation-log-writer.ts` [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Wire token tracking (`recordTokenUsage`) for each domain agent into the log [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Remediation Log & Observability' (Protocol in workflow.md)

---

## Phase 6: Standalone Review SKILL.md Extension (§9.0)

- [ ] Task: Draft §9.0 Swarm Remediation Protocol section content (FSM diagram, Domain Map table, hand-off protocol, re-review protocol, deep research escalation, observability) [TIER-4] [AGENT:superconductor-dreamer]
- [ ] Task: Append §9.0 to `skills/standalone-review/SKILL.md` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Sub-task: Add post-review hand-off trigger (§9.1)
    - [ ] Sub-task: Add Domain Map table (§9.2)
    - [ ] Sub-task: Add Remediation FSM lifecycle diagram (§9.3)
    - [ ] Sub-task: Add Fresh Review Gate protocol (§9.4)
    - [ ] Sub-task: Add Deep Research Escalation protocol (§9.5)
    - [ ] Sub-task: Add Observability & Audit Trail spec (§9.6)
    - [ ] Sub-task: Add flag compatibility matrix (`--fast`, `--deep`, `--headless`, `--stats`, `--remediate`) (§9.7)
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Standalone Review SKILL.md Extension' (Protocol in workflow.md)

---

## Phase 7: Standalone Remediation Skill

- [ ] Task: Create `skills/standalone-remediation/` directory and `SKILL.md` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Sub-task: Write skill frontmatter (name, description, detection signals)
    - [ ] Sub-task: Write §1.0 Input Resolution (accept review report path as input)
    - [ ] Sub-task: Write §2.0 Findings Parser (parse review report into structured finding objects)
    - [ ] Sub-task: Write §3.0 Swarm Launch (delegate to `RemediationOrchestrator` with parsed findings)
    - [ ] Sub-task: Write §4.0 Output Protocol (remediation log + updated review report)
- [ ] Task: Write integration test: standalone-remediation skill can consume an existing review report and produce remediation log [TIER-3] [AGENT:superconductor-reviewer]
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Standalone Remediation Skill' (Protocol in workflow.md)

---

## Phase 8: End-to-End Integration & Wiring

- [ ] Task: Wire `RemediationOrchestrator` into standalone-review pipeline (post-findings-report hook) in review SKILL.md §6.0 [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Implement `--remediate` flag handling in standalone-review INPUT RESOLUTION PROTOCOL (§2.0) [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Implement `--headless` auto-launch logic (auto-trigger remediation for CRITICAL/HIGH findings) [TIER-3] [AGENT:superconductor-processor]
- [ ] Task: Run full end-to-end integration test: review a known-bad diff, verify remediation launches, agents are spawned per domain, fresh reviewers validate fixes, log is emitted [TIER-4] [AGENT:superconductor-oracle]
- [ ] Task: Run coverage report and verify >80% coverage for all new `packages/superconductor-core/src/remediation/` modules [TIER-1] [AGENT:superconductor-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 8: End-to-End Integration & Wiring' (Protocol in workflow.md)

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
