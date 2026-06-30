# Implementation Plan: Obsidian Portable Skills

## Phase 0: New Portable Skills

- [ ] Task: Create `Agent_Skills/model-routing-strategy/SKILL.md` [TIER-3]
    - [ ] Sub-task: Write YAML frontmatter (name, description with cost/routing keyword triggers)
    - [ ] Sub-task: Write 4-tier routing table with cost ranges and Gemini/Anthropic model examples
    - [ ] Sub-task: Write Routing Topologies section (Static, Dynamic Semantic, Sequential Cascade, Parallel Fan-Out)
    - [ ] Sub-task: Write Fallback Chain Patterns section
    - [ ] Sub-task: Write Shell-for-Execution / LLM-for-Interpretation pattern with example
    - [ ] Sub-task: Add OpenRouter/LiteLLM integration notes
    - [ ] Sub-task: Verify description is under 1024 characters and name matches directory
- [ ] Task: Create `Agent_Skills/progressive-skill-design/SKILL.md` [TIER-3]
    - [ ] Sub-task: Write YAML frontmatter (name, description with skill/SKILL.md keyword triggers)
    - [ ] Sub-task: Write Manifest Field Table section (all 5 fields with requirements)
    - [ ] Sub-task: Write Progressive Disclosure Architecture section (3 loading tiers)
    - [ ] Sub-task: Write Description Writing Guidelines section
    - [ ] Sub-task: Write Directory Structure Conventions section
    - [ ] Sub-task: Write Cross-Platform Compatibility section
    - [ ] Sub-task: Write Quality Checklist section
    - [ ] Sub-task: Verify description is under 1024 characters and name matches directory
- [ ] Task: User Manual Verification 'Phase 0: New Portable Skills' (Protocol in workflow.md)

## Phase 1: Template & Index

- [ ] Task: Update `templates/New_Agent_Skill.md` with complete field set [TIER-3]
    - [ ] Sub-task: Add `allowed-tools`, `compatibility`, `context` optional fields with comments explaining each
    - [ ] Sub-task: Expand body template with Purpose, Prerequisites, Procedures, Quality Gates, References sections
    - [ ] Sub-task: Add Templater variable for auto-generating name from file title
- [ ] Task: Create `Agent_Skills/README.md` skill index [TIER-3]
    - [ ] Sub-task: List all existing skills (agent-browser, brainstorming, create-agent-skill, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, frontend-design, git-commit-workflow, housekeeping, poweruser-refactoring, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills)
    - [ ] Sub-task: Add both new skills to the index
    - [ ] Sub-task: Include platform compatibility column (Gemini CLI, OpenCode, KiloCode, Claude Code)
    - [ ] Sub-task: Group by category (Workflow, Design, Meta, DevOps)
- [ ] Task: User Manual Verification 'Phase 1: Template & Index' (Protocol in workflow.md)

## Phase 2: Getting Started Update

- [ ] Task: Add new sections to `getting started.md` [TIER-3]
    - [ ] Sub-task: Add "Model Routing" section with 3-5 bullet summary and link to model-routing-strategy skill
    - [ ] Sub-task: Add "Writing Good Skills" section with 3-5 bullet summary and link to progressive-skill-design skill
    - [ ] Sub-task: Ensure sections integrate naturally with existing document flow
- [ ] Task: User Manual Verification 'Phase 2: Getting Started Update' (Protocol in workflow.md)
