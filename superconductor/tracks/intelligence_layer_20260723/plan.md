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

- [ ] Task: Verify `core_harness_abstraction_20260723` is complete [TIER-1] [AGENT:caduceus-triage]
    - [ ] Check `packages/superconductor-core/` exists and builds (`npm run build` in that package)
    - [ ] Check `packages/superconductor-mcp-server/` exists and builds
    - [ ] Check `packages/superconductor-core/src/intelligence/` directory exists (created by core track)
    - [ ] Check `packages/superconductor-core/src/protocol/agent-context.ts` exists
    - [ ] If any check fails: STOP — implement `core_harness_abstraction_20260723` first
- [ ] Task: Verify `SUPERCONDUCTOR_HOME` resolves correctly [TIER-1] [AGENT:caduceus-triage]
    - [ ] `node -e "console.log(require('os').homedir() + '/.superconductor')"` should print a valid path
    - [ ] `~/.superconductor/` writable (core track Phase 0 should have created it)
- [ ] Task: Superconductor - User Manual Verification 'Phase -1: Prerequisite Verification' (Protocol in workflow.md)

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify swarm-orchestrate skill is installed and loaded [TIER-1] [AGENT:caduceus-triage]
    - [ ] Check `skills/swarm-orchestrate/SKILL.md` exists
    - [ ] Confirm `scripts/` directory is writable
- [ ] Task: Verify system prerequisites [TIER-1] [AGENT:caduceus-triage]
    - [ ] `node --version` ≥ 18, `npx --version` present
    - [ ] `git --version` present (required for coupling fallback)
    - [ ] `java --version` present (needed for code-maat.jar in Phase 0.5)
    - [ ] Log results — these are hard prerequisites; any failure blocks Phase 0.5
- [ ] Task: Confirm `~/.superconductor/` is writable (create if absent) [TIER-1] [AGENT:caduceus-triage]
    - [ ] `mkdir -p ~/.superconductor/bin` and verify write permission
    - [ ] Document `SUPERCONDUCTOR_HOME` env var in `superconductor/workflow.md`
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 0.5: Tool Capability Registry

- [ ] Task: Write failing tests for Tool Capability Registry lifecycle [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `SUPERCONDUCTOR_HOME` defaults to `~/.superconductor/` when env var not set
    - [ ] Test: `SUPERCONDUCTOR_HOME` env var overrides default (CI / enterprise path)
    - [ ] Test: no registry file → `setupRegistry()` creates `~/.superconductor/` + writes `tool-registry.json`
    - [ ] Test: valid registry → quick-verify passes, setup skipped, completes in <1s
    - [ ] Test: registered binary deleted → self-heal detects failure, finds alternative, updates registry
    - [ ] Test: all alternatives exhausted → capability status `unavailable`, pipeline continues
    - [ ] Test: registry `verified_at` >7 days → re-verification triggered
    - [ ] Test: `--reset-registry` flag → registry deleted, full setup re-runs
    - [ ] Test: `--setup-only` flag → registry written, pipeline does NOT run
    - [ ] Test: `git-log-raw` fallback → coupling slot resolved with zero external tools
    - [ ] Test: two different projects share same `~/.superconductor/tool-registry.json` (harness-agnostic)
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/tool-registry.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] `getSuperconductorHome(): string` — reads `SUPERCONDUCTOR_HOME` env var, falls back to `~/.superconductor/`
    - [ ] `ensureHomeDir(home: string): void` — creates `~/.superconductor/bin/`, `semgrep-rules/`, `trivy-db/` if absent
    - [ ] Define `CAPABILITY_SLOTS` constant with preferred + alternatives + paths relative to home dir
    - [ ] `readRegistry(home): ToolRegistry | null` — reads `$home/tool-registry.json`
    - [ ] `verifyTool(name, path): { ok: boolean, version: string }` — runs `<tool> --version`
    - [ ] `discoverCapability(slot, home): CapabilityEntry` — tries preferred then alternatives in order
    - [ ] `setupRegistry(home): ToolRegistry` — full discovery, writes registry, returns result
    - [ ] `quickVerify(registry, home): ToolRegistry` — verifies each `installed` tool, self-heals on failure
    - [ ] `isStale(registry): boolean` — checks `verified_at` age against 7-day threshold
    - [ ] `resolveRegistry(home, flags): ToolRegistry` — entry point: read → stale check → verify/setup
    - [ ] Print ✅/⚠️/❌ per capability during setup
    - [ ] Print installation guidance + `--reset-registry` reminder for each unavailable capability
    - [ ] `git-log-raw` fallback always populates `coupling` slot — built-in, never unavailable
    - [ ] Registry `superconductor_home` field records resolved home path for debugging
    - [ ] Export from `packages/superconductor-core/src/intelligence/index.ts`
