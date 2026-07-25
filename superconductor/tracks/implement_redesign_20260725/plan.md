## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 4 tasks)
**Estimated Track Token Budget:** ~0.2M tokens · ~$0.01 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify `swarm-orchestrate` skill is insta... | flash_lite | 26K | ~6 min |
| 2 | Task: Create `schema/track-manifest.js` (or `.t... | flash_lite | 51K | ~9 min |
| 3 | Task: Implement `DAGResolver` utility with Kahn... | flash_lite | 44K | ~9 min |
| 4 | Task: Implement `CliDispatcher` to detect TTY v... | flash_lite | 44K | ~12 min |
| 5 | Task: Integrate track 'implement_redesign_20260... | flash_lite | 9K | ~3 min |

## Phase 0: Swarm Preflight
- [x] Task: Verify `swarm-orchestrate` skill is installed and active [TIER-1:TCS=3] [AGENT:caduceus-processor] 4207479
- [x] Task: Superconductor - User Manual Verification 'Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=4] 4207479

## Phase 1: Context & Intelligence Foundation
- [x] Task: Create `schema/track-manifest.js` (or `.ts`) with Zod schema for the Dense YAML format [TIER-2:TCS=4] [AGENT:caduceus-processor] fa7a6d3
- [x] Task: Refactor `IntelligenceSnapshotReader` to parse `tracks.yaml` instead of `tracks.md` using a secure YAML parser (with schema execution disabled) and validate with the new Zod schema [TIER-3:TCS=4] [AGENT:caduceus-processor] b350b3c
- [ ] Task: Superconductor - User Manual Verification 'Context & Intelligence Foundation' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 2: DAG Resolution & Migration Utilities
- [ ] Task: Implement `DAGResolver` utility with Kahn's Algorithm and robust cycle detection [TIER-4:TCS=4] [AGENT:caduceus-oracle]
- [ ] Task: Create CLI migration script to parse legacy `tracks.md` tables and output `tracks.yaml` [TIER-3:TCS=4] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'DAG Resolution & Migration Utilities' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 3: Interactive CLI Orchestration
- [ ] Task: Implement `CliDispatcher` to detect TTY vs headless environments and route to the appropriate orchestrator [TIER-2:TCS=3] [AGENT:caduceus-processor]
- [ ] Task: Implement `InteractiveOrchestrator` using TUI checklists for multi-track selection and DAG sorting [TIER-3:TCS=3] [AGENT:caduceus-processor]
- [ ] Task: Implement `HeadlessOrchestrator` strictly handling argument-based execution and applying DAG sorting to the provided tracks [TIER-2:TCS=3] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Interactive CLI Orchestration' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 4: Integration & Finalization
- [ ] Task: Integrate track 'implement_redesign_20260725' into main branch. [TIER-2:TCS=3] [AGENT:caduceus-processor]
