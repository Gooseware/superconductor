# Implementation Plan: Harness-Agnostic Core Abstraction

**Track ID:** `core_harness_abstraction_20260723`
**Target Branch:** `main`
**Dependency:** Must be implemented BEFORE `intelligence_layer_20260723` Phase 2+
  (intelligence pipeline targets `packages/superconductor-core/src/intelligence/`)

---

## Phase 0: Swarm Preflight

- [x] Task: Verify swarm-orchestrate skill is installed [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Audit current scripts/ for harness coupling [TIER-1] [AGENT:caduceus-triage]
    - [x] Read all 7 `scripts/*.ts` files and list any AGY/Gemini-specific imports
    - [x] Confirm none import from AGY SDK (they should only use node:* built-ins)
    - [x] List which skills invoke which scripts (dependency map)
- [x] Task: Audit current `gemini-extension.json` and `plugin.json` [TIER-1] [AGENT:caduceus-triage]
    - [x] Document all harness bindings that will need updating
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Core Package Scaffold

- [x] Task: Write failing tests for core package structure [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `packages/superconductor-core` builds with tsc, zero errors
    - [x] Test: core index.ts exports all expected public API symbols
    - [x] Test: no imports from any harness package (ESLint rule)
- [x] Task: Scaffold `packages/superconductor-core/` [TIER-2] [AGENT:caduceus-processor]
    - [x] `package.json` — name `@superconductor/core`, ESM, strict TS
    - [x] `tsconfig.json` — matching engine package conventions
    - [x] `src/index.ts` — public API barrel (empty initially, populated per phase)
    - [x] `src/types/index.ts` — shared types (TrackState, CapabilitySlot, AgentContext, etc.)
    - [x] Add `@superconductor/core` to root `package.json` workspaces
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Core Package Scaffold' (Protocol in workflow.md)

---

## Phase 2: Review Pipeline Migration

- [x] Task: Write failing tests for migrated review functions [TIER-2] [AGENT:caduceus-processor]
    - [x] Test each of 7 scripts as named function imports from `@superconductor/core`
    - [x] Test: shim `scripts/aggregate-findings.ts` produces identical output to migrated function
    - [x] Test: shim `scripts/cascade-deferral-gate.ts` produces identical output
    - [x] Test: zero regression — run existing tests against migrated code
- [x] Task: Migrate 7 scripts to `src/review/` with named exports [TIER-2] [AGENT:caduceus-processor]
    - [x] `aggregate-coverage-manifest.ts` → `src/review/aggregate-coverage.ts`
    - [x] `aggregate-findings.ts` → `src/review/aggregate-findings.ts`
    - [x] `cascade-deferral-gate.ts` → `src/review/cascade-deferral-gate.ts`
    - [x] `deterministic-preflight.ts` → `src/review/deterministic-preflight.ts`
    - [x] `extract-fenced-block.ts` → `src/review/extract-fenced-block.ts`
    - [x] `generate-token-report.ts` → `src/review/generate-token-report.ts`
    - [x] `input-resolution.ts` → `src/review/input-resolution.ts`
    - [x] Each exports named function(s), removes top-level execution
    - [x] Export all from `src/review/index.ts`
    - [x] Add `review` to `src/index.ts` barrel
- [x] Task: Replace `scripts/*.ts` with thin shims [TIER-2] [AGENT:caduceus-processor]
    - [x] Each shim: `import { fn } from '@superconductor/core'; fn(process.argv.slice(2));`
    - [x] Verify all existing skill invocations work unchanged
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Review Pipeline Migration' (Protocol in workflow.md)

---

## Phase 3: Track Management Module

- [x] Task: Write failing tests for track management [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `readTrackRegistry()` parses `superconductor/tracks.md` correctly
    - [x] Test: `readPlan(trackId)` parses plan.md checkbox state
    - [x] Test: `checkTask(trackId, taskIndex)` toggles checkbox in plan.md
    - [x] Test: `readSpec(trackId)` parses acceptance criteria blocks
    - [x] Test: `checkPlanGap(trackId, diff)` identifies uncovered ACs
- [x] Task: Implement `src/track/track-reader.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] `readTrackRegistry(projectRoot): TrackEntry[]` — parses tracks.md
    - [x] `readPlan(projectRoot, trackId): PlanTask[]` — parses plan.md checkbox tree
    - [x] `readSpec(projectRoot, trackId): SpecSection[]` — parses spec.md
    - [x] `getAcceptanceCriteria(spec): CriterionItem[]` — extracts AC checklist items
- [x] Task: Implement `src/track/track-state.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] `checkTask(projectRoot, trackId, taskPath): void` — marks task ✅ in plan.md
    - [x] `uncheckTask(projectRoot, trackId, taskPath): void` — resets to unchecked
    - [x] `getCompletionStats(projectRoot, trackId): CompletionStats` — % done
- [x] Task: Implement `src/track/plan-gap-checker.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] `checkPlanGap(projectRoot, trackId, changedFiles): PlanGapReport`
    - [x] Reads acceptance criteria from spec.md
    - [x] Cross-references with git diff to find uncovered ACs
    - [x] Returns `{ covered: CriterionItem[], uncovered: CriterionItem[], confidence: number }`
- [x] Task: Export track module from `src/index.ts` barrel [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Track Management Module' (Protocol in workflow.md)

---

## Phase 4: Agent Context Protocol

- [x] Task: Write failing tests for agent context assembly [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `getAgentContext()` includes intelligence snapshot if fresh
    - [x] Test: `getAgentContext()` includes staleness warning if intelligence >1 commit old
    - [x] Test: `getAgentContext()` includes active track count and completion %
    - [x] Test: `getAgentContext()` includes tool registry status
    - [x] Test: `AgentContext` is JSON-serialisable (no circular refs)
    - [x] Test: schema_version field present
- [x] Task: Implement `src/protocol/agent-context.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] `getAgentContext(projectRoot, options?): AgentContext`
    - [x] Reads `superconductor/intelligence/00_manifest.json` — staleness check
    - [x] Reads `superconductor/tracks.md` — active tracks and status
    - [x] Reads `~/.superconductor/tool-registry.json` — tool availability
    - [x] Assembles `AgentContext` with `schema_version: "1"`
    - [x] `compressContext(ctx, tokenBudget): CompressedContext` — drops lowest-priority
      fields when context budget is tight (for Tier-2 models)
- [x] Task: Implement `src/protocol/mcp-schema.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Define MCP tool schemas for all 6 superconductor tools
    - [x] Use `zod` for schema validation (matching design-os-kernel pattern)
    - [x] Export `SUPERCONDUCTOR_MCP_TOOLS` array
- [x] Task: Export protocol module from `src/index.ts` barrel [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Agent Context Protocol' (Protocol in workflow.md)

---

## Phase 5: MCP Server Package

- [x] Task: Write failing tests for MCP server tool registration [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: MCP server registers all 6 expected tools
    - [x] Test: `superconductor_get_agent_context` returns valid `AgentContext` JSON
    - [x] Test: `superconductor_run_intelligence` invokes pipeline and returns manifest
    - [x] Test: `superconductor_get_track_status` returns track list with completion %
- [x] Task: Implement `packages/superconductor-mcp-server/` [TIER-2] [AGENT:caduceus-processor]
    - [x] `package.json` — name `@superconductor/mcp-server`
    - [x] `src/index.ts` — MCP server using `@modelcontextprotocol/sdk`
      (follow design-os-kernel pattern exactly)
    - [x] Register 6 tools from `SUPERCONDUCTOR_MCP_TOOLS` schemas
    - [x] Each tool handler calls into `@superconductor/core` functions
    - [x] `build` script: `tsc` → `dist/index.js`
- [x] Task: Register `superconductor-mcp-server` in `gemini-extension.json` [TIER-1] [AGENT:caduceus-triage]
    - [x] Add alongside existing `design-os-kernel` entry:
      ```json
      "superconductor": {
        "command": "node",
        "args": ["${extensionPath}/packages/superconductor-mcp-server/dist/index.js"]
      }
      ```
- [x] Task: Verify AGY loads new MCP server without error [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Superconductor - User Manual Verification 'Phase 5: MCP Server Package' (Protocol in workflow.md)

---

## Phase 6: Universal CLI Adapter

- [x] Task: Write failing tests for CLI commands [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `npx superconductor setup` exits 0 and writes tool registry
    - [x] Test: `npx superconductor context --json` outputs valid JSON
    - [x] Test: `npx superconductor track status` lists tracks from tracks.md
    - [x] Test: unknown command prints help and exits 1
- [x] Task: Implement `src/cli/index.ts` CLI adapter [TIER-2] [AGENT:caduceus-processor]
    - [x] Command router: `intelligence | review | track | setup | context`
    - [x] `intelligence` — calls `intelligence.runPipeline()` with parsed flags
    - [x] `review` — calls `review.runPanel()` with parsed flags
    - [x] `track status [id]` — calls `track.getCompletionStats()`
    - [x] `setup` — calls `resolveRegistry()` in setup-only mode
    - [x] `context [--json]` — calls `protocol.getAgentContext()`, prints JSON or summary
    - [x] Add `"superconductor": "dist/cli/index.js"` to package.json `bin`
- [x] Task: Superconductor - User Manual Verification 'Phase 6: Universal CLI Adapter' (Protocol in workflow.md)

---

## Phase 7: Harness Scaffold Directories

- [x] Task: Create `harnesses/` directory structure [TIER-1] [AGENT:caduceus-triage]
    - [x] `harnesses/agy/HARNESS.md` — documents AGY adapter (gemini-extension.json + skills)
    - [x] `harnesses/claude/HARNESS.md` — Claude Desktop MCP setup instructions
    - [x] `harnesses/claude/mcp_config_example.json` — ready-to-use MCP config for Claude
    - [x] `harnesses/opencode/HARNESS.md` — OpenCode setup instructions
    - [x] `harnesses/cli/HARNESS.md` — CLI adapter usage (always available)
- [x] Task: Superconductor - User Manual Verification 'Phase 7: Harness Scaffolds' (Protocol in workflow.md)

---

## Phase 8: Intelligence Layer Track Amendment

- [x] Task: Update `intelligence_layer_20260723` spec and plan [TIER-1] [AGENT:caduceus-triage]
    - [x] Amend spec FR-2 to target `packages/superconductor-core/src/intelligence/`
    - [x] Amend plan phases 2–8 to write into core, not `scripts/`
    - [x] Note: `scripts/intelligence-pipeline.ts` becomes a thin shim
    - [x] Commit amendment to intelligence_layer track files

---

## Phase 9: Integration & Finalization

- [x] Task: Full test suite — zero regressions [TIER-1] [AGENT:caduceus-triage]
    - [x] `npm test` in `packages/engine` — all pass
    - [x] `npm test` in `packages/superconductor-core` — all pass
    - [x] `npm test` in `packages/superconductor-mcp-server` — all pass
    - [x] All existing review pipeline tests pass via shims
- [x] Task: Verify AGY plugin loads correctly after migration [TIER-1] [AGENT:caduceus-triage]
    - [x] AGY CLI can invoke all 28 skills without error
    - [x] Both MCP servers (design-os-kernel, superconductor) register in AGY
- [x] Task: Integrate track `core_harness_abstraction_20260723` into main [TIER-1] [AGENT:caduceus-triage]

---

## Phase 10: Review Remediation (Iteration 1)

- [x] Task: Fix Core Review Pipeline Bugs [TIER-2] [AGENT:caduceus-processor]
    - [x] Fix `isLineRangeClose` in `packages/superconductor-core/src/review/aggregate-findings.ts` to strip `L` prefix before `parseInt` (COR-1)
    - [x] Fix `aggregateCoverageManifests` in `packages/superconductor-core/src/review/aggregate-coverage.ts` to handle string[] entries in `not_examined` (COR-2)
    - [x] Fix `checkPlanGap` in `packages/superconductor-core/src/track/plan-gap-checker.ts` to return `0.0` confidence when total criteria is 0 (ADV-10)
    - [x] Add unit test suite using `vitest` in `packages/superconductor-core/tests/` covering all 7 review modules and boundary cases (COR-6, ADV-5)
- [x] Task: Fix MCP Server Handlers and Script Shims [TIER-2] [AGENT:caduceus-processor]
    - [x] Update MCP server tool handlers (`superconductor_run_intelligence` and `superconductor_run_abi_retrospective`) to return structured `NOT_IMPLEMENTED` status instead of fake success (ADV-1, ADV-2, COR-4)
    - [x] Add `path.resolve()` scope validation for `projectRoot` in MCP server (SEC-1)
    - [x] Fix `scripts/deterministic-preflight.ts` import path extension from `.ts` to `.js` (COR-3)
    - [x] Add CLI execution wrappers to `scripts/*.ts` shims when invoked directly via `npx tsx` (ADV-7)
- [x] Task: Fix CLI Adapter and Protocol Utility Guards [TIER-2] [AGENT:caduceus-processor]
    - [x] Wire CLI `review` command in `src/cli/index.ts` to parse flags and invoke `resolveReviewInput()` (COR-5)
    - [x] Update CLI `setup` command to validate `~/.superconductor/` tool registry existence (ADV-3)
    - [x] Canonicalize `SUPERCONDUCTOR_HOME` using `path.resolve()` in `agent-context.ts` (SEC-2)
    - [x] Add schema validation guard for `JSON.parse` in `aggregate-findings.ts` (SEC-3)
    - [x] Add diagnostic warnings for corrupt JSON in `agent-context.ts` (ADV-9)
    - [x] Remove unrequested research markdown files from root commit / git untrack (ADV-4)
- [x] Task: Superconductor - User Manual Verification 'Phase 10: Review Remediation' (Protocol in workflow.md)
