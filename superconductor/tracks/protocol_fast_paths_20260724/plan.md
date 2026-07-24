# Implementation Plan: Protocol Checkpoints & Legalized Fast-Paths

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 3 tasks)
**Estimated Track Token Budget:** ~0.1M tokens · ~$0.01 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify swarm-orchestrate skill is active ... | flash_lite | 9K | ~3 min |
| 2 | Task: Update `skills/new-track/SKILL.md` to sup... | flash_lite | 61K | ~15 min |
| 3 | Task: Update `skills/implement/SKILL.md` to sup... | flash_lite | 52K | ~12 min |

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 4 tasks)
**Estimated Track Token Budget:** ~0.2M tokens · ~$0.01 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify swarm-orchestrate skill is active ... | flash_lite | 9K | ~3 min |
| 2 | Task: Update `skills/new-track/SKILL.md` to sup... | flash_lite | 61K | ~15 min |
| 3 | Task: Update `skills/implement/SKILL.md` to sup... | flash_lite | 43K | ~9 min |
| 4 | Task: Update `skills/swarm-orchestrate/SKILL.md... | flash_lite | 52K | ~12 min |

## Phase 0: Swarm Preflight
- [ ] Task: Verify swarm-orchestrate skill is active and loaded. [TIER-1:TCS=3] [AGENT:caduceus-processor]

## Phase 1: Update new-track SKILL.md
- [ ] Task: Update `skills/new-track/SKILL.md` to support `--fast` flag and checkpoints. [TIER-3:TCS=4] [AGENT:caduceus-coder]
    - [ ] Update System Directive to enforce `--fast` argument parsing. [TIER-1:TCS=3]
    - [ ] Add condition to bypass Phase 2.0.3 and 2.0.5 if `--fast` is set. [TIER-1:TCS=3]
    - [ ] Update the `ask_user` prompts to require `[✓]` checklist echoing. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Update new-track SKILL.md' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 2: Update implement SKILL.md
- [ ] Task: Update `skills/implement/SKILL.md` to support checkpoints. [TIER-3:TCS=4] [AGENT:caduceus-coder]
    - [ ] Update the `ask_user` prompts to require `[✓]` checklist echoing for completed steps. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Update implement SKILL.md' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 3: Update swarm-orchestrate SKILL.md
- [ ] Task: Update `skills/swarm-orchestrate/SKILL.md` to force Review Panel Mode unless `--fast` is used. [TIER-3:TCS=4] [AGENT:caduceus-coder]
    - [ ] Update Section 8.0 Mode Selection logic based on `--fast`. [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Update swarm-orchestrate SKILL.md' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase X: Integration & Finalization
- [ ] Task: Integrate track 'protocol_fast_paths_20260724' into main branch. [TIER-1:TCS=3] [AGENT:caduceus-processor]
