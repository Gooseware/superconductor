# Implementation Plan: Project Intelligence Layer & Brownfield Repository Analysis

**Track ID:** `intelligence_layer_20260723`
**Target Branch:** `main`
**Estimated Complexity:** High (but tooling-reduced — orchestration, not parsing)

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify tool environment — check `tokei`, `lizard`, `npx`, `git`,
      `java` (code-maat), `semgrep`, `trivy` are accessible on PATH [TIER-1] [AGENT:caduceus-triage]
    - [ ] Run `which tokei lizard semgrep trivy java` and log results
    - [ ] Confirm `superconductor/intelligence/` directory can be created
    - [ ] Confirm `scripts/` directory is writable
- [ ] Task: Download and verify code-maat JAR for local git coupling analysis [TIER-1] [AGENT:caduceus-triage]
    - [ ] Download `code-maat-1.0.4-standalone.jar` to `scripts/bin/code-maat.jar`
    - [ ] Verify JAR executes: `java -jar scripts/bin/code-maat.jar --help`
- [ ] Task: Download semgrep local rule bundles for SAST offline operation [TIER-1] [AGENT:caduceus-triage]
    - [ ] Clone/copy community security rules to `scripts/semgrep-rules/`
    - [ ] Verify semgrep runs offline: `semgrep scan --config ./scripts/semgrep-rules --dry-run`
- [ ] Task: Pre-cache trivy vulnerability database [TIER-1] [AGENT:caduceus-triage]
    - [ ] `trivy image --download-db-only --cache-dir scripts/trivy-db`
    - [ ] Verify offline operation: `trivy fs . --skip-db-update --offline-scan --cache-dir scripts/trivy-db`
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Preflight & Tool Availability Matrix

