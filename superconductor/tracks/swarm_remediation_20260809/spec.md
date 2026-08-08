# Specification: Standalone Review — Swarm Remediation Engine
**Track Type:** Feature  
**Track Shortname:** `swarm_remediation`  
**Track ID:** `swarm_remediation_20260809`  
**Created:** 2026-08-09

---

## Overview

The current standalone review system (`/superconductor:review`) is a world-class detection engine — it finds problems but stops short of fixing them. This track adds a **Swarm Remediation Engine** that activates after the review pipeline completes, spawning domain-specialized agents to resolve findings autonomously, calling in a Deep Research team for complex problems that exceed the swarm's local knowledge, and looping back through a fresh (zero-bias) reviewer panel before merging any fix.

The remediation swarm is **kept alive across the entire review+remediate cycle** to preserve context window and avoid re-loading expensive repo context. The review swarm is always started **fresh** to prevent anchoring bias from contaminating findings verdicts.

---

## Architecture Committee Recommendations

### Dreamer (Tier 4 — Architecture)
- **Bounded Context Dispatch:** Spawning strategy should be file/domain heuristic-based (e.g. `auth/*` → security-remediator, `ui/*` → frontend-remediator, `db/*` → schema-remediator). This keeps each agent's context surface narrow and reduces hallucination risk.
- **Context Preservation:** The remediation swarm orchestrator must maintain a **shared state object** (finding index, attempted fixes, retry counts, deep research results) that survives across the entire review→remediate loop.
- **Stateful FSM:** Model the remediation lifecycle as a Finite State Machine: `IDLE → ANALYZING → DISPATCHING → REMEDIATING → RE-REVIEWING → RESOLVED | ESCALATED`.

### Reviewer (Tier 4 — Security & Performance)
- **Bias Isolation:** Fresh reviewer swarm per re-review cycle is mandatory. Share ONLY the finding fingerprint (severity, file, rule ID) as context — not the prior reviewer's reasoning. This prevents the new reviewer from unconsciously agreeing with the prior conclusion.
- **Least-Agency Principle:** Agents must operate with minimum permissions. Only the remediation agent that "owns" a specific file cluster should have write access to that cluster.
- **Defensive Prompting:** Deep research results injected into remediator context must be sandboxed (spotlighting with explicit delimiters) to prevent prompt injection via malicious advisory content.
- **Timeout Guardrails:** All subagent spawns must have hard timeout boundaries. An agent that exceeds its time budget is escalated, not silently discarded.

---

## Research Notes (Best Practices 2026)

- **Domain-Driven Dispatch** is the 2026 consensus pattern: specialized bounded-context agents consistently outperform generalist agents on remediation tasks.
- **Context Engineering** over prompt engineering: remediation agents need the full repo semantic graph, not just the finding. The existing `IntelligenceSnapshotReader` / RepoContext should be injected.
- **Stateful Cyclic Graphs** (e.g. LangGraph pattern): the remediation loop must be a proper FSM with well-defined transitions, not a linear chain.
- **Human-on-the-Loop**: Human approval gate only at: (a) final merge, (b) when the swarm exhausts retry budget without resolution, (c) when deep research team returns a finding flagged as requiring policy decisions.
- **OWASP ASI Top 10 (2026)**: Prompt injection prevention, agent sandbox boundaries, and observability (decision pathway logging) are mandatory for any agentic remediation pipeline.
- **Token Economics**: Use frontier models (Tier 4) for orchestration decisions; use Flash-class (Tier 3) for mechanical code application tasks. Deep research is always Tier 4.

---

## Functional Requirements

### FR-1: Post-Review Remediation Hand-Off
- After the standalone review pipeline emits its findings report, the orchestrator automatically offers to launch the Swarm Remediation Engine.
- In `--fast` mode, remediation offer is skipped unless `--remediate` is explicitly passed.
- In `--headless` mode, remediation auto-launches if any CRITICAL or HIGH findings exist.

### FR-2: Finding Classification & Domain Mapping
- Each finding from the review report is classified by affected file path against a **Domain Map**:
  - `auth/`, `middleware/`, `session/`, `jwt/` → `security-remediator`
  - `ui/`, `components/`, `pages/`, `styles/` → `frontend-remediator`
  - `db/`, `models/`, `migrations/`, `repository/` → `schema-remediator`
  - `test/`, `__tests__/`, `*.spec.*`, `*.test.*` → `test-writer`
  - `api/`, `routes/`, `controllers/` → `api-remediator`
  - Unclassified → `general-remediator`
- Findings targeting the same domain are **batched** and dispatched to a **single live remediator agent** for that domain (context preservation).

### FR-3: Remediation Swarm Lifecycle (Context-Preserving)
- The **Remediation Swarm Orchestrator** is spawned once at the start of the remediation phase and remains alive for the full cycle.
- Domain-specialized remediator subagents are spawned under the orchestrator and communicate via secured agent-to-agent messaging (SenderID-verified).
- The orchestrator maintains a **Remediation State Object** containing: `{ findingIndex, domainAssignments, retryCount, deepResearchResults, fixedFindings, failedFindings }`.

