# Track: Complexity Refactor Round 3
**Track ID:** `complexity_refactor_round3_20260723`
**Status:** 🔄 In Progress

## Context

We are knocking out the remaining hotspots >10 CCN across the workspace:
1. `packages/superconductor-core/src/intelligence/runners/complexity.ts` (CCN 20)
2. `packages/superconductor-mcp-server/src/index.ts` (CCN 18)
3. `superconductor/migrate_local_registry.js` (CCN 17)
4. `packages/superconductor-core/src/review/aggregate-findings.ts` (CCN 13)

## Acceptance Criteria

- [ ] `mcp-server/index.ts`: extract `handleGetAgentContext`, `handleRunIntelligence`, `handleCheckPlanGap`, `handleRunAbiRetrospective`
- [ ] `complexity.ts`: extract `calculateGitChurn`, `runLizardScan`, `mergeComplexityAndChurn`
- [ ] `aggregate-findings.ts`: extract inner loops in `extractReviewerFindings`
- [ ] `migrate_local_registry.js`: extract `readComponentMetadata`, `writeDogmaFile`, `copyComponentFiles`
- [ ] Tests pass (171 in engine, 66 in core)

## Swarm Assignment

| Agent | Scope | Key concern |
|---|---|---|
| A | `mcp-server/index.ts` & `migrate_local_registry.js` | MCP switch statement decomposition |
| B | `complexity.ts` & `aggregate-findings.ts` | Safely refactoring the intelligence runners |
