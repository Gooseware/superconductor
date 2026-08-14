# Specification: Dynamic Model Chooser & Autonomous Quorum Remediation

## 1. Overview
This track delivers a unified, dynamic Model Chooser and Configuration Management architecture for Superconductor agent roles, an autonomous domain-split Quorum Remediation loop (Quorum → Remediation → Quorum: stop if green, remediate if red, continue until green) across both Track Execution and Standalone Review workflows, and an end-to-end Track Lifecycle Wizard (Interactive vs. Headless gating, Target Branch selection, and Automated Archive/Delete finalization).

## 2. Research Notes
- **Live CLI Model Discovery:** `agy models` fetches real-time available models (Gemini 3.7 Flash, 3.6 Flash, 3.1 Pro, Claude Sonnet 4.6, Claude Opus 4.6, GPT-OSS 120B).
- **24-Hour TTL Caching:** Caching available models to `~/.gemini/models-cache.json` eliminates repetitive network latency and CLI execution overhead, supporting an explicit `--refresh` flag.
- **Hierarchical Persistence:**
  1. *Ephemeral / Session Override* (in-session `/superconductor:models` or CLI flags)
  2. *Project Override* (`superconductor/agent-config.md`)
  3. *Global Override* (`~/.gemini/agent-config.md`)
  4. *Internal Defaults* (`gemini-3.7-flash-high`, `gemini-3.1-pro-high`)
- **Quorum → Remediation → Quorum Loop Protocol:**
  - Standardized across `swarm-execute`, `standalone-review`, and `scripts/quorum-review.ts`.
  - Step 1: Run full 4-panel Quorum (Security, Correctness, Adversarial, Regression).
  - Step 2: If unanimous `RESOLVED` (0 findings) → **STOP IF GREEN** and proceed to approval/merge.
  - Step 3: If any reviewer reports `NEEDS_FIXES` → **REMEDIATE IF RED**:
    - Group findings by domain (`security`, `logic`, `tests`, `types`, `config`).
    - Spawn parallel domain remediators in isolated git worktrees.
    - Merge remediator fixes into the branch.
    - Re-run the full 4-panel Quorum on the complete branch diff (zero-bias re-review).
  - Step 4: Repeat loop until 100% green, or escalate to human-in-the-loop after 3-5 cycles.
- **Track Lifecycle Gating:** Interactive prompts at track launch configure execution mode (Interactive vs Headless) and target branch (default `main`), concluding with merge and archive/delete cleanup.

## 3. Architecture Committee Recommendations
- **Architecture (Dreamer):** Implement `ModelCatalogService` in `packages/superconductor-core/src/models/` for discovery/caching. Expose `ModelChooserDialog` for interactive prompts and `AgentConfigWriter` for markdown updates. Update `skills/standalone-review/SKILL.md` and `skills/standalone-remediation/SKILL.md` with explicit loop directives. Create `/superconductor:models` command (`skills/models/SKILL.md`).
- **Security & Robustness (Reviewer):** Set 5000ms timeout on `agy models` execution; validate model identifier format with strict regex; isolate domain remediators in dedicated git worktrees; enforce FSM state transitions to prevent unbounded remediation loops with deterministic circuit breaker.

## 4. Functional Requirements
- **FR-1 (Model Catalog Service):** Fetch models from `agy models`, parse model IDs and display names, and cache in `~/.gemini/models-cache.json` with a 24-hour TTL.
- **FR-2 (Role-Based Model Chooser):** Allow users to select specific models for each role:
  - Implementor / Processor Swarm (`superconductor-processor`)
  - Reviewer Swarm (`superconductor-reviewer` quorum)
  - Remediator Swarm (`remediation-processor`)
  - Architect / Dreamer (`superconductor-dreamer`)
  - Deep Auditor / Oracle (`superconductor-oracle`)
- **FR-3 (Hierarchical Config Persistence):** Provide options to save model selections:
  - *Globally* (`~/.gemini/agent-config.md`)
  - *Project-wide* (`superconductor/agent-config.md`)
  - *Once-off* (active track / session only)
- **FR-4 (Dedicated Models Command):** Provide `/superconductor:models` command to view and update model assignments at any point (including mid-track).
- **FR-5 (Standalone Review & Quorum Auto-Remediation Loop):**
  - Update `skills/standalone-review/SKILL.md`, `skills/standalone-remediation/SKILL.md`, and `scripts/quorum-review.ts` to embed the full Quorum → Remediation → Quorum loop.
  - Automatically remediate on RED until GREEN across branch diffs, staged changes, PRs, and tracks.
  - Enforce circuit breaker after 3-5 cycles with Deep Research escalation.
- **FR-6 (Track Lifecycle Wizard):**
  - Prompt user at track start: Execution Mode (`Interactive` vs `Headless`) and Target Branch (`main` / `develop` / custom).
  - Prompt user at track end: Merge to target branch, followed by Archive (`superconductor/archive/<track_id>`) or Delete.

## 5. Non-Functional Requirements
- **NFR-1 (Performance):** Model cache read must be synchronous / near-instant (< 10ms).
- **NFR-2 (Reliability):** If `agy models` fails or times out, fallback seamlessly to internal cached or default model list.
- **NFR-3 (Safety):** Remediator swarms must operate in isolated worktrees to avoid file contention.

## 6. Acceptance Criteria
- [ ] AC-1: `ModelCatalogService` executes `agy models`, caches results to `~/.gemini/models-cache.json` with timestamp, and respects 24-hr TTL.
- [ ] AC-2: `AgentConfigWriter` reads and updates `superconductor/agent-config.md` and `~/.gemini/agent-config.md` with role-based model assignments without destroying existing comments.
- [ ] AC-3: `ModelChooserDialog` allows interactive selection of models per role and selection of persistence scope (Global / Project / Once-off).
- [ ] AC-4: Dedicated `/superconductor:models` skill and command is registered and functional.
- [ ] AC-5: `skills/standalone-review/SKILL.md`, `skills/standalone-remediation/SKILL.md`, `skills/swarm-execute/SKILL.md`, and `scripts/quorum-review.ts` implement the continuous Quorum → Remediation → Quorum loop (stop if green, remediate if red until green).
- [ ] AC-6: Track lifecycle flow prompts for execution mode & target branch at launch, and executes merge + archive/delete upon completion.
- [ ] AC-7: Unit and integration tests cover model catalog caching, config resolution/writing, standalone review quorum loop, and lifecycle wizard.
