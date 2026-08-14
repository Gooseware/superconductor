# Implementation Plan: Dynamic Model Chooser & Autonomous Quorum Remediation

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 14 tasks)
**Estimated Track Token Budget:** ~0.5M tokens · ~$0.04 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify swarm-orchestrate / swarm-execute ... | flash_lite | 28K | ~9 min |
| 2 | Task: Create unit tests for ModelCatalogService... | flash_lite | 56K | ~18 min |
| 3 | Add CLI execution with 5000ms timeout and sanit... | flash_lite | 38K | ~12 min |
| 4 | Task: Create unit tests for AgentConfigWriter a... | flash_lite | 56K | ~18 min |
| 5 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 6 | Task: Create unit tests for ModelChooserDialog ... | flash_lite | 56K | ~18 min |
| 7 | Create legacy compatibility command `commands/s... | flash_lite | 28K | ~9 min |
| 8 | Task: Create tests for continuous Quorum → Reme... | flash_lite | 56K | ~18 min |
| 9 | Update `skills/standalone-review/SKILL.md` and ... | flash_lite | 47K | ~15 min |
| 10 | Task: Create unit and integration tests for Tra... | flash_lite | 56K | ~18 min |
| 11 | Integrate lifecycle prompts into `skills/implem... | flash_lite | 28K | ~9 min |
| 12 | Task: Run full monorepo test suite and verify z... | flash_lite | 56K | ~18 min |

## Phase 0: Swarm Preflight
- [ ] Task: Verify swarm-orchestrate / swarm-execute skills, runtime environment, and MCP tool availability [TIER-1:TCS=3] [AGENT:superconductor-processor]
    - [ ] Check node version, typescript compilation, and git branch status [TIER-1:TCS=3]
    - [ ] Verify `packages/superconductor-core` and `packages/engine` build cleanliness [TIER-1:TCS=3]

