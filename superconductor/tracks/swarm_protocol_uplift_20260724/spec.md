# Spec: Swarm Protocol Uplift — Review Gate, ABI Self-Improvement & Plugin UX Audit

## Overview
This track formalizes and implements three major improvements to the Superconductor swarm protocol:
1. **Review Swarm as Quality Gate** — the 3-reviewer Flash panel (security, correctness, adversarial) replaces the Oracle as the per-phase task gate, blocking task completion until a consensus PASS is achieved.
2. **ABI Self-Improvement Loop** — the ABI process uses the Review Swarm + Oracle post-mortem to generate incremental skill tweaks, stored in `$HOME/.superconductor/skills/` (git-tracked, user-owned, eventually promotable upstream).
3. **Plugin UX Audit** — a final pass reviewing the flow of `/setup`, `/new-track`, and `/implement` commands for smoothness and utility, adding Mermaid flow diagrams to each.

## Architectural Committee Recommendations

### Goal 1: Review Swarm as Phase Gate
- Run 3 Flash reviewers concurrently via `invoke_subagent` after each phase boundary.
- Context minimization: provide only task spec + git diff + modified files (not full project context) to minimize token cost.
- Implement a hard cap of 2 auto-remediation retry attempts; third failure escalates to Oracle (Tier-4) + human attention.
- Tasks remain `[~]` until the swarm emits a consensus PASS.

### Goal 2: ABI + Review Swarm → Skill Improvement Loop
- Oracle runs an async post-mortem after each track completes, analyzing Review Swarm failure/retry logs.
- Produces one primary skill tweak (highest expected impact) + ranked secondary candidates listed separately.
- Primary tweak is auto-applied; secondary candidates are logged in git commit body for future consideration.
- Skills live in `$HOME/.superconductor/skills/` — seeded from plugin, independently git-tracked, one atomic commit per tweak.

### Goal 3: Summary Data via Git Notes
- Structured JSON payloads attached to phase checkpoint commits via `git notes append --ref=refs/notes/quality`.
- Immutable, version-coupled, auditable without extra files in the working tree.
- `/superconductor:status` surfaces these notes as a human-readable dashboard.

### Goal 4: Plugin UX — Progressive Disclosure
- Commands output minimal, actionable text by default.
- Power users get `--verbose`/`--debug` flags for inner monologue streaming.
- All commands must be strictly idempotent.

## Research Notes
- Heterogeneous review panels (isolated roles, no self-review) significantly outperform monolithic reviewers. Cheap deterministic checks (SAST, linters) should fire *before* LLM passes.
- Git notes (`refs/notes/quality`) are industry standard for immutable, auditable, version-coupled quality metadata.
- Self-improving systems benefit from *incremental single-tweak experiments* + trajectory feedback stores (`(state, action, critique, metric_score)` tuples).
- Canonical skill evaluation dimensions: tool-calling accuracy, cost-per-successful-task, deterministic assertion pass rates.

## Functional Requirements

### FR-1: Review Swarm Phase Gate
- FR-1.1: After each phase completion, the 3-reviewer swarm fires concurrently.
- FR-1.2: Tasks remain `[~]` until the swarm emits a `PASS` consensus (no CRITICAL findings).
- FR-1.3: CRITICAL findings trigger a remediation processor; ADVISORY findings are injected as context for the next task.
- FR-1.4: Maximum 2 auto-remediation attempts; third failure escalates to Oracle + human.
- FR-1.5: Reviewer skills loaded from `$HOME/.superconductor/skills/` with fallback to plugin defaults.

### FR-2: ABI Self-Improvement Loop
- FR-2.1: After each track completes, the Oracle runs an async post-mortem analyzing Review Swarm failure/retry logs from `swarm_log.md`.
- FR-2.2: The Oracle proposes one primary skill tweak (highest expected impact) and lists secondary candidates separately.
- FR-2.3: The primary tweak is auto-applied to the relevant skill file in `$HOME/.superconductor/skills/`.
- FR-2.4: A git commit is made in `$HOME/.superconductor/` with message: `abi(skill/<filename>): <description>`.
- FR-2.5: A summary note is appended to the track's final checkpoint commit via `git notes append --ref=refs/notes/quality`.
- FR-2.6: Secondary tweaks are listed in the git commit body as `CANDIDATE_TWEAKS` for future consideration.
- FR-2.7: `$HOME/.superconductor/` is seeded by the plugin install but independently git-tracked. A future `/superconductor:promote-skill` command (out of scope) would push verified tweaks upstream.

### FR-3: Quality Summary via Git Notes
- FR-3.1: Each phase checkpoint commit receives a structured JSON payload via `git notes append --ref=refs/notes/quality`.
- FR-3.2: Payload schema:
  ```json
  {
    "track_id": "string",
    "phase": "string",
    "timestamp": "ISO8601",
    "swarm_pass_rate": "float (0-1)",
    "retry_count": "int",
    "critical_findings": "int",
    "advisory_findings": "int",
    "token_usage_estimate": "int",
    "abi_tweaks_applied": ["skill_filename:description"]
  }
  ```
- FR-3.3: The `/superconductor:status` command displays a summary of these notes for the current track.

### FR-4: Plugin UX Audit
- FR-4.1: Conduct structured audit of `skills/setup/SKILL.md`, `skills/new-track/SKILL.md`, and `skills/implement/SKILL.md`.
- FR-4.2: For each command, verify: clear entry point, logical step ordering, well-scoped questions, graceful failure handling, and useful output.
- FR-4.3: Document findings and apply fixes.
- FR-4.4: Each command skill file must include a `## Command Flow Diagram` (Mermaid) summarizing the happy path.

## Non-Functional Requirements
- Token budget for per-phase gate targeted at <3x single-Oracle cost via context minimization.
- `$HOME/.superconductor/skills/` must be initialized as a git repo on first use (idempotent).
- All ABI skill tweaks must be atomic (one file change per commit) and revertable.
- Gate logic must be idempotent (safe to re-run after partial failures).

## Acceptance Criteria
- [ ] Phase gate fires after each phase and blocks completion on CRITICAL findings.
- [ ] `$HOME/.superconductor/skills/` is initialized and contains seeded reviewer skill files.
- [ ] After a completed track, Oracle produces ABI post-mortem and commits one skill tweak.
- [ ] Git notes on checkpoint commits contain the structured quality JSON payload.
- [ ] `/superconductor:status` surfaces quality note summaries for the current track.
- [ ] `skills/setup/SKILL.md`, `skills/new-track/SKILL.md`, `skills/implement/SKILL.md` all have Mermaid flow diagrams and audited step ordering.

## Out of Scope
- `/superconductor:promote-skill` (upstream skill promotion — future track).
- Vector-database or RAG-based ABI memory.
- Real-time token telemetry (covered by `token_estimation_20260723` track).
- Full CLI `--verbose`/`--debug` flag implementation (future UX polish track).
