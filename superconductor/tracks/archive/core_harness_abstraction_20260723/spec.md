# Spec: Harness-Agnostic Core Abstraction

## Overview

Extract all business logic from AGY-coupled code into a harness-agnostic
`packages/superconductor-core` package. Each harness (AGY, Claude Desktop,
OpenCode, VSCode, CLI) becomes a thin adapter that speaks to the core through
a stable, versioned API. Adding a new harness requires zero changes to core logic.

## Current State Analysis

```
packages/
  engine/              ← @superconductor/engine (ALREADY harness-agnostic ✅)
  superconductor-kernel/    ← @superconductor/kernel (MCP pattern ESTABLISHED ✅)

scripts/               ← 7 review pipeline scripts (AGY-coupled ⚠️)
  aggregate-coverage-manifest.ts
  aggregate-findings.ts
  cascade-deferral-gate.ts
  deterministic-preflight.ts
  extract-fenced-block.ts
  generate-token-report.ts
  input-resolution.ts

skills/                ← 28 skills (100% AGY-specific — SKILL.md format)
  standalone-review/   ← calls scripts/ directly
  implement/
  new-track/
  swarm-orchestrate/
  ...

gemini-extension.json  ← AGY harness binding (contextFileName, mcpServers)
```

The engine package is a model to follow. The gap is:
1. `scripts/` logic is AGY-invoked but the scripts themselves contain harness-agnostic
   business logic (review aggregation, cascade gate, token reporting)
2. The intelligence pipeline (intelligence_layer track) would land in `scripts/` —
   but should live in `packages/superconductor-core` instead
3. Skills are the AGY adapter layer — they should call core, not implement logic

## Target Architecture

```
packages/
  engine/                        ← @superconductor/engine (unchanged, planning)
  superconductor-kernel/              ← @superconductor/kernel (unchanged, design OS)
  superconductor-core/           ← @superconductor/core (NEW — all business logic)
    src/
      review/                    ← review pipeline (migrated from scripts/)
        aggregate-coverage.ts
        aggregate-findings.ts
        cascade-deferral-gate.ts
        deterministic-preflight.ts
        extract-fenced-block.ts
        generate-token-report.ts
        input-resolution.ts
      intelligence/              ← intelligence pipeline (new, from intelligence_layer track)
        pipeline.ts
        tool-registry.ts
        static-test-gap-analyzer.ts
        toon-to-summary.ts
        runners/                 ← one runner per capability slot
          fingerprint.ts
          dependency-graph.ts
          complexity.ts
          coupling.ts
          sast.ts
          symbol-extraction.ts
      track/                     ← track management
        track-reader.ts          ← reads tracks.md, plan.md, spec.md
        track-state.ts           ← task checkbox state (check/uncheck)
        plan-gap-checker.ts      ← post-implementation AC verification
        abi-retrospective.ts     ← ABI induction engine
      protocol/
        agent-context.ts         ← standardised context bundle for any agent
        mcp-schema.ts            ← MCP tool definitions (harness-agnostic)
      types/
        index.ts                 ← all shared types
      index.ts                   ← public API surface

harnesses/
  agy/                           ← AGY adapter (thin wrappers)
    gemini-extension.json        ← AGY harness binding
    skills/                      ← SKILL.md files call core via npx
    scripts/                     ← thin shim: import from core, re-export

  claude/                        ← Claude Desktop adapter (future)
    mcp-server.ts                ← wraps core as MCP server
    claude-desktop-config.json   ← points at mcp-server

  opencode/                      ← OpenCode adapter (future)
    extension.ts                 ← OpenCode extension API bindings

  cli/                           ← Universal CLI adapter (always available)
    index.ts                     ← npx superconductor <command>
    commands/
      review.ts
      intelligence.ts
      track.ts
      setup.ts
```

## The MCP Bridge Pattern (Established by superconductor-kernel)