- [ ] Task: Write failing tests for tool availability detection [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: all tools available → manifest shows no degraded flags
    - [ ] Test: tokei missing → `01_fingerprint.json` is null, pipeline continues
    - [ ] Test: all optional tools missing → pipeline completes with 5 null files
    - [ ] Test: `lizard` missing but tokei present → manifest `degraded: ["lizard"]`
- [ ] Task: Implement `scripts/intelligence-preflight.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Check each tool via `which`/`command -v` + version invocation
    - [ ] Classify each tool as required/optional
    - [ ] Print ✅/⚠️/❌ availability matrix to stdout
    - [ ] Return structured object: `{ available: string[], missing: string[], degraded: string[] }`
    - [ ] Print install guidance for each missing tool
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Preflight & Tool Availability' (Protocol in workflow.md)

---

## Phase 2: Language Fingerprint + Dependency Graph

- [ ] Task: Write failing tests for tokei fingerprint and dependency graph outputs [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `01_fingerprint.json` contains expected fields (languages, lines, files)
    - [ ] Test: `02_dependencies.json` contains nodes and edges arrays
    - [ ] Test: circular dependency in fixture repo → circular flag in output
    - [ ] Test: non-JS/TS repo → `auto-uml` used as polyglot fallback
- [ ] Task: Implement fingerprint runner (`tokei` integration) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Invoke `tokei <target> --output json`
    - [ ] Normalise output to canonical schema: `{ languages: {}, totalLines, totalFiles, primaryLanguage }`
    - [ ] Write to `01_fingerprint.json`
- [ ] Task: Implement dependency graph runner [TIER-2] [AGENT:caduceus-processor]
    - [ ] Detect primary language from `01_fingerprint.json`
    - [ ] Route to language-specific tool:
        - TS/JS → `dependency-cruiser`: `npx depcruise src -T json`
        - Python → `deptry . --json-output`
        - Go → `go-callvis -format dot ./...` (convert DOT→JSON)
        - Polyglot fallback → `auto-uml --source-code <target> --no-mermaid`
    - [ ] Normalise all outputs to canonical schema: `{ nodes: [], edges: [], circularDeps: [] }`
    - [ ] Write to `02_dependencies.json`
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Fingerprint + Dependency Graph' (Protocol in workflow.md)

---

## Phase 3: Complexity Hotspot Map + Hotspot Index

- [ ] Task: Write failing tests for complexity output and hotspot index [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `03_complexity.json` contains `hotspot_score` field per file
    - [ ] Test: files sorted descending by `hotspot_score`
    - [ ] Test: hotspot formula: `score = cyclomatic_complexity × log(1 + churn)`
    - [ ] Test: `-w` flag applied — only over-threshold functions in output
    - [ ] Test: top-10 hotspots printed to stdout on pipeline completion
- [ ] Task: Implement complexity runner (`lizard` integration) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Invoke `lizard <target> -w -f json` (hotspot-only output)
    - [ ] Parse JSON output, extract file-level aggregates
    - [ ] Write intermediate `03_complexity_raw.json`
- [ ] Task: Implement Hotspot Index computation [TIER-2] [AGENT:caduceus-processor]
    - [ ] Read git churn: `git log --all --name-only --format='format:' | sort | uniq -c`
    - [ ] Parse churn into `{ file: string, churnCount: number }[]`
    - [ ] Join complexity + churn on filename
    - [ ] Compute `hotspot_score = cyclomatic_complexity × Math.log(1 + churnCount)`
    - [ ] Sort descending, write `03_complexity.json` with `hotspot_score` field
    - [ ] Print top-10 to stdout with ✅/⚠️/❌ risk ratings
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Complexity Hotspot Map' (Protocol in workflow.md)

---

## Phase 4: Git Coupling Matrix

- [ ] Task: Write failing tests for git coupling matrix output [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `04_coupling.csv` produced with entity-a, entity-b, coupled columns
    - [ ] Test: fixture repo with known coupling → coupling detected correctly
    - [ ] Test: code-maat missing → `04_coupling.csv` is null, manifest records degraded
    - [ ] Test: raw git fallback (no code-maat JAR) → simplified churn-only CSV
- [ ] Task: Implement git coupling runner (`code-maat` integration) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Generate git log: `git log --all --numstat --format=format: > /tmp/gitlog.txt`
    - [ ] Invoke code-maat: `java -jar scripts/bin/code-maat.jar -l /tmp/gitlog.txt -c git2 -a coupling`
    - [ ] Write output to `04_coupling.csv`
    - [ ] Fallback (no JAR): produce simplified `{ file, churnCount }[]` JSON from raw git log
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Git Coupling Matrix' (Protocol in workflow.md)

---

## Phase 5: Security Surface

- [ ] Task: Write failing tests for SAST security surface output [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `05_sast.json` contains findings array with severity, file, line fields
    - [ ] Test: semgrep invoked with `--config ./scripts/semgrep-rules` (local only, never auto)
    - [ ] Test: trivy invoked with `--skip-db-update --offline-scan` flags always present
    - [ ] Test: mock invocation log — zero network calls during pipeline run
    - [ ] Test: semgrep missing → `05_sast.json` is null, pipeline continues
- [ ] Task: Implement semgrep SAST runner (local rules only) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Verify local rules dir `scripts/semgrep-rules/` exists before invoking
    - [ ] Invoke: `semgrep scan --config ./scripts/semgrep-rules --json -o 05_sast_semgrep.json`
    - [ ] Guard: if `--config=auto` would be used, abort and log ❌ privacy violation
- [ ] Task: Implement trivy SCA runner (offline DB only) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Verify trivy DB cache dir exists before invoking
    - [ ] Invoke: `trivy fs <target> --format json --skip-db-update --offline-scan --cache-dir scripts/trivy-db`
    - [ ] Merge semgrep + trivy outputs into unified `05_sast.json`
    - [ ] Schema: `{ findings: [{ tool, severity, ruleId, file, line, message }] }`
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Security Surface' (Protocol in workflow.md)

---

## Phase 6: Symbol Extraction + API Surface + TOON Bridge

- [ ] Task: Write failing tests for TSA symbol extraction and TOON bridge [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `06_api_surface.toon` produced by tree-sitter-analyzer
    - [ ] Test: `06_api_surface_summary.md` produced by TOON bridge — one line per symbol
    - [ ] Test: undocumented exported symbol → marked "undocumented" in summary
    - [ ] Test: TSA missing → `06_api_surface.toon` is null, bridge skipped
- [ ] Task: Implement TSA runner (`tree-sitter-analyzer` integration) [TIER-2] [AGENT:caduceus-processor]
    - [ ] Invoke: `tree-sitter-analyzer search --project-root <target> --output_format toon > 06_api_surface.toon`
    - [ ] Fallback: if TSA missing → use `universal-ctags --output-format=json -R`
    - [ ] Write raw output to `06_api_surface.toon`
- [ ] Task: Implement `scripts/toon-to-summary.ts` TOON bridge [TIER-2] [AGENT:caduceus-processor]
    - [ ] Parse TOON format into structured symbol records
    - [ ] Format each record: `[type] [file]:[line] [name]([params]) — [docstring|"undocumented"]`
    - [ ] Write `06_api_surface_summary.md`
    - [ ] Emit count of undocumented public exports to stdout
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Symbol Extraction + API Surface' (Protocol in workflow.md)

---

## Phase 7: Static Test Gap Analyzer

- [ ] Task: Write failing tests for static test gap analysis [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: symbol never imported by any test file → risk "critical" if high churn
    - [ ] Test: symbol imported by test → not in output
    - [ ] Test: idempotency — two runs produce identical `07_test_gaps.json`
    - [ ] Test: empty tests/ directory → all exported symbols flagged as uncovered
    - [ ] Test: symbol in test file but as indirect import → counts as covered
- [ ] Task: Implement `scripts/static-test-gap-analyzer.ts` [TIER-2] [AGENT:caduceus-processor]
    - [ ] Read `06_api_surface.toon` → extract exported symbols + source files
    - [ ] Scan `tests/`, `test/`, `__tests__/`, `spec/`, `*.test.*`, `*.spec.*` for imports
    - [ ] Build import graph: `{ testFile → Set<importedSourceFiles> }`
    - [ ] Identify source files never appearing in any test's import set
    - [ ] Join with git churn from `04_coupling.csv`
    - [ ] Assign risk: `critical` = uncovered + churn ≥ 5, `high` = uncovered + churn ≥ 2,
          `medium` = uncovered + churn ≥ 1, `low` = uncovered, no churn
    - [ ] Write `07_test_gaps.json`: `{ file, exportedSymbols[], gitChurnScore, riskLevel }`
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
- [ ] Task: Implement `scripts/intelligence-pipeline.ts` orchestrator [TIER-2] [AGENT:caduceus-processor]
    - [ ] Parse CLI flags: `--brownfield`, `--target`, `--output`, `--skip-sast`, `--report`, `--track`
    - [ ] Run preflight, then phases 1→7 sequentially with elapsed time logging
    - [ ] Write `00_manifest.json` at completion with full run metadata
    - [ ] Emit top-10 hotspots summary to stdout
    - [ ] Handle degraded mode: continue on missing tools, record in manifest
- [ ] Task: Implement `--report` brownfield health report generator [TIER-2] [AGENT:caduceus-processor]
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
