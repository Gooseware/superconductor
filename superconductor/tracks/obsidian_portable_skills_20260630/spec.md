# Specification: Obsidian Portable Skills

## Overview

Add new platform-agnostic skills to the user's Obsidian Vault (`~/Documents/Obsidian Vault/Agent Admin/Agent_Skills/`) derived from the architectural concepts in the UPDATES.md research article. These are NOT Superconductor-specific; they use the standard `SKILL.md` format and are compatible with any agent tool that supports the agentskills.io standard (OpenCode, KiloCode, Gemini CLI, Claude Code, Cursor, etc.).

## Context

The Obsidian Agent Admin vault is the user's personal portable skill library. The existing `link_agents.sh` script already symlinks `Agent_Skills/` to `~/.gemini/skills`, `~/.config/opencode/skill`, and `~/.kilocode/skills`. Any skill added here immediately becomes available across all installed agent tools.

## Functional Requirements

### FR-1: `model-routing-strategy` Portable Skill

- Create `Agent_Skills/model-routing-strategy/SKILL.md` with:
  - Frontmatter `name: model-routing-strategy`
  - Description trigger: "Use when designing agent workflows, writing system prompts, planning which AI model to use for different sub-tasks, or reviewing an agentic system for cost efficiency. Covers 4-tier cascade architecture: deterministic scripts, triage models, standard inference, and frontier reasoning."
  - Body content covering:
    - The 4-tier table (Tier 1: scripts $0, Tier 2: nano/flash ~$0.07-0.30/1M, Tier 3: mid-tier ~$0.50-3.00/1M, Tier 4: frontier $3.00-60.00/1M)
    - Routing topology options: Static Routing, Dynamic Semantic Routing, Sequential Cascading, Parallel Fan-Out (Fusion)
    - Fallback chain patterns for provider outages
    - The shell-for-execution / LLM-for-interpretation pattern for Tier-1
    - OpenRouter/LiteLLM integration notes
    - 40-85% cost reduction benchmark with 90-95% quality retention

### FR-2: `progressive-skill-design` Portable Skill

- Create `Agent_Skills/progressive-skill-design/SKILL.md` with:
  - Frontmatter `name: progressive-skill-design`
  - Description trigger: "Use when creating, writing, refactoring, or auditing agent skills, capability packages, or SKILL.md files. Covers the agentskills.io standard, frontmatter field specifications, progressive disclosure architecture, and quality guidelines."
  - Body content covering:
    - The manifest field table (name, description, allowed-tools, compatibility, context) with requirements and constraints
    - Progressive disclosure loading tiers (frontmatter-only scan → full SKILL.md → scripts/references on demand)
    - Description writing guidelines: keyword-rich, max 1024 chars, trigger-focused
    - Directory structure conventions (SKILL.md, assets/, scripts/, references/, examples/)
    - Cross-platform compatibility notes (Claude Code, OpenCode, KiloCode, Gemini CLI, Cursor)
    - Quality checklist for new skills

### FR-3: Enhanced `New_Agent_Skill.md` Template

- Update `templates/New_Agent_Skill.md` to include all standard frontmatter fields:
  - `name`, `description` (required)
  - `allowed-tools` (optional, space-separated: Bash, Write, Read, etc.)
  - `compatibility` (optional: products, packages, network)
  - `context` (optional: `fork` for isolated sub-agent execution)
  - `version`
- Body template sections: Purpose, Prerequisites, Procedures (numbered steps), Quality Gates, References.

### FR-4: `Agent_Skills/README.md` Index

- Create a README.md in Agent_Skills/ listing all skills with:
  - One-liner description per skill
  - Platform compatibility (which tools support it)
  - Category tags
- Include both existing skills and the two new ones.

### FR-5: Update `getting started.md`

- Add a "Model Routing" section pointing to the `model-routing-strategy` skill.
- Add a "Writing Good Skills" section pointing to the `progressive-skill-design` skill.
- These sections should be concise (3-5 bullets each) linking to the skills for detail.

## Non-Functional Requirements

- All new skills MUST follow the agentskills.io standard exactly.
- Skill names MUST match their directory names (lowercase, hyphens only).
- Descriptions MUST be under 1024 characters.
- Skills MUST be platform-agnostic (no Gemini-specific or Antigravity-specific APIs).

## Acceptance Criteria

- Both new SKILL.md files pass frontmatter validation (name matches directory name).
- Both skills appear in a re-run of any agent that scans the `Agent_Skills/` directory.
- The enhanced template includes all optional fields.
- `Agent_Skills/README.md` exists and covers all skills in the directory.

## Out of Scope

- Modifying `link_agents.sh` (it already works correctly).
- Adding Superconductor-specific or Gemini-specific skills to this vault.
- Creating the actual stylistic design rules (those live in Superconductor's `design-heuristics` skill).
