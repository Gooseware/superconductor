# Track Specification: Swarm Orchestrator Protocol

## Overview
This track implements a production-grade **Swarm Orchestrator Protocol** for the Superconductor framework. The root-level implementing model is refactored to be a **pure delegator** — its only role is to spawn and coordinate a Swarm Orchestrator agent, then await structured results. The Swarm Orchestrator is a first-class autonomous agent (a Control Plane) that manages an Implementor Swarm and a Review Quorum Swarm in parallel, routing focused feedback directly to the specific implementor responsible for each finding.

The track begins with a mandatory full-repository baseline review to produce a Topography Map and a prioritized findings queue.

---

## §1 Research Notes (Best Practices, 2025–2026)

- **State-of-the-art:** Short-lived, single-responsibility sub-agents orchestrated by a central supervisor; externalized state with deterministic exit gates.
- **Context Drift:** The #1 failure mode for long-horizon agents. Mitigated via scope restriction (keyhole views), ephemeral agent lifecycles, and hard scope boundaries enforced at the tool level.
- **Quorum Delegator Pattern:** Rather than one model making decisions, an arbitrated quorum of decorrelated reviewers (Security, Correctness, Adversarial) eliminates single-model domain blind spots.
- **Focused Diagnostic Feedback:** Error signals must be formatted and delivered to the owning agent's context window with only the localized diff, failing test, and targeted comment — stripping all irrelevant noise.

---

## §2 Architecture Committee Recommendations

### Dreamer (Structural) Position
- The Swarm Orchestrator is a **state machine** managing WorkUnit states: `Pending → Implementing → Reviewing → Refining → Done`.
- **Domain-Based Affinity Routing:** Every ReviewFinding is tagged with a file/component domain. The Orchestrator matches the tag to the Implementor registry and delivers a keyhole-scoped payload.
- **Zero-Trust Context Model for Implementors:** Each implementor receives only the files for its assigned domain, has a fixed exit condition, and is forbidden from modifying out-of-scope files.
- **Baseline Topography Map** produced by the initial repo review: dependency graph, hotspot analysis, test coverage map, and proposed domain partitions.

### Security & Performance (Reviewer) Position
- **Quorum-Gated Parallelism:** All implementors run fully concurrently at all times. When ANY red finding arrives, only the affected implementor(s) pause; unaffected implementors continue uninterrupted.
- **Hard Iteration Cap:** Max 5 review→remediate cycles per WorkUnit before mandatory Oracle escalation.
- **State Hash Tracking:** Orchestrator tracks diff hashes to detect thrashing (oscillating between two rejected states) and halts the cycle.
- **Hierarchical Conflict Arbitration:** Security > Performance > UX. Oracle auto-resolves using strict priority rules; the Oracle's ruling suppresses the overridden finding.
- **Commit Gating:** All commits to the tracked branch require a Consensus Artifact — a cryptographically verifiable payload proving 100% green from the full quorum, with all arbitrations documented.

### Surgical Enhancement Points (from Repo Survey)
The following existing components will be surgically enhanced (not rebuilt):
- `packages/superconductor-core/src/review/aggregate-findings.ts` → add `KeyholeFeedbackExtractor`
- `packages/engine/src/verification/quorum-review-loop.ts` → add state hash tracking, use keyhole payloads
- `packages/engine/src/dispatcher/parallel-dispatcher.ts` → embed inline quorum gate
- `packages/engine/src/dispatcher/` → add `ImplementorRegistry` with domain-affinity routing
- `packages/superconductor-core/src/track/swarm-authorizer.ts` → extend with `ConsensusArtifact` schema
- `packages/superconductor-core/src/intelligence/` → add `TopographyMap` and `DomainPartitioner`
- `scripts/quorum-review.ts` → refactor to deterministic CLI harness (no LLM orchestration logic)

**New artifacts (do not exist yet):**
- `skills/swarm-execute/SKILL.md`
- `packages/superconductor-core/src/cli/SwarmOrchestratorCLI`
- `packages/superconductor-core/src/track/WorkUnit` + `WorkUnitStateMachine`

---

## §3 Functional Requirements

### FR-1: Root Agent as Pure Delegator
- The root implementing agent MUST NOT perform implementation directly.
- Its sole responsibilities are: spawn the Swarm Orchestrator, pass the track spec and Topography Map, then await a structured completion signal.
- The root agent may issue course corrections if the Orchestrator signals an escalation (Oracle invocation or HITL request).

### FR-2: Phase 0 — Repository-Wide Baseline Review
- Before any implementation begins, the Swarm Orchestrator spawns a full quorum review panel against the entire repository.
- **Output (Topography Map):**
  - Dependency graph of core modules
  - Hotspot analysis (complexity, churn, debt indicators)
  - Test coverage map (per-module, identifies gaps)
  - Proposed domain partitions (logical boundaries for implementor assignment)
- **Output (Findings Queue):**
  - Prioritized severity-ranked list of all existing issues
  - Each finding tagged with: `FindingID`, `domain`, `file`, `line_range`, `severity`, `category`, `description`, `recommendation`
