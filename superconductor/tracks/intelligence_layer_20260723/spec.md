# Spec: Project Intelligence Layer & Brownfield Repository Analysis

## Overview

A privacy-first, fully offline codebase intelligence pipeline that orchestrates
existing static analysis CLI tools to produce a set of structured JSON artifacts.
These artifacts serve two purposes:

1. **Greenfield mode:** A living ecosystem map (`superconductor/intelligence/`)
   refreshed as a post-track hook after every Superconductor track completes.
   All agents (planner, producer, reviewer) read this map instead of raw source
   files, reducing context token load by an estimated 10–15×.

2. **Brownfield mode:** A one-shot analysis of any unknown codebase. Invoked via
   `npx tsx scripts/intelligence-pipeline.ts --brownfield --target <path>`. No
   Superconductor setup required in the target repository. Produces a Repository
   Health Report suitable for stakeholder and developer audiences.

## Research Foundation

- **Tooling:** Gemini Deep Research — Privacy-First Codebase Intelligence Tools
- **Competitive analysis:** Gemini Deep Research — Competitive Landscape Analysis
- **Key finding:** No competitor wires offline deterministic static analysis tools
  into an agent's standard context loop natively. First-mover advantage confirmed.
- **Token economics:** Multi-agent coordination incurs a ~4× orchestration tax;
  60% of agentic cost lives in the refinement loop. Pre-computed JSON artifacts
  eliminate the "understand the codebase" token burn from every agent invocation.

## Tool Stack (All Offline ✅)

| Dimension | Tool | Output | Privacy |
|---|---|---|---|
| Language fingerprint | `tokei` | JSON | ✅ Fully offline |
| Dependency graph | `dependency-cruiser` (JS/TS), `auto-uml` (polyglot) | JSON/DOT | ✅ Fully offline |
| Complexity hotspots | `lizard -w` | JSON | ✅ Fully offline |
| Git coupling matrix | `code-maat` + raw `git log` | CSV | ✅ Fully offline |
| Security surface | `semgrep` (local rules), `trivy` (pre-cached DB) | JSON/SARIF | ✅ / ⚠️ initial download |
| Symbol & API surface | `tree-sitter-analyzer` (TOON format) | TOON/JSON | ✅ Fully offline |
| Test gap analysis | Custom `static-test-gap-analyzer.ts` | JSON | ✅ Fully offline |

> **TOON format:** tree-sitter-analyzer outputs in TOON — a tabular JSON variant
> purpose-built for LLM context windows that is ~50% smaller than standard JSON.

## Functional Requirements

### FR-1: Tool Availability Matrix
- Script `scripts/intelligence-preflight.ts` checks whether each required tool is
  installed and executable
- Reports a per-tool status: ✅ available / ⚠️ missing (degraded mode) / ❌ required
- Required tools: `tokei`, `lizard`, `git`. All others are degraded-mode optional.
- Degraded mode: missing tools produce a `null` output file; pipeline continues
- Prints installation guidance for each missing tool

### FR-2: Core Intelligence Pipeline Script
- Script `scripts/intelligence-pipeline.ts` is the single entry point
- Runs all tools sequentially in the correct dependency order
- Writes all outputs to `<output-dir>/intelligence/` with filenames:
  - `01_fingerprint.json` — tokei language breakdown
  - `02_dependencies.json` — dependency graph (DOT converted to JSON)
  - `03_complexity.json` — lizard hotspot-only output (`-w` flag)
  - `04_coupling.csv` — code-maat temporal coupling matrix
  - `05_sast.json` — semgrep local-rules SAST findings
  - `06_api_surface.toon` — tree-sitter-analyzer TOON output
  - `07_test_gaps.json` — static test gap analysis
  - `00_manifest.json` — pipeline run metadata (tools used, versions, timestamp,
    degraded-mode flags, total elapsed time)
- Each tool invocation logs to stdout with ✅/⚠️/❌ prefix and elapsed time
- Total pipeline target: <60 seconds on a 100k LOC TypeScript codebase