- [ ] Task: Create AGY shim `scripts/tool-registry.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
    - [ ] `import { resolveRegistry } from '@superconductor/core'; resolveRegistry(...process.argv.slice(2));`
- [ ] Task: Implement `--reset-registry` and `--setup-only` flags in core CLI adapter [TIER-1] [AGENT:caduceus-triage]
    - [ ] `npx superconductor setup --reset-registry`: deletes registry, calls `setupRegistry()`
    - [ ] `npx superconductor setup`: calls `resolveRegistry()`, prints summary table, exits 0
- [ ] Task: Download `code-maat.jar` to `$SUPERCONDUCTOR_HOME/bin/` during setup [TIER-1] [AGENT:caduceus-triage]
    - [ ] Download from GitHub releases to `~/.superconductor/bin/code-maat.jar`
    - [ ] Verify JAR executes: `java -jar ~/.superconductor/bin/code-maat.jar --help`
- [ ] Task: Download semgrep local rule bundles to `$SUPERCONDUCTOR_HOME/semgrep-rules/` [TIER-1] [AGENT:caduceus-triage]
    - [ ] Copy/clone community security rules to `~/.superconductor/semgrep-rules/`
    - [ ] Verify semgrep offline: `semgrep scan --config ~/.superconductor/semgrep-rules --dry-run`
- [ ] Task: Pre-cache trivy DB to `$SUPERCONDUCTOR_HOME/trivy-db/` [TIER-1] [AGENT:caduceus-triage]
    - [ ] `trivy image --download-db-only --cache-dir ~/.superconductor/trivy-db`
    - [ ] Verify offline: `trivy fs . --skip-db-update --offline-scan --cache-dir ~/.superconductor/trivy-db`
- [ ] Task: Superconductor - User Manual Verification 'Phase 0.5: Tool Capability Registry' (Protocol in workflow.md)

---

## Phase 1: Preflight & Tool Availability Matrix

- [ ] Task: Write failing tests for tool availability detection [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: all tools available → manifest shows no degraded flags
    - [ ] Test: tokei missing → `01_fingerprint.json` is null, pipeline continues
    - [ ] Test: all optional tools missing → pipeline completes with 5 null files
    - [ ] Test: `lizard` missing but tokei present → manifest `degraded: ["lizard"]`
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/preflight.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Reads Tool Capability Registry from `~/.superconductor/tool-registry.json`
    - [ ] Runs quick-verification on each `installed` tool entry
    - [ ] Prints ✅/⚠️/❌ availability matrix to stdout
    - [ ] Returns structured object: `{ available: string[], degraded: string[], unavailable: string[] }`
    - [ ] Prints install guidance for each unavailable capability
    - [ ] Export from `packages/superconductor-core/src/intelligence/index.ts`
- [ ] Task: Create AGY shim `scripts/intelligence-preflight.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
    - [ ] `import { runPreflight } from '@superconductor/core/intelligence'; runPreflight();`
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Preflight & Tool Availability' (Protocol in workflow.md)

---

## Phase 2: Language Fingerprint + Dependency Graph