### FR-4: Retry Budget & Auto-Remediation Loop
- For each domain batch:
  1. Remediator agent attempts fix (direct code edit + run tests).
  2. If tests fail or code review gate rejects: retry (max 2 attempts).
  3. After 2 failed retries → escalate to Deep Research Team.

### FR-5: Deep Research Team Integration
- When a finding exceeds the swarm's local knowledge (exhausted retries), the orchestrator calls the **Deep Research Team** (existing `deep_research_integration` capability).
- Research request includes: finding description, affected code context, error messages, previous fix attempts.
- Research result is injected into the remediator's context (spotlighted/sandboxed) for a final attempt.
- If the deep research response requires a policy or architectural decision, it is surfaced to the user (not auto-applied).

### FR-6: Fresh Review Gate (Zero-Bias Re-Review)
- After each domain batch completes remediation, a **fresh review swarm** is spawned (new conversation IDs, no shared state with prior reviewers).
- The re-review receives only: the git diff of the fix, the original finding fingerprint (severity + rule ID), and the deterministic preflight output.
- It does NOT receive the prior reviewer's reasoning or verdict rationale (to prevent anchoring bias).
- The re-review must emit a `json:review-findings` block; if the fix resolves the finding, status is `RESOLVED`.

### FR-7: Hard-Block Merge Gate
- The orchestrator MUST NOT allow any remediated fix to be committed to the branch until the fresh re-review emits `RESOLVED` for that finding.
- CRITICAL findings that are not `RESOLVED` after the deep research escalation path block the pipeline and force human intervention via `ask_question` (terminal options: `Acknowledge & Abort` | `Acknowledge & Revert`).

### FR-8: Observability & Audit Trail
- A `remediation_log.md` is written alongside the review report with the structure:
  ```
  # Remediation Log — <target> — <timestamp>
  ## Finding: <id>
  - Domain: <domain>
  - Agent: <agent_id>
  - Attempts: <N>
  - Deep Research Called: yes|no
  - Outcome: RESOLVED | ESCALATED | HUMAN_REQUIRED
  - Fix SHA: <commit_sha>
  ```
- Token usage per domain agent is tracked and appended to the Token Efficiency Report (if `--stats`).

### FR-9: Skill Extension (New §9.0 in standalone-review SKILL.md)
- The standalone review SKILL.md gains a new **§9.0 Swarm Remediation Protocol** section describing the post-review hand-off, domain map, lifecycle FSM, re-review protocol, and deep research escalation.

### FR-10: Standalone Remediation Skill
- A new standalone skill `standalone-remediation` is created that:
  - Accepts any existing review report file as input.
  - Parses findings and launches the Swarm Remediation Engine directly.
  - Enables re-running remediation without re-running the full review pipeline.

---

## Non-Functional Requirements

- **NFR-1:** Remediation swarm orchestrator must hard-timeout each domain agent at 10 minutes. Exceeded agents are logged as `ESCALATED`.
- **NFR-2:** Zero shared context between fresh review swarm agents and prior review swarm (strict bias isolation).
- **NFR-3:** All agent-to-agent messages must be verified by SenderID before processing.
- **NFR-4:** Deep research injection must use delimiter-based spotlighting to prevent prompt injection.
- **NFR-5:** The system must be compatible with `--fast`, `--deep`, `--headless`, and `--stats` flags from the parent review invocation.
- **NFR-6:** Token budget: use Tier-3 (Flash) for mechanical code application; Tier-4 (Pro/Sonnet Thinking) for orchestration, deep research, and re-review arbiter.

---

## Acceptance Criteria

- [ ] AC-1: After a review report is emitted, the system offers (or in headless auto-launches) the Swarm Remediation Engine.
- [ ] AC-2: Findings are correctly classified to domain remediator agents using the Domain Map.
- [ ] AC-3: Findings in the same domain are batched and sent to a single live agent (not spawned fresh per finding).
- [ ] AC-4: Remediator agents retry up to 2 times before escalating to deep research.
- [ ] AC-5: Deep research integration is called with full context including prior fix attempts.
- [ ] AC-6: Fresh (zero-bias) review swarms are spawned per re-review, receiving only finding fingerprint + diff.
- [ ] AC-7: CRITICAL findings that remain unresolved after deep research escalation hard-block the pipeline and present terminal options to the user.
- [ ] AC-8: `remediation_log.md` is written with per-finding outcome and SHA.
- [ ] AC-9: `standalone-review SKILL.md` gains a §9.0 Swarm Remediation Protocol section.
- [ ] AC-10: A new `standalone-remediation` skill exists and accepts an existing review report as input.
- [ ] AC-11: `--fast` mode skips auto-remediation unless `--remediate` flag is explicit.
- [ ] AC-12: `--headless` mode auto-launches remediation for CRITICAL/HIGH findings.

---

## Out of Scope

- Remediation of findings in third-party/vendor dependencies (out-of-repo).
- Visual (VLM) remediation of design system deviations (handled by Vision Oracle).
- Automated deployment post-remediation (separate deployment workflow).
- A dedicated `/superconductor:remediate` slash command (may be added in a future track).
