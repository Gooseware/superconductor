# Track Specification: Intelligence & Setup Subsystem Fix

**Track ID:** `intelligence_setup_fix_20260920`  
**Type:** Bug Fix / Chore  
**Target Branch:** `main`

---

## Project Constraints (from Notebook)

> **Design Decision (prior track `note_taking_hardening_20260903`):** Notebook write system is active. Preference notes require `user_confirmed: true`.

---

## Overview

The Superconductor intelligence subsystem chronically enters a degraded `❌ Intelligence: NONE` state even after setup completes. An Architecture Committee investigation has confirmed 6 CRITICAL defects and 12 additional issues spanning three layers: skill instruction files, the `superconductor-kernel` MCP server, and the `superconductor-core` intelligence pipeline.

The root cause is a three-way path confusion:
1. Skills call `getSuperconductorHome()` → `~/.superconductor` (global tool cache) instead of `<projectRoot>/superconductor/intelligence` (project-local snapshots).
2. `superconductor-kernel` MCP server defaults `PROJECT_ROOT` to the extension repo itself, not the user's active workspace.
3. `setup/SKILL.md` invokes a non-existent MCP tool and a CLI script that exits immediately without indexing — yet unconditionally reports "✅ Intelligence baseline established".

This track delivers a **full 3-layer fix** across all affected components, plus a UX/Consistency pass that ensures all agent-facing messages, banners, and skill instructions are clear, actionable, and minimal.

---

## Architecture Committee Report Summary

### Dreamer Findings
- **Root Cause Traced:** A false advisory in archived swarm log `intelligence_incremental_20260724/swarm_log.md:714–725` incorrectly instructed skills to use `getSuperconductorHome()` for snapshot resolution. This was propagated into `new-track/SKILL.md:193`, `coding-agent/SKILL.md:17`, and `standalone-review/SKILL.md:223`.
- **Three-Tier Directory Contract Proposed:** Separate `TOOL_HOME`, `PROJECT_ROOT`, and `INTELLIGENCE_DIR` as distinct, explicitly-named constants throughout the codebase.
- **Active Directory Surfacing:** All intelligence CLI runs must emit the indexed project path and output directory as the first log lines, before any processing begins.
- **Mismatch Detection:** `00_manifest.json` stores `manifest.projectRoot`. Skills compare this against the current `git rev-parse --show-toplevel`; on mismatch, emit a structured warning and offer auto re-scan.

### Reviewer Findings
- `CRITICAL-1`: MCP defaults `PROJECT_ROOT` to the extension repo — returns extension code intelligence instead of user project intelligence.
- `CRITICAL-2`: Workspace root boundary check in `IntelligenceStatusService` throws on any external project path.
- `CRITICAL-3`: Setup invokes non-existent `superconductor_run_intelligence` tool + `cli-update.js` exits 0 — false success banner always shown.
- `CRITICAL-4`: Skills pass `~/.superconductor` to `IntelligenceSnapshotReader.load()` — guaranteed perpetual `null`.
- `HIGH-1`: Null dereference on `context.driftBanner` when `RepoContext === null`.
- `HIGH-2`: Headless orchestrator throws `Track not found` on missing snapshot.

---

## Functional Requirements

### FR-1: Three-Tier Directory Contract
Establish three distinct directory constants used consistently across all packages and skills:
- **`TOOL_HOME`:** `$SUPERCONDUCTOR_HOME ?? ~/.superconductor` — global binary cache only (no snapshots).
- **`PROJECT_ROOT`:** Resolved dynamically via `git rev-parse --show-toplevel` from the active workspace.
- **`INTELLIGENCE_DIR`:** `path.join(PROJECT_ROOT, 'superconductor', 'intelligence')` — all snapshot I/O targets this path.

### FR-2: Fix `getSuperconductorHome()` Usage in Three Skills
Replace erroneous `outputDir = getSuperconductorHome()` in `skills/new-track/SKILL.md:193`, `skills/coding-agent/SKILL.md:17`, `skills/standalone-review/SKILL.md:223` with:
```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
OUTPUT_DIR="$PROJECT_ROOT/superconductor/intelligence"
```

