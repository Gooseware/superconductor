# Implementation Plan: Harness-Agnostic Core Abstraction

**Track ID:** `core_harness_abstraction_20260723`
**Target Branch:** `main`
**Dependency:** Must be implemented BEFORE `intelligence_layer_20260723` Phase 2+
  (intelligence pipeline targets `packages/superconductor-core/src/intelligence/`)

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify swarm-orchestrate skill is installed [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Audit current scripts/ for harness coupling [TIER-1] [AGENT:caduceus-triage]
    - [ ] Read all 7 `scripts/*.ts` files and list any AGY/Gemini-specific imports
    - [ ] Confirm none import from AGY SDK (they should only use node:* built-ins)
    - [ ] List which skills invoke which scripts (dependency map)
- [ ] Task: Audit current `gemini-extension.json` and `plugin.json` [TIER-1] [AGENT:caduceus-triage]
    - [ ] Document all harness bindings that will need updating
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Core Package Scaffold

- [ ] Task: Write failing tests for core package structure [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `packages/superconductor-core` builds with tsc, zero errors
    - [ ] Test: core index.ts exports all expected public API symbols
    - [ ] Test: no imports from any harness package (ESLint rule)
- [ ] Task: Scaffold `packages/superconductor-core/` [TIER-2] [AGENT:caduceus-processor]
    - [ ] `package.json` — name `@superconductor/core`, ESM, strict TS
    - [ ] `tsconfig.json` — matching engine package conventions
    - [ ] `src/index.ts` — public API barrel (empty initially, populated per phase)
    - [ ] `src/types/index.ts` — shared types (TrackState, CapabilitySlot, AgentContext, etc.)
    - [ ] `.eslintrc` — `no-restricted-imports` rule blocking harness packages
    - [ ] Add `@superconductor/core` to root `package.json` workspaces
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Core Package Scaffold' (Protocol in workflow.md)

---

## Phase 2: Review Pipeline Migration

- [ ] Task: Write failing tests for migrated review functions [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test each of 7 scripts as named function imports from `@superconductor/core`
    - [ ] Test: shim `scripts/aggregate-findings.ts` produces identical output to migrated function
    - [ ] Test: shim `scripts/cascade-deferral-gate.ts` produces identical output
    - [ ] Test: zero regression — run existing tests against migrated code
- [ ] Task: Migrate 7 scripts to `src/review/` with named exports [TIER-2] [AGENT:caduceus-processor]
    - [ ] `aggregate-coverage-manifest.ts` → `src/review/aggregate-coverage.ts`
    - [ ] `aggregate-findings.ts` → `src/review/aggregate-findings.ts`
    - [ ] `cascade-deferral-gate.ts` → `src/review/cascade-deferral-gate.ts`
    - [ ] `deterministic-preflight.ts` → `src/review/deterministic-preflight.ts`
    - [ ] `extract-fenced-block.ts` → `src/review/extract-fenced-block.ts`
    - [ ] `generate-token-report.ts` → `src/review/generate-token-report.ts`
    - [ ] `input-resolution.ts` → `src/review/input-resolution.ts`
    - [ ] Each exports named function(s), removes top-level execution
    - [ ] Export all from `src/review/index.ts`
    - [ ] Add `review` to `src/index.ts` barrel
- [ ] Task: Replace `scripts/*.ts` with thin shims [TIER-2] [AGENT:caduceus-processor]
    - [ ] Each shim: `import { fn } from '@superconductor/core'; fn(process.argv.slice(2));`
    - [ ] Verify all existing skill invocations work unchanged
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Review Pipeline Migration' (Protocol in workflow.md)

---

## Phase 3: Track Management Module

- [ ] Task: Write failing tests for track management [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `readTrackRegistry()` parses `superconductor/tracks.md` correctly
    - [ ] Test: `readPlan(trackId)` parses plan.md checkbox state
    - [ ] Test: `checkTask(trackId, taskIndex)` toggles checkbox in plan.md
    - [ ] Test: `readSpec(trackId)` parses acceptance criteria blocks
    - [ ] Test: `checkPlanGap(trackId, diff)` identifies uncovered ACs
- [ ] Task: Implement `src/track/track-reader.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] `readTrackRegistry(projectRoot): TrackEntry[]` — parses tracks.md
    - [ ] `readPlan(projectRoot, trackId): PlanTask[]` — parses plan.md checkbox tree
    - [ ] `readSpec(projectRoot, trackId): SpecSection[]` — parses spec.md
    - [ ] `getAcceptanceCriteria(spec): CriterionItem[]` — extracts AC checklist items
- [ ] Task: Implement `src/track/track-state.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] `checkTask(projectRoot, trackId, taskPath): void` — marks task ✅ in plan.md
    - [ ] `uncheckTask(projectRoot, trackId, taskPath): void` — resets to unchecked
    - [ ] `getCompletionStats(projectRoot, trackId): CompletionStats` — % done
- [ ] Task: Implement `src/track/plan-gap-checker.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] `checkPlanGap(projectRoot, trackId, changedFiles): PlanGapReport`
    - [ ] Reads acceptance criteria from spec.md
    - [ ] Cross-references with git diff to find uncovered ACs
    - [ ] Returns `{ covered: CriterionItem[], uncovered: CriterionItem[], confidence: number }`
- [ ] Task: Export track module from `src/index.ts` barrel [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Track Management Module' (Protocol in workflow.md)

---

## Phase 4: Agent Context Protocol

- [ ] Task: Write failing tests for agent context assembly [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `getAgentContext()` includes intelligence snapshot if fresh
    - [ ] Test: `getAgentContext()` includes staleness warning if intelligence >1 commit old
    - [ ] Test: `getAgentContext()` includes active track count and completion %
    - [ ] Test: `getAgentContext()` includes tool registry status
    - [ ] Test: `AgentContext` is JSON-serialisable (no circular refs)
    - [ ] Test: schema_version field present
- [ ] Task: Implement `src/protocol/agent-context.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] `getAgentContext(projectRoot, options?): AgentContext`
    - [ ] Reads `superconductor/intelligence/00_manifest.json` — staleness check
    - [ ] Reads `superconductor/tracks.md` — active tracks and status
    - [ ] Reads `~/.superconductor/tool-registry.json` — tool availability
    - [ ] Assembles `AgentContext` with `schema_version: "1"`
    - [ ] `compressContext(ctx, tokenBudget): CompressedContext` — drops lowest-priority
      fields when context budget is tight (for Tier-2 models)
- [ ] Task: Implement `src/protocol/mcp-schema.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Define MCP tool schemas for all 6 superconductor tools
    - [ ] Use `zod` for schema validation (matching design-os-kernel pattern)
    - [ ] Export `SUPERCONDUCTOR_MCP_TOOLS` array
- [ ] Task: Export protocol module from `src/index.ts` barrel [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Agent Context Protocol' (Protocol in workflow.md)

---

## Phase 5: MCP Server Package

- [ ] Task: Write failing tests for MCP server tool registration [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: MCP server registers all 6 expected tools
    - [ ] Test: `superconductor_get_agent_context` returns valid `AgentContext` JSON
    - [ ] Test: `superconductor_run_intelligence` invokes pipeline and returns manifest
    - [ ] Test: `superconductor_get_track_status` returns track list with completion %
- [ ] Task: Implement `packages/superconductor-mcp-server/` [TIER-2] [AGENT:caduceus-processor]
    - [ ] `package.json` — name `@superconductor/mcp-server`
    - [ ] `src/index.ts` — MCP server using `@modelcontextprotocol/sdk`
      (follow design-os-kernel pattern exactly)
    - [ ] Register 6 tools from `SUPERCONDUCTOR_MCP_TOOLS` schemas
    - [ ] Each tool handler calls into `@superconductor/core` functions
    - [ ] `build` script: `tsc` → `dist/index.js`
- [ ] Task: Register `superconductor-mcp-server` in `gemini-extension.json` [TIER-1] [AGENT:caduceus-triage]
    - [ ] Add alongside existing `design-os-kernel` entry:
      ```json
      "superconductor": {
        "command": "node",
        "args": ["${extensionPath}/packages/superconductor-mcp-server/dist/index.js"]
      }
      ```
- [ ] Task: Verify AGY loads new MCP server without error [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: MCP Server Package' (Protocol in workflow.md)

---

## Phase 6: Universal CLI Adapter

- [ ] Task: Write failing tests for CLI commands [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `npx superconductor setup` exits 0 and writes tool registry
    - [ ] Test: `npx superconductor context --json` outputs valid JSON
    - [ ] Test: `npx superconductor track status` lists tracks from tracks.md
    - [ ] Test: unknown command prints help and exits 1
- [ ] Task: Implement `src/cli/index.ts` CLI adapter [TIER-2] [AGENT:caduceus-processor]
    - [ ] Command router: `intelligence | review | track | setup | context`
    - [ ] `intelligence` — calls `intelligence.runPipeline()` with parsed flags
    - [ ] `review` — calls `review.runPanel()` with parsed flags
    - [ ] `track status [id]` — calls `track.getCompletionStats()`
    - [ ] `setup` — calls `resolveRegistry()` in setup-only mode
    - [ ] `context [--json]` — calls `protocol.getAgentContext()`, prints JSON or summary
    - [ ] Add `"superconductor": "dist/cli/index.js"` to package.json `bin`
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Universal CLI Adapter' (Protocol in workflow.md)

---

## Phase 7: Harness Scaffold Directories

- [ ] Task: Create `harnesses/` directory structure [TIER-1] [AGENT:caduceus-triage]
    - [ ] `harnesses/agy/HARNESS.md` — documents AGY adapter (gemini-extension.json + skills)
    - [ ] `harnesses/claude/HARNESS.md` — Claude Desktop MCP setup instructions
    - [ ] `harnesses/claude/mcp_config_example.json` — ready-to-use MCP config for Claude
    - [ ] `harnesses/opencode/HARNESS.md` — OpenCode setup instructions
    - [ ] `harnesses/cli/HARNESS.md` — CLI adapter usage (always available)
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Harness Scaffolds' (Protocol in workflow.md)

---

## Phase 8: Intelligence Layer Track Amendment

- [ ] Task: Update `intelligence_layer_20260723` spec and plan [TIER-1] [AGENT:caduceus-triage]
    - [ ] Amend spec FR-2 to target `packages/superconductor-core/src/intelligence/`
    - [ ] Amend plan phases 2–8 to write into core, not `scripts/`
    - [ ] Note: `scripts/intelligence-pipeline.ts` becomes a thin shim
    - [ ] Commit amendment to intelligence_layer track files

---

## Phase 9: Integration & Finalization

- [ ] Task: Full test suite — zero regressions [TIER-1] [AGENT:caduceus-triage]
    - [ ] `npm test` in `packages/engine` — all pass
    - [ ] `npm test` in `packages/superconductor-core` — all pass
    - [ ] `npm test` in `packages/superconductor-mcp-server` — all pass
    - [ ] All existing review pipeline tests pass via shims
- [ ] Task: Verify AGY plugin loads correctly after migration [TIER-1] [AGENT:caduceus-triage]
    - [ ] AGY CLI can invoke all 28 skills without error
    - [ ] Both MCP servers (design-os-kernel, superconductor) register in AGY
- [ ] Task: Integrate track `core_harness_abstraction_20260723` into main [TIER-1] [AGENT:caduceus-triage]
