# Implementation Plan: Dependency Functional Surface Intelligence

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 6 tasks)
**Estimated Track Token Budget:** ~0.3M tokens · ~$0.02 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify superconductor-core engine is resp... | flash_lite | 26K | ~6 min |
| 2 | Task: Scaffold `DependencyAnalyzer` module insi... | flash_lite | 53K | ~15 min |
| 3 | Task: Extend intelligence pipeline to generate ... | flash_lite | 44K | ~12 min |
| 4 | Task: Create MCP Tool `get_dependency_surface` ... | flash_lite | 62K | ~18 min |
| 5 | Task: Update `SwarmBlueprintGenerator` with Ada... | flash_lite | 44K | ~12 min |
| 6 | Task: Integrate track 'func_surface_intel_20260... | flash_lite | 26K | ~6 min |

## Phase 0: Swarm Preflight [checkpoint: e25c400]
- [x] Task: Verify superconductor-core engine is responsive and orchestrator is loaded [TIER-3:TCS=3] [AGENT:caduceus-processor] e25c400
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=4] e25c400

## Phase 1: AST Parser Integration [checkpoint: a188531]
- [x] Task: Scaffold `DependencyAnalyzer` module inside `packages/superconductor-core/src/intelligence/` [TIER-3:TCS=3] [AGENT:caduceus-processor] bae4945
    - [x] Write unit tests for `DependencyAnalyzer` to parse explicit imports using `swc` or IDE LSP data. [TIER-1:TCS=2]
    - [x] Implement `DependencyAnalyzer` core module. [TIER-1:TCS=3]
    - [x] Ensure lazy evaluation only maps explicitly requested target files. [TIER-1:TCS=3]
- [x] Task: Superconductor - User Manual Verification 'Phase 1: AST Parser Integration' (Protocol in workflow.md) [TIER-1:TCS=4] a188531

## Phase 2: Usage Heatmap Generation [checkpoint: 8c011c6]
- [x] Task: Extend intelligence pipeline to generate Usage Heatmap [TIER-3:TCS=3] [AGENT:caduceus-processor] c076aad
    - [x] Write tests for heatmap generation logic. [TIER-1:TCS=2]
    - [x] Implement serialization of `08_dependency_surface.json`. [TIER-1:TCS=3]
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Usage Heatmap Generation' (Protocol in workflow.md) [TIER-1:TCS=4] 8c011c6

## Phase 3: Agent MCP Tooling & Oracle Recommendations
- [x] Task: Create MCP Tool `get_dependency_surface` [TIER-3:TCS=3] [AGENT:caduceus-processor]
    - [x] Write unit tests verifying dynamic query capability without proactive context injection. [TIER-1:TCS=4]
    - [x] Implement `get_dependency_surface(depName)` tool. [TIER-1:TCS=3]
- [x] Task: Implement Oracle Reusability Strategy: Shared Snapshot Caching [TIER-4:TCS=3] [AGENT:caduceus-oracle]
    - [x] Refactor `IntelligenceSnapshotReader` and MCP Tool to use shared caching for memory efficiency. [TIER-1:TCS=3]
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Agent MCP Tooling & Oracle Recommendations' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 4: Adapter Generation Heuristics
- [x] Task: Update `SwarmBlueprintGenerator` with Adapter generation rules [TIER-4:TCS=3] [AGENT:caduceus-oracle]
    - [x] Write tests to verify the planner suggests Adapters when token economics are favorable. [TIER-1:TCS=2]
    - [x] Implement heuristics logic and mark generated Adapters as technical debt for future upstream tracking. [TIER-1:TCS=3]
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Adapter Generation Heuristics' (Protocol in workflow.md) [TIER-1:TCS=4]

## Phase 5: Integration & Finalization
- [ ] Task: Integrate track 'func_surface_intel_20260724' into main branch. [TIER-3:TCS=3] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=4]