- Both outputs serialized to `superconductor/tracks/<id>/topography.json`

### FR-3: Swarm Orchestrator Control Plane
- Manages a WorkUnit registry mapping each unit to its assigned Implementor agent.
- Tracks state machine per WorkUnit: `Pending → Implementing → Reviewing → Refining → Done`.
- Spawns implementors with a zero-trust keyhole view (domain-scoped files only).
- Spawns the Review Quorum Swarm (Security + Correctness + Adversarial reviewers) in parallel.

### FR-4: Quorum-Gated Parallelism
- All implementors run fully concurrently at all times.
- When a red finding arrives from the quorum:
  - Only the implementor(s) whose domain matches the finding's tag are paused and given a focused remediation task.
  - All other implementors continue executing their work units uninterrupted.
- Implementors are not done until the quorum returns all-green for their domain.

### FR-5: Focused Feedback Routing (Keyhole Payload)
- Each ReviewFinding is delivered to the responsible implementor as a keyhole payload:
  - The finding message and recommendation
  - ±50 lines of surrounding file context
  - The original WorkUnit spec
  - The specific failing test output (if applicable)
- No other context is included in the remediation prompt.

### FR-6: Quorum Conflict Arbitration
- When two quorum reviewers issue mutually exclusive CRITICAL findings, the Orchestrator escalates to the Oracle.
- The Oracle applies hierarchical priority rules: **Security > Performance > UX**.
- The Oracle's ruling is appended to the Consensus Artifact; the overridden finding is suppressed with a documented rationale.

### FR-7: Loop Termination Safeguards
- Hard cap: max 5 review→remediate cycles per WorkUnit.
- State hash tracking: if the same diff hash recurs (thrashing), halt and escalate.
- Upon cap breach or thrash detection: escalate to Oracle or HITL.

### FR-8: Commit Gating via Consensus Artifact
- No commit to the track branch is permitted until the Consensus Artifact is generated.
- Consensus Artifact schema: `{ trackId, timestamp, workUnitResults[], quorumSignatures[], arbitrations[], allGreen: bool }`.
- The Swarm Authorizer appends this artifact as a commit trailer (extends existing `SwarmAuthorizer`).

### FR-9: `swarm-execute` Skill & Command
- A new `/superconductor:swarm-execute` slash command is the single entry point for this protocol.
- Accepts a track ID, loads the topography map, and orchestrates the full implementor + quorum loop.
- Streams live swarm status (agent IDs, domain assignments, WorkUnit states, quorum verdicts) to stdout throughout execution.

---

## §4 Non-Functional Requirements

- **NFR-1 (Context Isolation):** Each implementor context window must contain only domain-scoped content. Cross-domain file access is prohibited.
- **NFR-2 (Token Economics):** Per-track token budget tracked in real-time. Orchestrator calculates projected token burn before spawning new agents.
- **NFR-3 (Audit Trail):** Every agent action, finding, and arbitration is logged with a trace ID. Logs are immutable and attached as git notes.
- **NFR-4 (Iteration Bounds):** Max 5 remediation cycles per WorkUnit; max 3 Oracle escalations per track before requiring HITL.
- **NFR-5 (Observability):** The Orchestrator streams a live swarm status log accessible throughout execution.
- **NFR-6 (Surgical Enhancement):** Existing machinery must be enhanced, not replaced. The `QuorumReviewLoop`, `ParallelDispatcher`, `SwarmAuthorizer`, and `codebase-chunker` are enhanced in-place.

---

## §5 Acceptance Criteria

1. **AC-1:** Running `/superconductor:swarm-execute` on a track produces a `topography.json` (Topography Map + Findings Queue) before any implementation work begins.
2. **AC-2:** The root implementing agent makes zero direct code changes — all changes flow through the Orchestrator → Implementors pipeline.
3. **AC-3:** When a quorum red finding is issued, only the responsible implementor is paused; a trace log proves all other implementors continued uninterrupted.
4. **AC-4:** The remediation payload delivered to an implementor contains exactly: finding + ±50 lines context + original WorkUnit spec — no more, no less.
5. **AC-5:** No commit lands on the track branch without a valid Consensus Artifact with `allGreen: true`.
6. **AC-6:** Quorum conflicts are resolved by the Oracle using Security > Performance > UX hierarchy; the ruling is documented in the Consensus Artifact.
7. **AC-7:** A WorkUnit that hits the 5-iteration cap triggers an Oracle escalation with a written ruling, not a silent pass.
8. **AC-8:** `/superconductor:swarm-execute` is discoverable as a slash command and invocable from the CLI.

---

## §6 Out of Scope

- UI/frontend changes to the Superconductor shell.
- Changes to existing track data structures (`plan.md` format) — the Orchestrator reads existing format.
- Deployment infrastructure or CI/CD pipeline changes.
- MCP server or Design OS kernel modifications.
- Rebuilding any existing component from scratch — only surgical enhancement.