### FR-3: Static Test Gap Analyzer (Ecosystem Gap Filler)
- Script `scripts/static-test-gap-analyzer.ts` fills the one confirmed ecosystem
  gap — no offline CLI tool exists for this
- Algorithm:
  1. Read `06_api_surface.toon` to get all exported symbols + their source file
  2. Scan `tests/`, `test/`, `__tests__/`, `spec/` directories for all import
     statements
  3. Intersection: exported symbols whose source file is never imported by any
     test file → **0% direct unit coverage**
  4. Layer git churn from `04_coupling.csv`: uncovered + high-churn = critical risk
  5. Output `07_test_gaps.json`: `{ file, exportedSymbols[], gitChurnScore,
     riskLevel: "critical"|"high"|"medium"|"low" }`
- Idempotent: produces identical output on repeated runs given the same inputs

### FR-4: Greenfield Post-Track Hook
- `workflow.md` gains a new mandatory step after every phase completion:
  "Run Intelligence Pipeline" — `npx tsx scripts/intelligence-pipeline.ts`
- Output directory defaults to `superconductor/intelligence/` (project root)
- The manifest `00_manifest.json` includes the track ID and phase that triggered
  the run, enabling a timeline of how the ecosystem evolved across tracks
- Agents that read the intelligence layer must check `00_manifest.json` timestamp
  — if the snapshot is older than the last git commit, emit a ⚠️ staleness warning

### FR-5: Brownfield CLI Mode
- Flag `--brownfield` enables standalone analysis of any repository path
- Flag `--target <path>` specifies the repository root (default: `./`)
- Flag `--output <path>` specifies output directory (default: `./<target>/intelligence/`)
- Flag `--skip-sast` skips semgrep and trivy (for air-gapped runs without pre-cached DBs)
- Flag `--report` generates a human-readable `repository-health-report.md` in
  addition to the JSON outputs
- No Superconductor `tracks.md` or `workflow.md` required in the target repo
- Repository Health Report sections:
  - **Executive Summary** (3–5 bullet stakeholder-facing overview)
  - **Stack Fingerprint** (languages, framework signals, LOC breakdown)
  - **Dependency Health** (circular deps count, coupling hotspots)
  - **Complexity Hotspot Map** (top 10 files by complexity × churn score)
  - **Security Surface** (SAST finding count by severity)
  - **API Coverage Gaps** (undocumented public exports)
  - **Test Coverage Gaps** (critical-risk uncovered symbols)
  - **Recommendations** (prioritised remediation list)

### FR-6: Agent Context Protocol
- Standardised `superconductor/intelligence/README.md` generated by the pipeline
  explaining what each output file contains and how agents should read it
- All agents (planner, producer, reviewer) updated in their respective skills to
  check `superconductor/intelligence/00_manifest.json` before reading source files
- If intelligence layer exists and is fresh: agent reads JSON outputs first,
  falls back to source files only for specific function-level detail
- Skill updates required:
  - `skills/implement/SKILL.md` — producer reads `06_api_surface.toon` before
    implementing to discover reusable symbols
  - `skills/new-track/SKILL.md` — planner reads `01_fingerprint.json` +
    `02_dependencies.json` + `03_complexity.json` before planning
  - `skills/standalone-review/SKILL.md` — reviewer reads `02_dependencies.json`
    for blast-radius analysis + `07_test_gaps.json` for coverage risk

### FR-7: TOON-to-Markdown Bridge
- Script `scripts/toon-to-summary.ts` converts `06_api_surface.toon` to a
  compressed markdown summary suitable for agent system prompts
- Output: `06_api_surface_summary.md` — one line per exported symbol:
  `[type] [file]:[line] [name]([params]) — [docstring first line or "undocumented"]`
- This bridge is used when an agent has tight context budget and cannot consume
  raw TOON directly

