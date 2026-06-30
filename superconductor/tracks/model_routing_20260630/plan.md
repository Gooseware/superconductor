# Implementation Plan: Multi-Tier Model Routing

## Phase 0: Reference Documents & Config Schema [checkpoint: f15734a]

- [x] Task: Create `superconductor/model-routing.md` reference document [TIER-3]
    - [x] Sub-task: Define 4-tier table with Gemini model examples (Flash-Lite, Pro, Ultra)
    - [x] Sub-task: Map each Superconductor workflow phase (branch creation, plan parsing, code gen, refactor) to a recommended tier
    - [x] Sub-task: Document the shell-for-execution / LLM-for-interpretation pattern for Tier-1
- [x] Task: Create `superconductor/agent-config.md` template [TIER-1]
    - [x] Sub-task: Define template with Tier 2/3/4 model fields and optional proxy endpoint
    - [x] Sub-task: Document the global vs per-project override resolution order
- [x] Task: Update `GEMINI.md` Universal File Resolution Protocol [TIER-3]
    - [x] Sub-task: Register `agent-config.md` as a Standard Default Path under the Project section
- [x] Task: User Manual Verification 'Phase 0: Reference Documents & Config Schema' (Protocol in workflow.md)

## Phase 1: Setup Integration — Agent Model Configuration [checkpoint: 64a3df1]

- [x] Task: Add Agent Model Configuration section to `setup.toml` [TIER-3]
    - [x] Sub-task: After tech stack section (Section 2.3), add new Section 2.X "Agent Model Configuration"
    - [x] Sub-task: Ask user for preferred Tier 3 model (code generation) with Gemini options
    - [x] Sub-task: Ask user for preferred Tier 4 model (frontier reasoning) with options
    - [x] Sub-task: Ask user for optional proxy endpoint (LiteLLM/OpenRouter)
    - [x] Sub-task: Write responses to global `~/.gemini/agent-config.md` (idempotent — ask before overwriting)
    - [x] Sub-task: Offer optional project-level override written to `superconductor/agent-config.md`
    - [x] Sub-task: Add graceful skip if user declines configuration
- [x] Task: Write unit tests for agent-config file resolution (global vs project override) [TIER-3]
    - [x] Sub-task: Create `superconductor/agent_config_resolver.test.js`
    - [x] Sub-task: Test: project config overrides global when both exist
    - [x] Sub-task: Test: falls back to global when no project config exists
    - [x] Sub-task: Test: graceful fallback when neither exists
- [x] Task: User Manual Verification 'Phase 1: Setup Integration' (Protocol in workflow.md)

## Phase 2: Plan Annotation — Tier Hints in newTrack

- [ ] Task: Update `newTrack.toml` to append `[TIER-N]` annotations [TIER-3]
    - [ ] Sub-task: Add tier annotation rules to the plan generation prompt in newTrack.toml
    - [ ] Sub-task: Define the classification logic: git/file/shell ops → TIER-1, parsing/classification → TIER-2, code gen/tests → TIER-3, complex refactor → TIER-4
    - [ ] Sub-task: Ensure annotations appear inline after task descriptions (e.g. `- [ ] Write auth handler [TIER-3]`)
    - [ ] Sub-task: Verify annotations don't break the existing `[x]` / `[~]` / `[ ]` status parsing
- [ ] Task: User Manual Verification 'Phase 2: Plan Annotation' (Protocol in workflow.md)

## Phase 3: Routing-Aware Execution in implement.toml

- [ ] Task: Update `implement.toml` task execution loop to read tier annotations [TIER-3]
    - [ ] Sub-task: Before each task, extract and read the `[TIER-N]` annotation from the plan line
    - [ ] Sub-task: For `[TIER-1]`: execute task steps via `run_shell_command`; capture stdout/stderr; feed as structured context for LLM to interpret result
    - [ ] Sub-task: For `[TIER-4]`: announce to user which Tier-4 model will be used (from agent-config); proceed with task
    - [ ] Sub-task: For `[TIER-2]` and `[TIER-3]`: standard execution, no special announcement
    - [ ] Sub-task: Add fallback: if no annotation found, default to TIER-3 behaviour
- [ ] Task: User Manual Verification 'Phase 3: Routing-Aware Execution' (Protocol in workflow.md)
