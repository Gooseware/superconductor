# Specification: Prime Directive, Vibe, Deep Research & Antichain Swarm

## 1. Overview
This track introduces architectural overhauls to the Superconductor framework, enforcing environment self-healing (The Prime Directive), instilling an "Electric Craftsman" agent persona, formalizing a Deep Research phase into the planning lifecycle, eradicating legacy phase-waterfalls for Antichain swarm concurrency, and bridging core superpowers skills into the standard workflow.

## 2. Background & Rationale
Superconductor agents currently fail or stall when basic dependencies (worktrunk, superpowers) are missing. Furthermore, legacy sequential workflows arbitrarily limit the concurrency potential of LLM swarms. We are upgrading the operational dogma to enforce parallel antichain task execution while also boosting the qualitative output of the agents through self-affirming prompts and rigorous Deep Research gates integrated with Obsidian Second Brain.

## 3. Functional Requirements

### FR-1: Environment Detection (The Prime Directive)
- Agent skills (`worktrunk`, `setup`, `implement`) MUST dynamically detect required tools:
  - `wt` (worktrunk CLI).
  - The `superpowers` extension enablement.
  - Deep Research dependencies (e.g., `uv`, python script).
- If missing, the agent MUST pause and ask the user to automatically install or enable them.

### FR-2: Electric Craftsman Prompt Architecture
- Inject high-agency, flow-state personas into `agent-config.md` globally and locally.
- Hardcode the persona into subagent prompt builders in `packages/superconductor-core/src/swarm/RemediatorPromptBuilder.ts`.

### FR-3: Hunch-to-Roundhouse-Punch Deep Research Gate
- Update `skills/new-track/SKILL.md` and `superconductor/workflow.md` to introduce a mandatory Deep Research phase before writing the spec.
- Autonomously trigger `gemini-deep-research`, archive Obsidian notes, push to GitLab, and feed results into the spec.

### FR-4: Antichain Swarm Dogma Purge
- Purge sequential phase constraints ("Every plan phase MUST be delegated...") from implementation and execution skills.
- Mandate `TaskWavePlanner` execution.
- Implement a Concurrency Guard that halts the swarm if artificially serialized when independent tasks exist.

### FR-5: Superpowers Skill Bridging
- Ensure Superconductor workflows explicitly bridge and mandate Superpowers skills such as `brainstorming`, `writing-plans`, `test-driven-development`, and `systematic-debugging`.

## 4. Non-Functional Requirements
- **Performance**: Concurrency guard must not add significant overhead.
- **Resilience**: The environment checks must gracefully degrade rather than crashing.
- **Persistence**: Obsidian git syncs must occur asynchronously to avoid blocking the agent.

## 5. Acceptance Criteria
- **AC-1**: Running `setup` or `implement` without `wt` installed prompts the user for installation.
- **AC-2**: `RemediatorPromptBuilder.ts` includes the "Electric Craftsman" directive.
- **AC-3**: Creating a new track via `new-track` executes a deep research Python script and generates Obsidian artifacts.
- **AC-4**: Swarm execution logs show simultaneous task dispatch via topological antichains (Concurrency Guard throws if serialized).
- **AC-5**: Implementation workflow calls Superpowers TDD/Debugging skills.