### FR-8: Hotspot Index Computation
- The pipeline computes a **Hotspot Index** for each file:
  `hotspot_score = cyclomatic_complexity × log(1 + git_churn_count)`
- Output appended to `03_complexity.json` as a `hotspot_score` field per file
- Files sorted descending by `hotspot_score` in the output
- Top-10 hotspots emitted to stdout at pipeline completion with ✅/⚠️/❌ risk rating
- Swarm orchestrator can use `hotspot_score` to route high-risk files to Tier-4
  agents and stable files to Tier-2 (implements the theoretical model routing gain)

## Non-Functional Requirements

- **Privacy:** All tools run fully locally. No code leaves the machine. `semgrep`
  invoked with `--config ./local-rules` only (no `--config=auto` which phones home).
  `trivy` invoked with `--skip-db-update --offline-scan` flags mandatory.
- **Performance:** Full pipeline completes in <60s on 100k LOC. Hotspot-only
  `lizard -w` flag ensures minimal output size. TOON format reduces API surface
  output size by ~50% vs JSON.
- **Graceful degradation:** Pipeline never hard-fails. Missing tools produce null
  outputs and the manifest records the degraded-mode flags.
- **Idempotency:** Running the pipeline twice produces identical outputs for the
  same codebase state.
- **TypeScript-native:** All orchestration scripts are TypeScript (`npx tsx`).
  Shell commands invoked via Node.js `child_process.execSync`. No bash-only scripts.
- **Zero new runtime npm deps:** Only `node:fs`, `node:path`, `node:child_process`,
  `node:os`. The tool binaries are the runtime dependencies.

## Acceptance Criteria

### Pipeline
- [ ] `scripts/intelligence-preflight.ts` runs and reports tool availability matrix
- [ ] `scripts/intelligence-pipeline.ts` produces all 7 output files + manifest
- [ ] Full pipeline completes in <60 seconds on a 100k LOC TypeScript codebase
- [ ] Missing tool produces `null` file + manifest degraded flag — pipeline continues
- [ ] `--brownfield --target <path>` runs on any repository without Superconductor setup
- [ ] `--report` generates a human-readable `repository-health-report.md`

### Test Gap Analyzer
- [ ] `scripts/static-test-gap-analyzer.ts` correctly identifies files with 0 test imports
- [ ] Risk levels assigned correctly: uncovered + high-churn = critical
- [ ] Idempotent: two runs produce identical `07_test_gaps.json`

### Hotspot Index
- [ ] `hotspot_score` field present in `03_complexity.json` for every file
- [ ] Files sorted descending by `hotspot_score`
- [ ] Top-10 hotspots printed to stdout at pipeline completion

### Agent Integration
- [ ] `skills/implement/SKILL.md` updated — producer checks intelligence layer first
- [ ] `skills/new-track/SKILL.md` updated — planner reads intelligence JSON before planning
- [ ] `skills/standalone-review/SKILL.md` updated — reviewer uses intelligence layer for blast-radius
- [ ] Staleness warning emitted if `00_manifest.json` timestamp precedes last git commit

### Privacy
- [ ] `semgrep` never invoked without `--config ./local-rules` (test: mock invocation log)
- [ ] `trivy` never invoked without `--skip-db-update --offline-scan` flags
- [ ] Zero network calls during a pipeline run (verified by intercepting subprocess calls)

### Tests
- [ ] Unit test: pipeline with all tools missing → 7 null files, manifest records all degraded
- [ ] Unit test: hotspot score formula produces correct ordering
- [ ] Unit test: test gap analyzer with mock symbol map and mock test imports
- [ ] Integration test: pipeline runs end-to-end on the superconductor repo itself
- [ ] Integration test: brownfield mode runs on a minimal fixture repository

## Out of Scope
- Building or training tree-sitter grammars (use existing TSA binaries)
- Dynamic test execution (we are static-only for coverage)
- Cloud or SaaS integration of any kind
- Auto-remediation of findings (intelligence layer is read-only output)
- Modifying the target repository in brownfield mode