- [ ] Task: Write failing tests for tokei fingerprint and dependency graph outputs [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `01_fingerprint.json` contains expected fields (languages, lines, files)
    - [ ] Test: `02_dependencies.json` contains nodes and edges arrays
    - [ ] Test: circular dependency in fixture repo → circular flag in output
    - [ ] Test: non-JS/TS repo → `auto-uml` used as polyglot fallback
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/runners/fingerprint.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Invoke `tokei <target> --output json`
    - [ ] Normalise output to canonical schema: `{ languages: {}, totalLines, totalFiles, primaryLanguage }`
    - [ ] Write to `01_fingerprint.json`
    - [ ] Export from `runners/index.ts`
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/runners/dependency-graph.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Detect primary language from `01_fingerprint.json`
    - [ ] Route to language-specific tool:
        - TS/JS → `dependency-cruiser`: `npx depcruise src -T json`
        - Python → `deptry . --json-output`
        - Go → `go-callvis -format dot ./...` (convert DOT→JSON)
        - Polyglot fallback → `auto-uml --source-code <target> --no-mermaid`
    - [ ] Normalise all outputs to canonical schema: `{ nodes: [], edges: [], circularDeps: [] }`
    - [ ] Write to `02_dependencies.json`
    - [ ] Export from `runners/index.ts`
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Fingerprint + Dependency Graph' (Protocol in workflow.md)

---

## Phase 3: Complexity Hotspot Map + Hotspot Index

- [ ] Task: Write failing tests for complexity output and hotspot index [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `03_complexity.json` contains `hotspot_score` field per file
    - [ ] Test: files sorted descending by `hotspot_score`
    - [ ] Test: hotspot formula: `score = cyclomatic_complexity × log(1 + churn)`
    - [ ] Test: `-w` flag applied — only over-threshold functions in output
    - [ ] Test: top-10 hotspots printed to stdout on pipeline completion
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/runners/complexity.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Invoke `lizard <target> -w -f json` (hotspot-only output)
    - [ ] Parse JSON output, extract file-level aggregates
    - [ ] Read git churn: `git log --all --name-only --format='format:' | sort | uniq -c`
    - [ ] Compute `hotspot_score = cyclomatic_complexity × Math.log(1 + churnCount)`
    - [ ] Sort descending, write `03_complexity.json` with `hotspot_score` field
    - [ ] Print top-10 to stdout with ✅/⚠️/❌ risk ratings
    - [ ] Export from `runners/index.ts`
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Complexity Hotspot Map' (Protocol in workflow.md)

---

## Phase 4: Git Coupling Matrix

- [ ] Task: Write failing tests for git coupling matrix output [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `04_coupling.csv` produced with entity-a, entity-b, coupled columns
    - [ ] Test: fixture repo with known coupling → coupling detected correctly
    - [ ] Test: code-maat missing → `04_coupling.csv` is null, manifest records degraded
    - [ ] Test: raw git fallback (no code-maat JAR) → simplified churn-only CSV
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/runners/coupling.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Read JAR path from tool registry: `$SUPERCONDUCTOR_HOME/bin/code-maat.jar`
    - [ ] Generate git log: `git log --all --numstat --format=format: > /tmp/gitlog.txt`
    - [ ] Invoke code-maat: `java -jar $SUPERCONDUCTOR_HOME/bin/code-maat.jar -l /tmp/gitlog.txt -c git2 -a coupling`
    - [ ] Write output to `04_coupling.csv`
    - [ ] Fallback (no JAR): produce simplified `{ file, churnCount }[]` JSON from raw git log
    - [ ] Export from `runners/index.ts`
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Git Coupling Matrix' (Protocol in workflow.md)

---

## Phase 5: Security Surface

- [ ] Task: Write failing tests for SAST security surface output [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `05_sast.json` contains findings array with severity, file, line fields
    - [ ] Test: semgrep invoked with `--config ./scripts/semgrep-rules` (local only, never auto)
    - [ ] Test: trivy invoked with `--skip-db-update --offline-scan` flags always present
    - [ ] Test: mock invocation log — zero network calls during pipeline run
    - [ ] Test: semgrep missing → `05_sast.json` is null, pipeline continues
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/runners/sast.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Read rules dir from tool registry: `$SUPERCONDUCTOR_HOME/semgrep-rules/`
    - [ ] Invoke: `semgrep scan --config $SUPERCONDUCTOR_HOME/semgrep-rules --json -o 05_sast_semgrep.json`
    - [ ] Guard: if `--config=auto` would be used, abort and log ❌ privacy violation
    - [ ] Read trivy DB from tool registry: `$SUPERCONDUCTOR_HOME/trivy-db/`
    - [ ] Invoke: `trivy fs <target> --format json --skip-db-update --offline-scan --cache-dir $SUPERCONDUCTOR_HOME/trivy-db`
    - [ ] Merge semgrep + trivy outputs into unified `05_sast.json`
    - [ ] Schema: `{ findings: [{ tool, severity, ruleId, file, line, message }] }`
    - [ ] Export from `runners/index.ts`
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Security Surface' (Protocol in workflow.md)

---

## Phase 6: Symbol Extraction + API Surface + TOON Bridge

- [ ] Task: Write failing tests for TSA symbol extraction and TOON bridge [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `06_api_surface.toon` produced by tree-sitter-analyzer
    - [ ] Test: `06_api_surface_summary.md` produced by TOON bridge — one line per symbol
    - [ ] Test: undocumented exported symbol → marked "undocumented" in summary
    - [ ] Test: TSA missing → `06_api_surface.toon` is null, bridge skipped
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/runners/symbol-extraction.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Invoke: `tree-sitter-analyzer search --project-root <target> --output_format toon > 06_api_surface.toon`
    - [ ] Fallback: if TSA missing → use `universal-ctags --output-format=json -R`
    - [ ] Write raw output to `06_api_surface.toon`
    - [ ] Export from `runners/index.ts`
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/runners/toon-summary.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Parse TOON format into structured symbol records
    - [ ] Format each record: `[type] [file]:[line] [name]([params]) — [docstring|"undocumented"]`
    - [ ] Write `06_api_surface_summary.md`
    - [ ] Emit count of undocumented public exports to stdout
    - [ ] Export from `runners/index.ts`
- [ ] Task: Create AGY shim `scripts/toon-to-summary.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Symbol Extraction + API Surface' (Protocol in workflow.md)

---

## Phase 7: Static Test Gap Analyzer

- [ ] Task: Write failing tests for static test gap analysis [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: symbol never imported by any test file → risk "critical" if high churn
    - [ ] Test: symbol imported by test → not in output
    - [ ] Test: idempotency — two runs produce identical `07_test_gaps.json`
    - [ ] Test: empty tests/ directory → all exported symbols flagged as uncovered
    - [ ] Test: symbol in test file but as indirect import → counts as covered
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/runners/test-gaps.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Read `06_api_surface.toon` → extract exported symbols + source files
    - [ ] Scan `tests/`, `test/`, `__tests__/`, `spec/`, `*.test.*`, `*.spec.*` for imports
    - [ ] Build import graph: `{ testFile → Set<importedSourceFiles> }`
    - [ ] Identify source files never appearing in any test's import set
    - [ ] Join with git churn from `04_coupling.csv`
    - [ ] Assign risk: `critical` = uncovered + churn ≥ 5, `high` = uncovered + churn ≥ 2,
          `medium` = uncovered + churn ≥ 1, `low` = uncovered, no churn
    - [ ] Write `07_test_gaps.json`: `{ file, exportedSymbols[], gitChurnScore, riskLevel }`
    - [ ] Export from `runners/index.ts`
- [ ] Task: Create AGY shim `scripts/static-test-gap-analyzer.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Static Test Gap Analyzer' (Protocol in workflow.md)

---

## Phase 8: Pipeline Orchestration, Manifest + Brownfield CLI

- [ ] Task: Write failing tests for pipeline orchestration and manifest [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `00_manifest.json` contains all required fields (tools, versions, timestamp, trackId, degraded)
    - [ ] Test: pipeline completes in <60s on superconductor repo (performance regression test)
    - [ ] Test: `--brownfield --target <fixture>` runs without `tracks.md` present
    - [ ] Test: `--report` flag generates `repository-health-report.md` with all 8 sections
    - [ ] Test: `--skip-sast` flag skips phases 5 entirely, manifest records skip
    - [ ] Test: staleness warning emitted when manifest timestamp < last git commit
- [ ] Task: Implement `packages/superconductor-core/src/intelligence/pipeline.ts` orchestrator [TIER-2] [AGENT:caduceus-processor]
    - [ ] Parse CLI flags: `--brownfield`, `--target`, `--output`, `--skip-sast`, `--report`, `--track`
    - [ ] Run preflight, then phases 1→7 sequentially with elapsed time logging
    - [ ] Write `00_manifest.json` at completion with full run metadata
    - [ ] Emit top-10 hotspots summary to stdout
    - [ ] Handle degraded mode: continue on missing tools, record in manifest
    - [ ] Export `runPipeline()` from `packages/superconductor-core/src/intelligence/index.ts`
    - [ ] Register as `superconductor_run_intelligence` MCP tool in `@superconductor/mcp-server`
    - [ ] Register as `npx superconductor intelligence` in core CLI adapter
- [ ] Task: Create AGY shim `scripts/intelligence-pipeline.ts` (no logic) [TIER-1] [AGENT:caduceus-triage]
    - [ ] `import { runPipeline } from '@superconductor/core/intelligence'; runPipeline(process.argv.slice(2));`
- [ ] Task: Implement `--report` brownfield health report generator [TIER-2] [AGENT:caduceus-processor]
    - [ ] Implement in `packages/superconductor-core/src/intelligence/report.ts`
    - [ ] Read all 7 output files
    - [ ] Generate `repository-health-report.md` with 8 sections:
          Executive Summary, Stack Fingerprint, Dependency Health, Complexity Hotspot Map,
          Security Surface, API Coverage Gaps, Test Coverage Gaps, Recommendations
    - [ ] Recommendations section: top 5 issues ranked by `hotspot_score × severity`
- [ ] Task: Superconductor - User Manual Verification 'Phase 8: Pipeline Orchestration + Brownfield CLI' (Protocol in workflow.md)

---

## Phase 9: Agent Context Protocol + Skill Updates

- [ ] Task: Write failing tests for staleness detection and agent protocol [TIER-1] [AGENT:caduceus-triage]
    - [ ] Test: `00_manifest.json` timestamp before last git commit → staleness warning
    - [ ] Test: `00_manifest.json` timestamp after last git commit → no warning
- [ ] Task: Update `skills/implement/SKILL.md` — producer intelligence layer protocol [TIER-1] [AGENT:caduceus-triage]
    - [ ] Add §: "Before implementing, check `superconductor/intelligence/00_manifest.json`"
    - [ ] If fresh: read `06_api_surface_summary.md` to discover reusable symbols
    - [ ] If stale or absent: proceed with direct file reading
- [ ] Task: Update `skills/new-track/SKILL.md` — planner intelligence layer protocol [TIER-1] [AGENT:caduceus-triage]
    - [ ] Add §: "Before planning, read intelligence JSON to understand existing architecture"
    - [ ] Read `01_fingerprint.json` (stack), `02_dependencies.json` (coupling risks),
          `03_complexity.json` (hotspots to avoid touching)
- [ ] Task: Update `skills/standalone-review/SKILL.md` — reviewer intelligence layer protocol [TIER-1] [AGENT:caduceus-triage]
    - [ ] Add §: "Before reviewing, check intelligence layer for blast-radius context"
    - [ ] Read `02_dependencies.json` — which modules depend on changed code
    - [ ] Read `07_test_gaps.json` — flag changed files with critical/high test gap risk
- [ ] Task: Generate `superconductor/intelligence/README.md` template [TIER-1] [AGENT:caduceus-triage]
    - [ ] Document each output file's schema and agent usage guidance
- [ ] Task: Update `workflow.md` — add post-phase intelligence pipeline hook [TIER-1] [AGENT:caduceus-triage]
    - [ ] After every phase completion step, add: "Run intelligence pipeline hook"
    - [ ] Document greenfield hook invocation command
- [ ] Task: Superconductor - User Manual Verification 'Phase 9: Agent Context Protocol + Skill Updates' (Protocol in workflow.md)

---

## Phase 10: Integration Tests + Full Suite

- [ ] Task: Run intelligence pipeline end-to-end on the superconductor repo itself [TIER-2] [AGENT:caduceus-processor]
    - [ ] Verify all 8 output files produced (7 + manifest)
    - [ ] Verify `hotspot_score` field on every complexity entry
    - [ ] Verify `07_test_gaps.json` shows realistic test coverage gaps
    - [ ] Verify `repository-health-report.md` generated with `--report` flag
    - [ ] Verify pipeline completes in <60 seconds
- [ ] Task: Run brownfield mode on a minimal fixture repository [TIER-2] [AGENT:caduceus-processor]
    - [ ] Create `tests/fixtures/brownfield-repo/` with mixed TS + Python files
    - [ ] Verify `--brownfield --target tests/fixtures/brownfield-repo` runs without `tracks.md`
    - [ ] Verify report generated correctly
- [ ] Task: Run full test suite and confirm zero regressions [TIER-1] [AGENT:caduceus-triage]
- [ ] Task: Integrate track `intelligence_layer_20260723` into main branch [TIER-1] [AGENT:caduceus-triage]
