# Implementation Plan: Project Intelligence Layer & Brownfield Repository Analysis

**Track ID:** `intelligence_layer_20260723`
**Target Branch:** `main`
**Estimated Complexity:** High (but tooling-reduced — orchestration, not parsing)

> ⚠️ **PREREQUISITE GATE:** Do not begin implementation until
> `core_harness_abstraction_20260723` is complete and merged.
> All implementation MUST target `packages/superconductor-core/src/intelligence/`.
> Any code written to `scripts/*.ts` is **shim-only** (no business logic).

---

## Phase -1: Prerequisite Verification

- [x] Task: Verify `core_harness_abstraction_20260723` is complete [TIER-1] [AGENT:caduceus-triage]
    - [x] Check `packages/superconductor-core/` exists and builds (`npm run build` in that package)
    - [x] Check `packages/superconductor-mcp-server/` exists and builds
    - [x] Check `packages/superconductor-core/src/intelligence/` directory exists (created by core track)
    - [x] Check `packages/superconductor-core/src/protocol/agent-context.ts` exists
    - [x] If any check fails: STOP — implement `core_harness_abstraction_20260723` first
- [x] Task: Verify `SUPERCONDUCTOR_HOME` resolves correctly [TIER-1] [AGENT:caduceus-triage]
    - [x] `node -e "console.log(require('os').homedir() + '/.superconductor')"` should print a valid path
    - [x] `~/.superconductor/` writable (core track Phase 0 should have created it)
- [x] Task: Superconductor - User Manual Verification 'Phase -1: Prerequisite Verification' (Protocol in workflow.md)

---

## Phase 0: Swarm Preflight

- [x] Task: Verify swarm-orchestrate skill is installed and loaded [TIER-1] [AGENT:caduceus-triage]
    - [x] Check `skills/swarm-orchestrate/SKILL.md` exists
    - [x] Confirm `scripts/` directory is writable
- [x] Task: Verify system prerequisites [TIER-1] [AGENT:caduceus-triage]
    - [x] `node --version` ≥ 18, `npx --version` present
    - [x] `git --version` present (required for coupling fallback)
    - [x] `java --version` present (needed for code-maat.jar in Phase 0.5)
    - [x] Log results — these are hard prerequisites; any failure blocks Phase 0.5
- [x] Task: Confirm `~/.superconductor/` is writable (create if absent) [TIER-1] [AGENT:caduceus-triage]
    - [x] `mkdir -p ~/.superconductor/bin` and verify write permission
    - [x] Document `SUPERCONDUCTOR_HOME` env var in `superconductor/workflow.md`
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 0.5: Tool Capability Registry

