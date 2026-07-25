# Implementation Plan: Swarm Protocol Uplift — Review Gate, ABI Self-Improvement & Plugin UX Audit

## Phase 0: Swarm Preflight
- [ ] Task: Verify if `swarm-orchestrate` skill is installed and loaded. [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: User-Owned Skill Directory Initialization
- [x] Task: Create initialization logic for `$HOME/.superconductor/skills/` — if not present, init a git repo and seed reviewer skill files from plugin defaults. [TIER-3] [AGENT:caduceus-processor]
    - [x] Detect if `$HOME/.superconductor/` exists as a git repo; if not, run `git init`.
    - [x] Copy `security-reviewer`, `correctness-reviewer`, `adversarial-reviewer`, and `coding-agent` SKILL.md files from the plugin's `skills/` into `$HOME/.superconductor/skills/`.
    - [x] Make an initial seed commit: `chore(abi): seed user skill directory`.
    - [x] Operation must be fully idempotent (safe to run if directory/repo already exists).
- [x] Task: Update `swarm-orchestrate/SKILL.md` to load reviewer skills from `$HOME/.superconductor/skills/` with fallback to plugin defaults. [TIER-3] [AGENT:caduceus-processor]
- [x] Task: Write unit tests for the seed logic (idempotency, existing git repo handling, missing plugin defaults). [TIER-3] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: User-Owned Skill Directory Initialization' (Protocol in workflow.md)

## Phase 2: Review Swarm Phase Gate & Pair Programming
- [x] Task: Implement `SwarmPhaseGate` logic — fires 3-reviewer Flash panel concurrently after each phase completion. [TIER-3] [AGENT:caduceus-processor]
    - [ ] Context minimization: provide only task spec + git diff + modified files (not full project context).
    - [ ] Consensus algorithm: PASS if no CRITICAL findings across all 3 reviewers; ADVISORY findings injected as context for next task.
    - [ ] Hard cap: 2 auto-remediation attempts, then escalate to Oracle (Tier-4) + human.
    - [ ] Tasks remain `[~]` state until Phase Gate emits PASS.
- [x] Task: Implement Pair Programming Mode for the Coding Swarm. [TIER-3] [AGENT:caduceus-processor]
    - [ ] Ensure that during task implementation, a coder agent and a review agent work in a pair concurrently (tight loop).
    - [ ] Update `swarm-orchestrate/SKILL.md` to document the new Pair Programming Mode and the Phase Gate protocol.
- [x] Task: Update `workflow.md` Phase Completion protocol to integrate the Phase Gate as a mandatory step before checkpointing. [TIER-3] [AGENT:caduceus-processor]
- [x] Task: Write integration tests for the Phase Gate (happy path, CRITICAL escalation, 2-retry limit reached) and Pair Programming loop. [TIER-3] [AGENT:caduceus-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Review Swarm Phase Gate' (Protocol in workflow.md)

## Phase 3: ABI Self-Improvement Loop
- [x] Task: Implement `ABIPostMortem` Oracle module — triggered after track completion, analyzes Review Swarm failure/retry logs from `swarm_log.md`. [TIER-4] [AGENT:caduceus-oracle]
    - [x] Parse swarm_log for CRITICAL/ADVISORY patterns and retry counts.
    - [x] Produce structured `ABIReport`: one primary tweak + ranked secondary candidates.
- [x] Task: Implement `ABI.applySkillTweak()` — applies the primary tweak to the appropriate skill file in `$HOME/.superconductor/skills/`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Atomic write: one file, one semantic change.
    - [x] Commit in `$HOME/.superconductor/` with message: `abi(skill/<filename>): <description>`.
    - [x] Log `CANDIDATE_TWEAKS` (secondary) in commit body for future reference.
- [x] Task: Write unit tests for `ABIPostMortem` and `applySkillTweak` (idempotency, partial failure recovery, schema validation). [TIER-3] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: ABI Self-Improvement Loop' (Protocol in workflow.md)

## Phase 4: Quality Git Notes Schema
- [x] Task: Define and implement `QualityNotesWriter.appendPhaseNote()` — writes quality JSON payload to the checkpoint commit via `git notes append --ref=refs/notes/quality`. [TIER-3] [AGENT:caduceus-processor]
    - [x] Payload schema: `{ track_id, phase, timestamp, swarm_pass_rate, retry_count, critical_findings, advisory_findings, token_usage_estimate, abi_tweaks_applied[] }`.
    - [x] Note append must be idempotent (check for existing note before write).
- [x] Task: Update `workflow.md` Phase Completion Checkpointing Protocol (Step 8) to include the quality notes write step using `QualityNotesWriter`. [TIER-3] [AGENT:caduceus-processor]
- [x] Task: Update `/superconductor:status` SKILL.md to read and display quality notes summary for the current track via `git notes show --ref=refs/notes/quality <sha>`. [TIER-3] [AGENT:caduceus-processor]
- [x] Task: Write unit tests for `QualityNotesWriter` (note creation, append idempotency, JSON schema validation, missing note handling). [TIER-3] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Quality Git Notes Schema' (Protocol in workflow.md)

## Phase 5: Plugin UX Audit
- [x] Task: Audit `skills/setup/SKILL.md` — verify entry point clarity, step ordering, graceful failure handling, idempotency; fix issues; add `## Command Flow Diagram` (Mermaid, happy path). [TIER-4] [AGENT:caduceus-oracle]
- [x] Task: Audit `skills/new-track/SKILL.md` — verify spec questioning phase, plan generation flow, spec confirmation, artifact creation; fix issues; add `## Command Flow Diagram` (Mermaid, happy path). [TIER-4] [AGENT:caduceus-oracle]
- [x] Task: Audit `skills/implement/SKILL.md` — verify TDD loop clarity, phase gate integration point, headless vs interactive branching, escalation paths; fix issues; add `## Command Flow Diagram` (Mermaid, happy path). [TIER-4] [AGENT:caduceus-oracle]
- [x] Task: Superconductor - User Manual Verification 'Phase 5: Plugin UX Audit' (Protocol in workflow.md)

## Phase X: Integration & Finalization
- [x] Task: Integrate track 'swarm_protocol_uplift_20260724' into main branch. [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase X: Integration & Finalization' (Protocol in workflow.md)