`packages/superconductor-kernel` already demonstrates the correct pattern:
- Core logic in TypeScript
- Exposed as an MCP server via `@modelcontextprotocol/sdk`
- Registered in `gemini-extension.json` for AGY harness
- Registerable in `mcp_config.json` for any MCP-compatible harness

`packages/superconductor-core` will expose a **`superconductor-mcp-server`**
following the same pattern. This gives every MCP-compatible harness (AGY, Claude
Desktop, OpenCode, any future tool) instant access to all capabilities.

## Functional Requirements

### FR-1: Core Package Structure
- New package `packages/superconductor-core/` with `package.json` name
  `@superconductor/core`
- Exports clean public API surface via `src/index.ts`
- Zero harness-specific dependencies (no AGY SDK, no Claude SDK, no VSCode API)
- Depends only on: `@superconductor/engine`, `node:*` built-ins, `@modelcontextprotocol/sdk`
- All existing `scripts/*.ts` business logic migrated in with no behaviour change
- TypeScript strict mode, ESM modules (matching engine package conventions)

### FR-2: Review Pipeline Migration
- All 7 `scripts/*.ts` files migrated to `packages/superconductor-core/src/review/`
- Migrated files export named functions instead of executing on import
- `scripts/` directory in AGY harness becomes thin shims:
  ```ts
  // scripts/aggregate-findings.ts (shim)
  import { aggregateFindings } from '@superconductor/core';
  aggregateFindings(process.argv.slice(2));
  ```
- Existing skill invocations continue to work unchanged (shim is transparent)
- Zero regression in existing review pipeline behaviour

### FR-3: Intelligence Pipeline in Core
- New `packages/superconductor-core/src/intelligence/` module
- `intelligence_layer_20260723` track targets this location (not `scripts/`)
- `tool-registry.ts` reads `SUPERCONDUCTOR_HOME` → `~/.superconductor/`
- Each capability slot implemented as a separate `runners/<slot>.ts` module
- Pipeline orchestrator composes runners: clean dependency injection, testable

### FR-4: Track Management Module
- `packages/superconductor-core/src/track/track-reader.ts` — reads
  `superconductor/tracks.md`, `tracks/<id>/plan.md`, `tracks/<id>/spec.md`
- `track-state.ts` — toggles task checkboxes in plan.md (check/uncheck)
- `plan-gap-checker.ts` — semantic diff of implementation vs acceptance criteria
- `abi-retrospective.ts` — migrated from `abi_retrospective_20260723` track target

### FR-5: Agent Context Protocol
- `packages/superconductor-core/src/protocol/agent-context.ts`
- `getAgentContext(projectRoot): AgentContext` — assembles the full context bundle:
  - Intelligence layer snapshot (from `superconductor/intelligence/`)
  - Active track status (from `superconductor/tracks.md`)
  - Tool registry status (from `~/.superconductor/tool-registry.json`)
  - Relevant skill list for current task
- Any harness calls this once per session and feeds the result to its LLM
- Standardised schema: harness-agnostic, versioned, JSON-serialisable

### FR-6: MCP Server for Core (`superconductor-mcp-server`)
- New package `packages/superconductor-mcp-server/` (or as MCP export from core)
- Exposes all core capabilities as MCP tools:
  | MCP Tool | Core Function |
  |---|---|
  | `superconductor_run_intelligence` | `intelligence.runPipeline()` |
  | `superconductor_get_track_status` | `track.getStatus()` |
  | `superconductor_get_agent_context` | `protocol.getAgentContext()` |
  | `superconductor_run_review` | `review.runPanel()` |
  | `superconductor_check_plan_gap` | `track.checkPlanGap()` |
  | `superconductor_run_abi_retrospective` | `track.runABIRetrospective()` |
- Registered in `gemini-extension.json` for AGY (alongside superconductor-kernel)
- Any Claude Desktop, OpenCode, or future harness adds `mcp_config.json` entry

### FR-7: AGY Harness Adapter (Thin Shims Only)
- `skills/` SKILL.md files updated to call core via `npx superconductor <command>`
  or by importing from `@superconductor/core` in their companion scripts