## Phase 1: Model Catalog & Discovery Service
- [ ] Task: Create unit tests for ModelCatalogService [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Write unit tests verifying `agy models` stdout parser [TIER-1:TCS=3]
    - [ ] Write tests for 24-hour TTL file cache creation and invalidation in `~/.gemini/models-cache.json` [TIER-1:TCS=3]
    - [ ] Write tests for fallback behavior when CLI fails or times out [TIER-1:TCS=3]
- [ ] Task: Implement ModelCatalogService [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Implement `ModelCatalogService` in `packages/superconductor-core/src/models/model-catalog-service.ts` [TIER-1:TCS=3]
    - [ ] Add CLI execution with 5000ms timeout and sanitized regex extraction [TIER-1:TCS=3]
    - [ ] Add read/write cache logic for `~/.gemini/models-cache.json` [TIER-1:TCS=3]
    - [ ] Add `refresh()` method and `--refresh-models` CLI flag support [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Model Catalog & Discovery Service' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 2: Hierarchical Config Persistence & Writer
- [ ] Task: Create unit tests for AgentConfigWriter and AgentConfigResolver [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Write tests for parsing and updating Swarm Agent Model Assignments table in markdown [TIER-1:TCS=3]
    - [ ] Write tests for multi-tier resolution: Ephemeral Session > Project `superconductor/agent-config.md` > Global `~/.gemini/agent-config.md` > Defaults [TIER-1:TCS=3]
- [ ] Task: Implement AgentConfigWriter & update AgentConfigResolver [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Implement `AgentConfigWriter` in `packages/superconductor-core/src/models/agent-config-writer.ts` [TIER-1:TCS=3]
    - [ ] Update `superconductor/agent_config_resolver.js` and `packages/superconductor-core/src/intelligence/model-tier-router.ts` to support granular role-to-model resolution [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Hierarchical Config Persistence & Writer' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 3: Interactive Model Chooser Dialog & `/superconductor:models` Command
- [ ] Task: Create unit tests for ModelChooserDialog [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Test interactive prompt generation for each Superconductor role [TIER-1:TCS=3]
    - [ ] Test persistence scope selection (Global, Project, Once-off) [TIER-1:TCS=3]
- [ ] Task: Implement ModelChooserDialog and CLI command [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Implement `ModelChooserDialog` in `packages/superconductor-core/src/models/model-chooser-dialog.ts` [TIER-1:TCS=3]
    - [ ] Create skill `skills/models/SKILL.md` for `/superconductor:models` command [TIER-1:TCS=3]
    - [ ] Create legacy compatibility command `commands/superconductor/models.toml` [TIER-1:TCS=3]
    - [ ] Integrate Model Chooser into `/superconductor:setup` and `/superconductor:implement` [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Interactive Model Chooser Dialog & `/superconductor:models` Command' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 4: Autonomous Quorum Remediation Loop (Standalone Review & Track Swarm)
- [ ] Task: Create tests for continuous Quorum → Remediation → Quorum loop [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Test Quorum FSM auto-remediation transitions upon receiving `NEEDS_FIXES` [TIER-1:TCS=3]
    - [ ] Test domain grouping (security, logic, tests, types, config) and parallel remediator dispatch [TIER-1:TCS=3]
    - [ ] Test loop termination: stop immediately if green, remediate if red, repeat until 100% green [TIER-1:TCS=3]
    - [ ] Test 3-5 cycle circuit breaker and Deep Research escalation [TIER-1:TCS=3]
- [ ] Task: Implement autonomous Quorum remediation loop across Standalone Review and Swarm Execute [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Update `skills/standalone-review/SKILL.md` and `skills/standalone-remediation/SKILL.md` to specify and enforce the full continuous loop [TIER-1:TCS=3]
    - [ ] Update `packages/quorum-fsm/src/fsm/quorum-fsm.ts` and `scripts/quorum-review.ts` to support continuous auto-remediation loop [TIER-1:TCS=3]
    - [ ] Update `skills/swarm-execute/SKILL.md` and `packages/superconductor-core/src/remediation/` to execute loop until all green [TIER-1:TCS=3]
    - [ ] Enforce worktree isolation for concurrent domain remediators [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Autonomous Quorum Remediation Loop (Standalone Review & Track Swarm)' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 5: Track Lifecycle Wizard (Interactive/Headless Mode & Archive/Delete)
- [ ] Task: Create unit and integration tests for TrackLifecycleWizard [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Test track initialization prompt for Interactive vs Headless execution mode [TIER-1:TCS=3]
    - [ ] Test target branch selection and persistence [TIER-1:TCS=3]
    - [ ] Test track finalization: merge to target branch, archive directory creation, and clean deletion [TIER-1:TCS=3]
- [ ] Task: Implement TrackLifecycleWizard [TIER-3:TCS=3] [AGENT:superconductor-processor]
    - [ ] Implement `TrackLifecycleWizard` in `packages/superconductor-core/src/orchestration/track-lifecycle-wizard.ts` [TIER-1:TCS=3]
    - [ ] Integrate lifecycle prompts into `skills/implement/SKILL.md` and `skills/new-track/SKILL.md` [TIER-1:TCS=3]
    - [ ] Wire automated Oracle sign-off gate before final branch merge [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Track Lifecycle Wizard' (Protocol in workflow.md) [TIER-1:TCS=3]

## Phase 6: Integration & Finalization
- [ ] Task: Run full monorepo test suite and verify zero regressions [TIER-2:TCS=3] [AGENT:superconductor-processor]
    - [ ] Run `npm test` across all packages (`engine`, `superconductor-core`, `quorum-fsm`, `superconductor-kernel`, `notebook-store`) [TIER-1:TCS=3]
    - [ ] Validate skill frontmatter and CLI command discovery [TIER-1:TCS=3]
- [ ] Task: Integrate track 'model_chooser_quorum_remediation_20260814' into main branch [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [ ] Run 4-reviewer Quorum review panel (Security, Correctness, Adversarial, Regression) [TIER-1:TCS=3]
    - [ ] Complete Oracle audit, generate authorization trailer, and finalize merge [TIER-1:TCS=3]
