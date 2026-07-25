# Implementation Plan

## Proactive Planning (Oracle Suggestions)
- **Skill Template Standardization:** Before generating individual skills, create a reusable `SKILL.md` baseline template that ensures all design-related skills share identical formatting for prompt injection, constraints, and tool requirements.
- **Triage Router in Design Director:** The `design-director` skill should be structured with explicit condition branches that evaluate the user's project setup to intelligently route them to Astryx (for enterprise/scale), Shadcn (for rapid dashboarding), or raw Tailwind (for custom design), preventing agent confusion.

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 6 tasks)
**Estimated Track Token Budget:** ~0.3M tokens · ~$0.02 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify `swarm-orchestrate` skill is insta... | flash_lite | 26K | ~6 min |
| 2 | Task: Define standardized `SKILL.md` template f... | flash_lite | 43K | ~9 min |
| 3 | Task: Create `astryx-component-creator` skill i... | flash_lite | 54K | ~18 min |
| 4 | Task: Create `astryx-svg-animator` skill in `~/... | flash_lite | 45K | ~12 min |
| 5 | Task: Audit and refactor existing `design-os-*`... | flash_lite | 54K | ~18 min |
| 6 | Task: Superconductor - User Manual Verification... | flash_lite | 17K | ~3 min |
| 7 | Task: Integrate track 'astryx_skills_20260725' ... | flash_lite | 26K | ~6 min |

## Phase 0: Swarm Preflight
- [ ] Task: Verify `swarm-orchestrate` skill is installed and loaded [TIER-2:TCS=3] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 1: Skill Template & Foundation
- [ ] Task: Define standardized `SKILL.md` template for agent consumption [TIER-3:TCS=4] [AGENT:caduceus-processor]
    - [ ] Create layout for Description, Setup, Triggers, and Constraints [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Skill Template & Foundation' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 2: Astryx Skills Generation
- [ ] Task: Create `astryx-component-creator` skill in `~/.agents/skills/` [TIER-3:TCS=3] [AGENT:caduceus-processor]
    - [ ] Document `template`, `swizzle`, and `--dense` API workflows [TIER-1:TCS=3]
- [ ] Task: Create `astryx-theme-builder` skill in `~/.agents/skills/` [TIER-3:TCS=3] [AGENT:caduceus-processor]
    - [ ] Document token mapping and type bug mitigation [TIER-1:TCS=3]
- [ ] Task: Create `astryx-multimodal-ingest` skill in `~/.agents/skills/` [TIER-4:TCS=3] [AGENT:caduceus-dreamer]
    - [ ] Document Jina Reader API and Playwright integration [TIER-1:TCS=3]
- [ ] Task: Create `astryx-svg-animator` skill in `~/.agents/skills/` [TIER-4:TCS=3] [AGENT:caduceus-dreamer]
    - [ ] Document Potrace, Sharp, and CSS vector animation techniques [TIER-1:TCS=4]
- [ ] Task: Update `~/.agents/plugin.json` to expose the new skills [TIER-2:TCS=3] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Astryx Skills Generation' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 3: Design Skills Digestion & Orchestrator
- [ ] Task: Audit and refactor existing `design-os-*` skills for modernization [TIER-4:TCS=3] [AGENT:caduceus-reviewer]
    - [ ] Analyze overlap with new Astryx capabilities [TIER-1:TCS=3]
- [ ] Task: Create master `design-director` skill in `~/.agents/skills/` [TIER-4:TCS=3] [AGENT:caduceus-dreamer]
    - [ ] Implement triage router for Astryx vs. Tailwind vs. Shadcn [TIER-1:TCS=3]
    - [ ] Aggregate links to all underlying design skills [TIER-1:TCS=3]
- [ ] Task: Add `design-director` to `~/.agents/plugin.json` [TIER-2:TCS=3] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Design Skills Digestion & Orchestrator' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 4: Integration & Finalization
- [ ] Task: Integrate track 'astryx_skills_20260725' into main branch. [TIER-2:TCS=3] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=4]