- [x] Task: Write failing tests for Tool Capability Registry lifecycle [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `SUPERCONDUCTOR_HOME` defaults to `~/.superconductor/` when env var not set
    - [x] Test: `SUPERCONDUCTOR_HOME` env var overrides default (CI / enterprise path)
    - [x] Test: no registry file → `setupRegistry()` creates `~/.superconductor/` + writes `tool-registry.json`
    - [x] Test: valid registry → quick-verify passes, setup skipped, completes in <1s
    - [x] Test: registered binary deleted → self-heal detects failure, finds alternative, updates registry
    - [x] Test: all alternatives exhausted → capability status `unavailable`, pipeline continues
    - [x] Test: registry `verified_at` >7 days → re-verification triggered
    - [x] Test: `--reset-registry` flag → registry deleted, full setup re-runs
    - [x] Test: `--setup-only` flag → registry written, pipeline does NOT run
    - [x] Test: `git-log-raw` fallback → coupling slot resolved with zero external tools
    - [x] Test: two different projects share same `~/.superconductor/tool-registry.json` (harness-agnostic)
- [x] Task: Implement `packages/superconductor-core/src/intelligence/tool-registry.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] `getSuperconductorHome(): string` — reads `SUPERCONDUCTOR_HOME` env var, falls back to `~/.superconductor/`
    - [x] `ensureHomeDir(home: string): void` — creates `~/.superconductor/bin/`, `semgrep-rules/`, `trivy-db/` if absent
    - [x] Define `CAPABILITY_SLOTS` constant with preferred + alternatives + paths relative to home dir
    - [x] `readRegistry(home): ToolRegistry | null` — reads `$home/tool-registry.json`
    - [x] `verifyTool(name, path): { ok: boolean, version: string }` — runs `<tool> --version`
    - [x] `discoverCapability(slot, home): CapabilityEntry` — tries preferred then alternatives in order
    - [x] `setupRegistry(home): ToolRegistry` — full discovery, writes registry, returns result
    - [x] `quickVerify(registry, home): ToolRegistry` — verifies each `installed` tool, self-heals on failure
    - [x] `isStale(registry): boolean` — checks `verified_at` age against 7-day threshold
    - [x] `resolveRegistry(home, flags): ToolRegistry` — entry point: read → stale check → verify/setup
    - [x] Print ✅/⚠️/❌ per capability during setup
    - [x] Print installation guidance + `--reset-registry` reminder for each unavailable capability
    - [x] `git-log-raw` fallback always populates `coupling` slot — built-in, never unavailable
    - [x] Registry `superconductor_home` field records resolved home path for debugging
    - [x] Export from `packages/superconductor-core/src/intelligence/index.ts`
- [x] Task: Create AGY shim `scripts/tool-registry.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
    - [x] `import { resolveRegistry } from '@superconductor/core'; resolveRegistry(...process.argv.slice(2));`
- [x] Task: Implement `--reset-registry` and `--setup-only` flags in core CLI adapter [TIER-1] [AGENT:caduceus-triage]
    - [x] `npx superconductor setup --reset-registry`: deletes registry, calls `setupRegistry()`
    - [x] `npx superconductor setup`: calls `resolveRegistry()`, prints summary table, exits 0
- [x] Task: Download `code-maat.jar` to `$SUPERCONDUCTOR_HOME/bin/` during setup [TIER-1] [AGENT:caduceus-triage]
    - [x] Download from GitHub releases to `~/.superconductor/bin/code-maat.jar`
    - [x] Verify JAR executes: `java -jar ~/.superconductor/bin/code-maat.jar --help`
- [x] Task: Download semgrep local rule bundles to `$SUPERCONDUCTOR_HOME/semgrep-rules/` [TIER-1] [AGENT:caduceus-triage]
    - [x] Copy/clone community security rules to `~/.superconductor/semgrep-rules/`
    - [x] Verify semgrep offline: `semgrep scan --config ~/.superconductor/semgrep-rules --dry-run`
- [x] Task: Pre-cache trivy DB to `$SUPERCONDUCTOR_HOME/trivy-db/` [TIER-1] [AGENT:caduceus-triage]
    - [x] `trivy image --download-db-only --cache-dir ~/.superconductor/trivy-db`
    - [x] Verify offline: `trivy fs . --skip-db-update --offline-scan --cache-dir ~/.superconductor/trivy-db`
- [x] Task: Superconductor - User Manual Verification 'Phase 0.5: Tool Capability Registry' (Protocol in workflow.md)

---

## Phase 1: Preflight & Tool Availability Matrix

- [x] Task: Write failing tests for tool availability detection [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: all tools available → manifest shows no degraded flags
    - [x] Test: tokei missing → `01_fingerprint.json` is null, pipeline continues
    - [x] Test: all optional tools missing → pipeline completes with 5 null files
    - [x] Test: `lizard` missing but tokei present → manifest `degraded: ["lizard"]`
- [x] Task: Implement `packages/superconductor-core/src/intelligence/preflight.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Reads Tool Capability Registry from `~/.superconductor/tool-registry.json`
    - [x] Runs quick-verification on each `installed` tool entry
    - [x] Prints ✅/⚠️/❌ availability matrix to stdout
    - [x] Returns structured object: `{ available: string[], degraded: string[], unavailable: string[] }`
    - [x] Prints install guidance for each unavailable capability
    - [x] Export from `packages/superconductor-core/src/intelligence/index.ts`
- [x] Task: Create AGY shim `scripts/intelligence-preflight.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
    - [x] `import { runPreflight } from '@superconductor/core/intelligence'; runPreflight();`
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Preflight & Tool Availability' (Protocol in workflow.md)

---

## Phase 2: Language Fingerprint + Dependency Graph

- [x] Task: Write failing tests for tokei fingerprint and dependency graph outputs [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `01_fingerprint.json` contains expected fields (languages, lines, files)
    - [x] Test: `02_dependencies.json` contains nodes and edges arrays
    - [x] Test: circular dependency in fixture repo → circular flag in output
    - [x] Test: non-JS/TS repo → `auto-uml` used as polyglot fallback
- [x] Task: Implement `packages/superconductor-core/src/intelligence/runners/fingerprint.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Invoke `tokei <target> --output json`
    - [x] Normalise output to canonical schema: `{ languages: {}, totalLines, totalFiles, primaryLanguage }`
    - [x] Write to `01_fingerprint.json`
    - [x] Export from `runners/index.ts`
- [x] Task: Implement `packages/superconductor-core/src/intelligence/runners/dependency-graph.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Detect primary language from `01_fingerprint.json`
    - [x] Route to language-specific tool:
        - TS/JS → `dependency-cruiser`: `npx depcruise src -T json`
        - Python → `deptry . --json-output`
        - Go → `go-callvis -format dot ./...` (convert DOT→JSON)
        - Polyglot fallback → `auto-uml --source-code <target> --no-mermaid`
    - [x] Normalise all outputs to canonical schema: `{ nodes: [], edges: [], circularDeps: [] }`
    - [x] Write to `02_dependencies.json`
    - [x] Export from `runners/index.ts`
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Fingerprint + Dependency Graph' (Protocol in workflow.md)

---

## Phase 3: Complexity Hotspot Map + Hotspot Index

- [x] Task: Write failing tests for complexity output and hotspot index [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `03_complexity.json` contains `hotspot_score` field per file
    - [x] Test: files sorted descending by `hotspot_score`
    - [x] Test: hotspot formula: `score = cyclomatic_complexity × log(1 + churn)`
    - [x] Test: `-w` flag applied — only over-threshold functions in output
    - [x] Test: top-10 hotspots printed to stdout on pipeline completion
- [x] Task: Implement `packages/superconductor-core/src/intelligence/runners/complexity.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Invoke `lizard <target> -w -f json` (hotspot-only output)
    - [x] Parse JSON output, extract file-level aggregates
    - [x] Read git churn: `git log --all --name-only --format='format:' | sort | uniq -c`
    - [x] Compute `hotspot_score = cyclomatic_complexity × Math.log(1 + churnCount)`
    - [x] Sort descending, write `03_complexity.json` with `hotspot_score` field
    - [x] Print top-10 to stdout with ✅/⚠️/❌ risk ratings
    - [x] Export from `runners/index.ts`
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Complexity Hotspot Map' (Protocol in workflow.md)

---

## Phase 4: Git Coupling Matrix

- [x] Task: Write failing tests for git coupling matrix output [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `04_coupling.csv` produced with entity-a, entity-b, coupled columns
    - [x] Test: fixture repo with known coupling → coupling detected correctly
    - [x] Test: code-maat missing → `04_coupling.csv` is null, manifest records degraded
    - [x] Test: raw git fallback (no code-maat JAR) → simplified churn-only CSV
- [x] Task: Implement `packages/superconductor-core/src/intelligence/runners/coupling.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Read JAR path from tool registry: `$SUPERCONDUCTOR_HOME/bin/code-maat.jar`
    - [x] Generate git log: `git log --all --numstat --format=format: > /tmp/gitlog.txt`
    - [x] Invoke code-maat: `java -jar $SUPERCONDUCTOR_HOME/bin/code-maat.jar -l /tmp/gitlog.txt -c git2 -a coupling`
    - [x] Write output to `04_coupling.csv`
    - [x] Fallback (no JAR): produce simplified `{ file, churnCount }[]` JSON from raw git log
    - [x] Export from `runners/index.ts`
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Git Coupling Matrix' (Protocol in workflow.md)

---

## Phase 5: Security Surface

- [x] Task: Write failing tests for SAST security surface output [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `05_sast.json` contains findings array with severity, file, line fields
    - [x] Test: semgrep invoked with `--config ./scripts/semgrep-rules` (local only, never auto)
    - [x] Test: trivy invoked with `--skip-db-update --offline-scan` flags always present
    - [x] Test: mock invocation log — zero network calls during pipeline run
    - [x] Test: semgrep missing → `05_sast.json` is null, pipeline continues
- [x] Task: Implement `packages/superconductor-core/src/intelligence/runners/sast.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Read rules dir from tool registry: `$SUPERCONDUCTOR_HOME/semgrep-rules/`
    - [x] Invoke: `semgrep scan --config $SUPERCONDUCTOR_HOME/semgrep-rules --json -o 05_sast_semgrep.json`
    - [x] Guard: if `--config=auto` would be used, abort and log ❌ privacy violation
    - [x] Read trivy DB from tool registry: `$SUPERCONDUCTOR_HOME/trivy-db/`
    - [x] Invoke: `trivy fs <target> --format json --skip-db-update --offline-scan --cache-dir $SUPERCONDUCTOR_HOME/trivy-db`
    - [x] Merge semgrep + trivy outputs into unified `05_sast.json`
    - [x] Schema: `{ findings: [{ tool, severity, ruleId, file, line, message }] }`
    - [x] Export from `runners/index.ts`
- [x] Task: Superconductor - User Manual Verification 'Phase 5: Security Surface' (Protocol in workflow.md)

---

## Phase 6: Symbol Extraction + API Surface + TOON Bridge

- [x] Task: Write failing tests for TSA symbol extraction and TOON bridge [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `06_api_surface.toon` produced by tree-sitter-analyzer
    - [x] Test: `06_api_surface_summary.md` produced by TOON bridge — one line per symbol
    - [x] Test: undocumented exported symbol → marked "undocumented" in summary
    - [x] Test: TSA missing → `06_api_surface.toon` is null, bridge skipped
- [x] Task: Implement `packages/superconductor-core/src/intelligence/runners/symbol-extraction.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Invoke: `tree-sitter-analyzer search --project-root <target> --output_format toon > 06_api_surface.toon`
    - [x] Fallback: if TSA missing → use `universal-ctags --output-format=json -R`
    - [x] Write raw output to `06_api_surface.toon`
    - [x] Export from `runners/index.ts`
- [x] Task: Implement `packages/superconductor-core/src/intelligence/runners/toon-summary.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Parse TOON format into structured symbol records
    - [x] Format each record: `[type] [file]:[line] [name]([params]) — [docstring|"undocumented"]`
    - [x] Write `06_api_surface_summary.md`
    - [x] Emit count of undocumented public exports to stdout
    - [x] Export from `runners/index.ts`
- [x] Task: Create AGY shim `scripts/toon-to-summary.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Superconductor - User Manual Verification 'Phase 6: Symbol Extraction + API Surface' (Protocol in workflow.md)

---

## Phase 7: Static Test Gap Analyzer

- [x] Task: Write failing tests for static test gap analysis [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: symbol never imported by any test file → risk "critical" if high churn
    - [x] Test: symbol imported by test → not in output
    - [x] Test: idempotency — two runs produce identical `07_test_gaps.json`
    - [x] Test: empty tests/ directory → all exported symbols flagged as uncovered
    - [x] Test: symbol in test file but as indirect import → counts as covered
- [x] Task: Implement `packages/superconductor-core/src/intelligence/runners/test-gaps.ts` [TIER-2] [AGENT:caduceus-processor]
    - [x] Read `06_api_surface.toon` → extract exported symbols + source files
    - [x] Scan `tests/`, `test/`, `__tests__/`, `spec/`, `*.test.*`, `*.spec.*` for imports
    - [x] Build import graph: `{ testFile → Set<importedSourceFiles> }`
    - [x] Identify source files never appearing in any test's import set
    - [x] Join with git churn from `04_coupling.csv`
    - [x] Assign risk: `critical` = uncovered + churn ≥ 5, `high` = uncovered + churn ≥ 2,
          `medium` = uncovered + churn ≥ 1, `low` = uncovered, no churn
    - [x] Write `07_test_gaps.json`: `{ file, exportedSymbols[], gitChurnScore, riskLevel }`
    - [x] Export from `runners/index.ts`
- [x] Task: Create AGY shim `scripts/static-test-gap-analyzer.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Superconductor - User Manual Verification 'Phase 7: Static Test Gap Analyzer' (Protocol in workflow.md)

---

## Phase 8: Pipeline Orchestration, Manifest + Brownfield CLI

- [x] Task: Write failing tests for pipeline orchestration and manifest [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `00_manifest.json` contains all required fields (tools, versions, timestamp, trackId, degraded)
    - [x] Test: pipeline completes in <60s on superconductor repo (performance regression test)
    - [x] Test: `--brownfield --target <fixture>` runs without `tracks.md` present
    - [x] Test: `--report` flag generates `repository-health-report.md` with all 8 sections
    - [x] Test: `--skip-sast` flag skips phases 5 entirely, manifest records skip
    - [x] Test: staleness warning emitted when manifest timestamp < last git commit
- [x] Task: Implement `packages/superconductor-core/src/intelligence/pipeline.ts` orchestrator [TIER-2] [AGENT:caduceus-processor]
    - [x] Parse CLI flags: `--brownfield`, `--target`, `--output`, `--skip-sast`, `--report`, `--track`
    - [x] Run preflight, then phases 1→7 sequentially with elapsed time logging
    - [x] Write `00_manifest.json` at completion with full run metadata
    - [x] Emit top-10 hotspots summary to stdout
    - [x] Handle degraded mode: continue on missing tools, record in manifest
    - [x] Export `runPipeline()` from `packages/superconductor-core/src/intelligence/index.ts`
    - [x] Register as `superconductor_run_intelligence` MCP tool in `@superconductor/mcp-server`
    - [x] Register as `npx superconductor intelligence` in core CLI adapter
- [x] Task: Create AGY shim `scripts/intelligence-pipeline.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
    - [x] `import { runPipeline } from '@superconductor/core/intelligence'; runPipeline(process.argv.slice(2));`
- [x] Task: Implement `--report` brownfield health report generator [TIER-2] [AGENT:caduceus-processor]
    - [x] Implement in `packages/superconductor-core/src/intelligence/report.ts`
    - [x] Read all 7 output files
    - [x] Generate `repository-health-report.md` with 8 sections:
          Executive Summary, Stack Fingerprint, Dependency Health, Complexity Hotspot Map,
          Security Surface, API Coverage Gaps, Test Coverage Gaps, Recommendations
    - [x] Recommendations section: top 5 issues ranked by `hotspot_score × severity`
- [x] Task: Superconductor - User Manual Verification 'Phase 8: Pipeline Orchestration + Brownfield CLI' (Protocol in workflow.md)

---

## Phase 9: Agent Context Protocol + Skill Updates

- [x] Task: Write failing tests for staleness detection and agent protocol [TIER-1] [AGENT:caduceus-triage]
    - [x] Test: `00_manifest.json` timestamp before last git commit → staleness warning
    - [x] Test: `00_manifest.json` timestamp after last git commit → no warning
- [x] Task: Update `skills/implement/SKILL.md` — producer intelligence layer protocol [TIER-1] [AGENT:caduceus-triage]
    - [x] Add §: "Before implementing, check `superconductor/intelligence/00_manifest.json`"
    - [x] If fresh: read `06_api_surface_summary.md` to discover reusable symbols
    - [x] If stale or absent: proceed with direct file reading
- [x] Task: Update `skills/new-track/SKILL.md` — planner intelligence layer protocol [TIER-1] [AGENT:caduceus-triage]
    - [x] Add §: "Before planning, read intelligence JSON to understand existing architecture"
    - [x] Read `01_fingerprint.json` (stack), `02_dependencies.json` (coupling risks),
          `03_complexity.json` (hotspots to avoid touching)
- [x] Task: Update `skills/standalone-review/SKILL.md` — reviewer intelligence layer protocol [TIER-1] [AGENT:caduceus-triage]
    - [x] Add §: "Before reviewing, check intelligence layer for blast-radius context"
    - [x] Read `02_dependencies.json` — which modules depend on changed code
    - [x] Read `07_test_gaps.json` — flag changed files with critical/high test gap risk
- [x] Task: Generate `superconductor/intelligence/README.md` template [TIER-1] [AGENT:caduceus-triage]
    - [x] Document each output file's schema and agent usage guidance
- [x] Task: Update `workflow.md` — add post-phase intelligence pipeline hook [TIER-1] [AGENT:caduceus-triage]
    - [x] After every phase completion step, add: "Run intelligence pipeline hook"
    - [x] Document greenfield hook invocation command
- [x] Task: Superconductor - User Manual Verification 'Phase 9: Agent Context Protocol + Skill Updates' (Protocol in workflow.md)

---

## Phase 10: Integration Tests + Full Suite

- [x] Task: Run intelligence pipeline end-to-end on the superconductor repo itself [TIER-2] [AGENT:caduceus-processor]
    - [x] Verify all 8 output files produced (7 + manifest)
    - [x] Verify `hotspot_score` field on every complexity entry
    - [x] Verify `07_test_gaps.json` shows realistic test coverage gaps
    - [x] Verify `repository-health-report.md` generated with `--report` flag
    - [x] Verify pipeline completes in <60 seconds
- [x] Task: Run brownfield mode on a minimal fixture repository [TIER-2] [AGENT:caduceus-processor]
    - [x] Create `tests/fixtures/brownfield-repo/` with mixed TS + Python files
    - [x] Verify `--brownfield --target tests/fixtures/brownfield-repo` runs without `tracks.md`
    - [x] Verify report generated correctly
- [x] Task: Run full test suite and confirm zero regressions [TIER-1] [AGENT:caduceus-triage]
- [x] Task: Integrate track `intelligence_layer_20260723` into main branch [TIER-1] [AGENT:caduceus-triage]