- `scripts/` directory replaced by thin shims (no business logic)
- `gemini-extension.json` updated to register `superconductor-mcp-server`
- No AGY-specific logic in any `packages/` code

### FR-8: Universal CLI Adapter
- `packages/superconductor-core/src/cli/index.ts` — `npx superconductor`
- Commands mirror MCP tool surface:
  ```
  npx superconductor intelligence [--target <path>] [--brownfield] [--report]
  npx superconductor review [--staged|--branch <b>|--pr <url>]
  npx superconductor track status [<track_id>]
  npx superconductor setup [--reset-registry]
  npx superconductor context [--json]
  ```
- Any harness can invoke these as subprocesses — zero harness coupling
- CI/CD integrations use this interface directly

### FR-9: Harness Scaffold Templates
- `harnesses/agy/` — existing AGY code reorganised (no behaviour change)
- `harnesses/claude/README.md` — instructions for Claude Desktop MCP setup
- `harnesses/opencode/README.md` — instructions for OpenCode setup
- `harnesses/cli/` — symlink or re-export from core CLI
- Each harness directory has a `HARNESS.md` explaining:
  - What the harness adapter does
  - How to register the MCP server with that harness
  - Which capabilities are available in this harness

## Non-Functional Requirements

- **Backwards compatibility:** All existing AGY skill invocations work unchanged
  after migration. Skills calling `scripts/aggregate-findings.ts` still work.
- **Additive only:** No existing public API removed. New harness interfaces added
  alongside existing ones.
- **Versioned protocol:** `AgentContext` and MCP tool schemas include
  `schema_version` field. Breaking changes increment version.
- **Zero harness coupling in core:** `packages/superconductor-core` must not
  import from any harness-specific package. Enforced by ESLint no-restricted-imports.
- **Testable in isolation:** All core modules have unit tests that run without
  any harness present (no AGY, no Claude Desktop, no MCP connection).

## Acceptance Criteria

### Core Package
- [ ] `packages/superconductor-core/package.json` exists with name `@superconductor/core`
- [ ] `packages/superconductor-core/src/index.ts` exports clean public API
- [ ] `packages/superconductor-core` builds (`tsc`) with zero errors
- [ ] Core has zero imports from any harness package

### Review Pipeline Migration
- [ ] All 7 scripts migrated to `src/review/` with named exports
- [ ] `scripts/` shims work: existing skill invocations produce identical output
- [ ] All existing review tests pass against migrated code

### Intelligence Pipeline Placement
- [ ] `src/intelligence/pipeline.ts` is the entry point (not `scripts/intelligence-pipeline.ts`)
- [ ] `scripts/intelligence-pipeline.ts` is a shim that calls core

### MCP Server
- [ ] `superconductor-mcp-server` registers all 6 MCP tools
- [ ] `gemini-extension.json` registers both `superconductor-kernel` and `superconductor-mcp-server`
- [ ] Claude Desktop can connect to `superconductor-mcp-server` via `mcp_config.json`

### CLI Adapter
- [ ] `npx superconductor intelligence` runs the intelligence pipeline
- [ ] `npx superconductor review --staged` runs the review panel
- [ ] `npx superconductor setup` runs `--setup-only` for tool registry
- [ ] `npx superconductor context --json` outputs `AgentContext` JSON

### Harness Scaffolds
- [ ] `harnesses/agy/` contains reorganised AGY adapter
- [ ] `harnesses/claude/README.md` exists with complete MCP setup instructions
- [ ] `harnesses/opencode/README.md` exists with OpenCode setup instructions
- [ ] `harnesses/*/HARNESS.md` exists for each harness directory

### Regression
- [ ] All existing tests pass (zero regressions)
- [ ] AGY plugin loads and all skills work after migration

## Out of Scope
- Implementing Claude harness adapter beyond README scaffold
- Implementing OpenCode harness adapter beyond README scaffold
- Migrating superconductor-kernel (it is already correctly structured)
- Changing AGY skill SKILL.md content (only the underlying scripts change)
