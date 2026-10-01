# Implementation Plan: Prime Directive, Vibe, Deep Research & Antichain Swarm

**Status:** [x]

## Phase 0: Environment Detection & Prime Directive

- [x] Task: Add Environment Detection to Setup Skill [TIER-3] [AGENT:superconductor-processor]
    CREATES: skills/setup/SKILL.md, skills/worktrunk/SKILL.md, skills/implement/SKILL.md
    PROTECTED: superconductor/workflow.md
    INVARIANT_AFTER: "The setup and implementation skills MUST dynamically check for wt, superpowers, and uv dependencies before starting work."
    - [x] Update `skills/worktrunk/SKILL.md` to check for `wt` CLI and offer cargo/binary installation.
    - [x] Update `skills/setup/SKILL.md` to verify `extension-enablement.json` and superpowers folder.
    - [x] Update `skills/implement/SKILL.md` to verify `uv` and python environment.

## Phase 1: Electric Craftsman Prompt Architecture

- [x] Task: Inject Craftsman Persona to Agent Configs [TIER-2] [AGENT:superconductor-processor]
    CREATES: superconductor/agent-config.md
    PROTECTED: superconductor/tracks.md
    INVARIANT_AFTER: "Agent config MUST contain the explicit Electric Craftsman flow-state directives."
    - [x] Add the Electric Craftsman prompt to the project-level `agent-config.md`.

- [x] Task: Update Remediator Prompt Builder [TIER-3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/swarm/RemediatorPromptBuilder.ts
    PROTECTED: packages/superconductor-core/src/swarm/SwarmOrchestrator.ts
    INVARIANT_AFTER: "RemediatorPromptBuilder MUST dynamically inject the craftsman persona into all generated prompts."
    - [x] Modify `RemediatorPromptBuilder.ts` to hardcode the high-agency, creative flow directive.

## Phase 2: Hunch-to-Roundhouse-Punch Deep Research Gate

- [x] Task: Integrate Deep Research Phase into Track Generation [TIER-3] [AGENT:superconductor-processor]
    CREATES: skills/new-track/SKILL.md, superconductor/workflow.md
    PROTECTED: skills/swarm-execute/SKILL.md
    INVARIANT_AFTER: "new-track SKILL MUST explicitly invoke gemini-deep-research before spec generation."
    - [x] Update `skills/new-track/SKILL.md` to include a Deep Research phase exploring "what-ifs".
    - [x] Ensure the process pushes Obsidian artifacts to `/home/gooseware/repos/gemini/gemini-obsidian/Research/`.
    - [x] Update `superconductor/workflow.md` to document the Hunch-to-Roundhouse-Punch pipeline.

## Phase 3: Antichain Swarm Dogma Purge in Skills

- [x] Task: Purge Phase-Waterfall Dogma [TIER-3] [AGENT:superconductor-processor]
    CREATES: skills/implement/SKILL.md, skills/swarm-execute/SKILL.md, skills/batch-execute/SKILL.md
    PROTECTED: skills/new-track/SKILL.md
    INVARIANT_AFTER: "Skills MUST NOT contain sequential phase-waterfall limitations."
    - [x] Remove sequential rules ("Every plan phase MUST be delegated...") from skills.

- [x] Task: Implement TaskWavePlanner Concurrency Guard [TIER-3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/swarm/TaskWavePlanner.ts
    PROTECTED: packages/superconductor-core/src/swarm/SwarmOrchestrator.ts
    INVARIANT_AFTER: "TaskWavePlanner MUST halt execution if dispatchable concurrent tasks are artificially serialized."
    - [x] Introduce topological antichain waves.
    - [x] Implement Concurrency Guard check and alert.

## Phase 4: Superpowers Skill Bridging

- [x] Task: Bridge Superpowers Skills in Workflows [TIER-3] [AGENT:superconductor-processor]
    CREATES: superconductor/workflow.md, skills/implement/SKILL.md
    PROTECTED: superconductor/tracks.md
    INVARIANT_AFTER: "Superconductor workflows MUST explicitly reference Superpowers skills for brainstorming and execution."
    - [x] Map superconductor workflows to `brainstorming`, `writing-plans`, `test-driven-development`, and `systematic-debugging` in `workflow.md`.

## Phase 5: Verification & Integration Tests

- [x] Task: Write Tests for Concurrency Guard & Prompt Builder [TIER-3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/test/swarm/TaskWavePlanner.test.ts, packages/superconductor-core/test/swarm/RemediatorPromptBuilder.test.ts
    PROTECTED: packages/superconductor-core/src/swarm/TaskWavePlanner.ts
    INVARIANT_AFTER: "Tests MUST verify Concurrency Guard throws on serialization and Prompt Builder contains expected persona."
    - [x] Write integration test validating Concurrency Guard.
    - [x] Write unit test for `RemediatorPromptBuilder.ts`.