### FR-3: MCP Server Dynamic `PROJECT_ROOT` & Tool Schema Fixes
- `index.ts`: replace static `path.resolve(PACKAGE_ROOT, '../..')` fallback with `process.cwd()`.
- `mcp_config.json`: inject `PROJECT_ROOT` from the AGY workspace environment.
- `IntelligenceStatusService`: remove the restrictive `startsWith` containment check; replace with `fs.realpathSync` symlink-safe validation.
- `kernel_intelligence_status` schema: add `workspaceRoot` param and return `{ status, project_root, manifest_project_root, snapshot_path, head_commit, age_days, commits_behind }`.
- `kernel_intelligence_get_hotspots`: add `try/catch`, return `{ hotspots: [], status: 'NONE' }` on missing file.
- `GraphCache`: accept `workspaceRoot` parameter at query time (not locked at constructor).

### FR-4: Active Directory Surfacing & Mismatch Detection
- All intelligence CLI runs emit as first output:
  ```
  [superconductor:intelligence] Indexing Project: <projectRoot>
  [superconductor:intelligence] Output Directory:  <outputDir>
  ```
- Skills read `manifest.projectRoot` post-load and compare to `git rev-parse --show-toplevel`. On mismatch:
  ```
  ⚠️  Intelligence Mismatch: indexed <manifest.projectRoot>, current workspace is <PROJECT_ROOT>
  Triggering re-scan...
  ```

### FR-5: Fix Setup Skill Execution & False Success Banner
- Replace `superconductor_run_intelligence` with `kernel_intelligence_refresh { force: true }`.
- Replace relative `node packages/...` with absolute `node ${SUPERCONDUCTOR_DIR}/packages/superconductor-core/dist/cli/index.js intelligence`.
- Gate success banner on `kernel_intelligence_status.status === 'LIVE'`.
- Success banner: `"✅ Intelligence baseline established for <projectRoot> (SHA: <sha>)"`.

### FR-6: Fix All Hardcoded `~/.gemini/extensions/superconductor` References
All skill files derive `SUPERCONDUCTOR_DIR` at runtime from the SKILL.md’s own directory path. Affected: `setup/SKILL.md:358,395,400,445`, `new-track/SKILL.md:271`, `setup/references/setup-protocol.md:4`.

### FR-7: Create `cli-blueprint.ts` CLI Wrapper
Create `packages/superconductor-core/src/intelligence/cli-blueprint.ts` wrapping existing `SwarmBlueprintGenerator.generate()` and `SwarmBlueprintGenerator.annotatePlan()`. Compile to `dist/intelligence/cli-blueprint.js`. Update `new-track/SKILL.md §2.3a`.

### FR-8: Fix `cli-update.ts` Empty Args Behavior
- Empty args → full baseline scan via `runPipeline([], projectRoot, outputDir)` (not exit 0).
- Add `--full` flag for explicit invocations.
- Fix `outputDir` to use `git rev-parse --show-toplevel`, not `process.cwd()`.

### FR-9: Fix `package-surface.ts` Non-Monorepo Crash
- Guard `fs.readdirSync('packages')` with `fs.existsSync()`.
- Extend scan to: `src`, `app`, `lib`, `cmd` in addition to `packages`.

### FR-10: Multi-Language Intelligence Runners
- `symbol-extraction.ts`: read `primaryLanguage` from `01_fingerprint.json`; map to ctags `--languages`. Support: TypeScript, JavaScript, Python, Go, Rust, C, C++, Java.
- `dependency-graph.ts`: generalize source path beyond hardcoded `packages/superconductor-core/src`.
- `test-gaps.ts`: generalize file extension filter based on `primaryLanguage`.

### FR-11: Fix Git Hook Missing `verify-signoff.mjs`
- Resolve `verify-signoff.mjs` from `${SUPERCONDUCTOR_DIR}/scripts/hooks/verify-signoff.mjs` (absolute extension-relative path).

### FR-12: Fix `graphify.ts` Environment Erasure
- Replace `env: { PATH: '...' }` with `env: { ...process.env, PATH: '...' }`.

### FR-13: Greenfield 0-Commit Repository STALE Bug
- `drift-monitor.ts`: when `headSha === 'unknown'`, set `commitsBehind = 0`, `status = 'LIVE'`.

### FR-14: Add Intelligence State to Setup Audit
- Add `superconductor/intelligence/00_manifest.json` to `setup/SKILL.md §1.2` audit table.
- Allow targeted intelligence-only re-run when project is initialized but intelligence is missing/stale.

---

## UX / Consistency Requirements

