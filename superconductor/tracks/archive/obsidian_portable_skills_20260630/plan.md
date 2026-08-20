# Implementation Plan: Obsidian Portable Skills

## Phase 0: New Portable Skills

- [x] Task: Create `Agent_Skills/model-routing-strategy/SKILL.md` [TIER-3]
    - [x] Sub-task: Write YAML frontmatter (name, description with cost/routing keyword triggers)
    - [x] Sub-task: Write 4-tier routing table with cost ranges and Gemini/Anthropic model examples
    - [x] Sub-task: Write Routing Topologies section (Static, Dynamic Semantic, Sequential Cascade, Parallel Fan-Out)
    - [x] Sub-task: Write Fallback Chain Patterns section
    - [x] Sub-task: Write Shell-for-Execution / LLM-for-Interpretation pattern with example
    - [x] Sub-task: Add OpenRouter/LiteLLM integration notes
    - [x] Sub-task: Verify description is under 1024 characters and name matches directory
- [x] Task: Create `Agent_Skills/progressive-skill-design/SKILL.md` [TIER-3]
    - [x] Sub-task: Write YAML frontmatter (name, description with skill/SKILL.md keyword triggers)
    - [x] Sub-task: Write Manifest Field Table section (all 5 fields with requirements)
    - [x] Sub-task: Write Progressive Disclosure Architecture section (3 loading tiers)
    - [x] Sub-task: Write Description Writing Guidelines section
    - [x] Sub-task: Write Directory Structure Conventions section
    - [x] Sub-task: Write Cross-Platform Compatibility section
    - [x] Sub-task: Write Quality Checklist section
    - [x] Sub-task: Verify description is under 1024 characters and name matches directory
- [x] Task: User Manual Verification 'Phase 0: New Portable Skills' (Protocol in workflow.md)

## Phase 1: Template & Index

- [x] Task: Update `templates/New_Agent_Skill.md` with complete field set [TIER-3]
    - [x] Sub-task: Add `allowed-tools`, `compatibility`, `context` optional fields with comments explaining each
    - [x] Sub-task: Expand body template with Purpose, Prerequisites, Procedures, Quality Gates, References sections
    - [x] Sub-task: Add Templater variable for auto-generating name from file title
- [x] Task: Create `Agent_Skills/README.md` skill index [TIER-3]
    - [x] Sub-task: List all existing skills (agent-browser, brainstorming, create-agent-skill, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, frontend-design, git-commit-workflow, housekeeping, poweruser-refactoring, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills)
    - [x] Sub-task: Add both new skills to the index
    - [x] Sub-task: Include platform compatibility column (Gemini CLI, OpenCode, KiloCode, Claude Code)
    - [x] Sub-task: Group by category (Workflow, Design, Meta, DevOps)
- [x] Task: User Manual Verification 'Phase 1: Template & Index' (Protocol in workflow.md)

## Phase 2: Getting Started Update

- [x] Task: Add new sections to `getting started.md` [TIER-3]
    - [x] Sub-task: Add "Model Routing" section with 3-5 bullet summary and link to model-routing-strategy skill
    - [x] Sub-task: Add "Writing Good Skills" section with 3-5 bullet summary and link to progressive-skill-design skill
    - [x] Sub-task: Ensure sections integrate naturally with existing document flow
- [x] Task: User Manual Verification 'Phase 2: Getting Started Update' (Protocol in workflow.md)
