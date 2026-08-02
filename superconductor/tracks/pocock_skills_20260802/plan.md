# Implementation Plan: Matt Pocock Skills Integration

## Oracle Proactive Planning
- **Pattern:** Create a unified `SkillPortingEngine` rather than porting skills manually one-by-one. This engine will ingest Matt Pocock's prompt templates and translate them into Superconductor-compatible formats automatically.
- **Modularity:** When augmenting `workflow.md` and `implement.toml`, use declarative extensions rather than hardcoding. Introduce a `GrillingContext` model in `TrackStateManager` to persist the domain language across sessions.

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 6 tasks)
**Estimated Track Token Budget:** ~0.2M tokens · ~$0.02 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify Swarm installation [TIER-2] [AGENT... | flash_lite | 28K | ~9 min |
| 2 | Task: Audit external skills repository [TIER-4]... | flash_lite | 47K | ~15 min |
| 3 | Task: Implement Grilling phase in newTrack [TIE... | flash_lite | 56K | ~18 min |
| 4 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 5 | Task: Port grill-with-docs and improve-architec... | flash_lite | 56K | ~18 min |
| 6 | Update `skills/catalog.md` to register all new ... | flash_lite | 19K | ~6 min |
| 7 | Task: Integrate track 'pocock_skills_20260802' ... | flash_lite | 9K | ~3 min |

## Phase 0: Swarm Preflight
- [ ] Task: Verify Swarm installation [TIER-2:TCS=3] [AGENT:superconductor-reviewer]
    - [ ] Run `npm list` or inspect `package.json` for swarm capabilities. [TIER-1:TCS=3]
    - [ ] Ensure `swarm-orchestrate` is available in the skills registry. [TIER-1:TCS=3]

## Phase 1: Comprehensive Skill Audit & Extraction
- [ ] Task: Audit external skills repository [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [ ] Download or clone the `mattpocock/skills` repository to a temporary workspace. [TIER-1:TCS=3]
    - [ ] Run a structural analysis over all skills to extract core mechanics (TDD, Triage, Grilling). [TIER-1:TCS=3]
    - [ ] Generate an `audit-report.md` detailing which skills become core workflow enhancements and which become standalone plugins. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Comprehensive Skill Audit & Extraction' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 2: Core Workflow Enhancements (Grilling & TDD)
- [ ] Task: Implement Grilling phase in newTrack [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Modify `commands/superconductor/newTrack.toml` or relevant agent logic to optionally trigger a Grilling phase. [TIER-1:TCS=3]
    - [ ] Create logic to generate and update `CONTEXT.md` (ubiquitous language) based on Grilling output. [TIER-1:TCS=3]
- [ ] Task: Augment TDD and Diagnosing loops in Implement [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Update `workflow.md` and `implement.toml` to enforce strict Red-Green-Refactor cycles. [TIER-1:TCS=3]
    - [ ] Integrate Systematic Bug Diagnosis heuristics into the testing feedback loop. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Core Workflow Enhancements (Grilling & TDD)' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 3: Standalone Skill Porting
- [ ] Task: Port grill-with-docs and improve-architecture [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Create Superconductor skill definition for `/superconductor:grill`. [TIER-1:TCS=3]
    - [ ] Create Superconductor skill definition for `/superconductor:improve-architecture`. [TIER-1:TCS=3]
    - [ ] Build the `SkillPortingEngine` to convert prompt logic. [TIER-1:TCS=3]
- [ ] Task: Port additional audited skills [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Create Superconductor skill definitions for `to-tickets` and any other skills identified in Phase 1. [TIER-1:TCS=3]
    - [ ] Update `skills/catalog.md` to register all new skills. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Standalone Skill Porting' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 4: Integration & Finalization
- [ ] Task: Integrate track 'pocock_skills_20260802' into main branch. [TIER-2:TCS=3] [AGENT:superconductor-reviewer]