### UX-1: Quorum UX/Consistency Reviewer Role
A dedicated **UX Reviewer** role is added to the quorum panel for this track. Its responsibilities:
- **Message Consistency:** Audit all agent-visible output strings (banners, error messages, log lines, MCP response fields) for consistent tone, terminology, and formatting.
- **Do More With Less:** Flag any skill instruction section that can be simplified without losing meaning. Prefer concrete commands over abstract descriptions.
- **Cognitive Load Reduction:** Ensure that when an error occurs (e.g. `MISMATCH`, `NONE`), the message includes exactly: what went wrong, where, and one actionable next step. No more, no less.
- **Terminology Standardization:** Enforce that `INTELLIGENCE_DIR`, `PROJECT_ROOT`, and `TOOL_HOME` are used consistently across all touched files and never interchanged.
- **Banner Audit:** Review all emoji banners (`✅`, `❌`, `⚠️`) for appropriate and consistent usage. Ensure ✅ is gated on verified success, never on attempted action.

### UX-2: Structured Preflight Output Standard
All skill preflight sections for intelligence resolution must output a consistent single-line status block:
```
[superconductor] Intelligence: LIVE | Project: <name> | SHA: <sha7> | Age: <Xh>
[superconductor] Intelligence: MISMATCH | Indexed: <other_dir> | Current: <dir>
[superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project
```

### UX-3: Skill Instruction Simplification Pass
For every skill file touched in this track, a simplification pass must:
- Remove redundant parenthetical explanations that restate what the code already shows.
- Collapse multi-step sequences into the minimum number of logical steps.
- Prefer bullet lists over paragraph prose for procedural instructions.
- Remove any step that references a non-existent tool without a replacement (no phantom steps).

---

## Non-Functional Requirements

- **NFR-1:** All package changes must maintain backward-compatible TypeScript APIs.
- **NFR-2:** All modified modules must reach >80% unit test coverage (TDD-first).
- **NFR-3:** Setup and intelligence re-runs must be idempotent.
- **NFR-4:** No path may assume the extension lives at `~/.gemini/extensions/superconductor`.
- **NFR-5:** On `MISMATCH` or `NONE`, subsystem must always emit actionable, human-readable guidance — never silent degradation.

---

## Acceptance Criteria

- **AC-1:** After `/superconductor:setup`, `kernel_intelligence_status` returns `{ status: 'LIVE', project_root: '<actual_workspace>' }` matching `git rev-parse --show-toplevel`.
- **AC-2:** Setup success banner reads `"✅ Intelligence baseline established for <projectRoot> (SHA: <sha>)"` and is only emitted after `status === 'LIVE'` confirmed.
- **AC-3:** `/superconductor:new-track` with a valid snapshot emits a positive `context.driftBanner` and populates `RepoContext` with correct workspace data.
- **AC-4:** When `manifest.projectRoot !== git rev-parse --show-toplevel`, a `⚠️ Intelligence Mismatch` warning is emitted and auto re-scan is triggered.
- **AC-5:** `kernel_intelligence_get_hotspots` returns `{ hotspots: [], status: 'NONE' }` (not throws) when no graph cache exists.
- **AC-6:** `cli-blueprint.js` exists, accepts a `plan.md` path argument, and outputs a valid JSON cost summary.
- **AC-7:** Intelligence CLI on a Go, Python, or Rust project produces non-empty `01_fingerprint.json`, `02_dependency_graph.json`, and `06_symbols.json`.
- **AC-8:** `track/*` branch commits do not fail with `Cannot find module 'scripts/hooks/verify-signoff.mjs'`.
- **AC-9:** Running intelligence from a subfolder writes `00_manifest.json` to `<git_root>/superconductor/intelligence/`, not `<cwd>/superconductor/intelligence/`.
- **AC-10:** No path in any skill file references `~/.gemini/extensions/superconductor`.
- **AC-11 (UX):** All agent-visible intelligence status outputs conform to the UX-2 structured preflight output standard.
- **AC-12 (UX):** The UX quorum reviewer produces zero unresolved findings before merge.

---

## Out of Scope

- New intelligence pipeline phases (new AST backends, additional SAST tools).
- UI/visual changes to any frontend components.
- Changes to track lifecycle skills (implement, review, revert) beyond `outputDir` resolution fixes.
- Upgrading the underlying MCP protocol version.
- Multi-repo / monorepo workspace federation.
