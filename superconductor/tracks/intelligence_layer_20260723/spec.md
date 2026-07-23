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

Each pipeline **capability slot** has a preferred tool and an ordered list of
alternatives. The Tool Capability Registry (FR-0) records which tool is currently
installed for each slot and routes the pipeline accordingly.

| Capability Slot | Preferred | Alternatives (in order) | Output | Privacy |
|---|---|---|---|---|
| `fingerprint` | `tokei` | `scc`, `cloc` | JSON | ✅ |
| `dependency_graph` | `dependency-cruiser` | `auto-uml`, `madge`, `deptry` | JSON/DOT | ✅ |
| `complexity` | `lizard` | `radon`, `scc` | JSON | ✅ |
| `coupling` | `code-maat` | `git-log-raw` (built-in fallback) | CSV/JSON | ✅ |
| `sast` | `semgrep` | `bandit`, `eslint-plugin-security` | JSON/SARIF | ✅ / ⚠️ |
| `sca` | `trivy` | `grype`, `cargo-audit` | JSON/SARIF | ⚠️ initial DB |
| `symbol_extraction` | `tree-sitter-analyzer` | `universal-ctags`, `pyright` | TOON/JSON | ✅ |
| `test_gaps` | `static-test-gap-analyzer.ts` | *(no alternative — built-in)* | JSON | ✅ |

> **`git-log-raw` fallback:** If `code-maat` JAR is unavailable, the pipeline
> falls back to a raw `git log` shell pipeline that produces a simplified churn
> JSON. Zero external dependencies — always available wherever git is.

> **TOON format:** tree-sitter-analyzer outputs in TOON — a tabular JSON variant
> purpose-built for LLM context windows that is ~50% smaller than standard JSON.

## Functional Requirements

### FR-0: Tool Capability Registry

#### Directory Structure

The system maintains a clean separation between **machine state** and **codebase
analysis artifacts**:

```
~/.superconductor/                     ← machine-level, harness-agnostic
  tool-registry.json                   ← which tools are installed on this machine
  semgrep-rules/                       ← pre-downloaded local SAST rule bundles
  trivy-db/                            ← pre-cached vulnerability database
  bin/
    code-maat.jar                      ← downloaded tool JARs and binaries

<project>/superconductor/intelligence/ ← project-level, codebase-specific
  00_manifest.json                     ← pipeline run metadata
  01_fingerprint.json
  02_dependencies.json
  03_complexity.json
  04_coupling.csv
  05_sast.json
  06_api_surface.toon
  06_api_surface_summary.md
  07_test_gaps.json
  README.md                            ← agent reading guide (auto-generated)
  repository-health-report.md          ← brownfield mode only
```

**Why this split matters:**
- `~/.superconductor/` is shared across all projects on the machine and all harnesses
  (AGY, Claude Desktop, OpenCode, VSCode extensions, CI runners)
- `superconductor/intelligence/` is project-specific and committed to git so agents
  and teammates can read the latest codebase snapshot without re-running the pipeline
- Downloaded rule bundles and vulnerability DBs are fetched once, used everywhere
- No tool re-discovery when switching between projects

**`SUPERCONDUCTOR_HOME` override:**
The home directory location can be overridden via environment variable:
```bash
export SUPERCONDUCTOR_HOME=/shared/network/superconductor  # CI / enterprise
export SUPERCONDUCTOR_HOME=/opt/superconductor             # system-wide shared
```
Default: `~/.superconductor/` (`os.homedir() + '/.superconductor'`)

#### Registry Schema
File: `$SUPERCONDUCTOR_HOME/tool-registry.json`

```json
{
  "schema_version": "1",
  "generated_at": "<ISO-8601>",
  "verified_at": "<ISO-8601>",
  "superconductor_home": "/home/user/.superconductor",
  "capabilities": {
    "fingerprint": {
      "preferred": "tokei",
      "alternatives": ["scc", "cloc"],
      "installed": "tokei",
      "version": "12.1.2",
      "path": "/usr/bin/tokei",
      "status": "ok"
    },
    "dependency_graph": { "...": "..." },
    "complexity":       { "...": "..." },
    "coupling":         {
      "preferred": "code-maat",
      "path": "$SUPERCONDUCTOR_HOME/bin/code-maat.jar",
      "status": "ok"
    },
    "sast":             {
      "preferred": "semgrep",
      "rules_dir": "$SUPERCONDUCTOR_HOME/semgrep-rules",
      "status": "ok"
    },
    "sca":              {
      "preferred": "trivy",
      "db_cache": "$SUPERCONDUCTOR_HOME/trivy-db",
      "status": "ok"
    },
    "symbol_extraction":{ "...": "..." },
    "test_gaps":        { "installed": "built-in", "status": "ok" }
  },
  "overall_status": "ok"
}
```

`status` per capability: `"ok"` | `"degraded"` (alternative in use) | `"unavailable"`

`overall_status`:
- `"ok"` — all preferred tools installed
- `"degraded"` — at least one slot using an alternative
- `"minimal"` — at least one slot fully unavailable (null output)

#### Registry Lifecycle

1. **First run (no registry file):** Full tool setup runs. Registry written to
   `$SUPERCONDUCTOR_HOME/tool-registry.json`. `~/.superconductor/` created if absent.
2. **Subsequent runs (registry exists):** Quick-verify each `installed` tool:
   - Check binary path still exists: `fs.existsSync(path)`
   - Run `<tool> --version` and compare to stored version
   - If verification passes → use stored routing, skip setup
   - If verification fails → trigger **self-healing** for that capability slot
3. **Self-healing flow (capability slot fails verification):**
   - Try each alternative in order: check existence + `--version`
   - First alternative that passes → update registry `installed`/`path`/`version`,
     set `status: "degraded"`, log ⚠️ `[SELF-HEAL] fingerprint: tokei missing → using scc`
   - If all alternatives fail → set `status: "unavailable"`, log ❌, continue pipeline
   - Write updated registry after self-heal
4. **Registry invalidation:** Registry is considered stale if `verified_at` is
   older than 7 days. Stale registry triggers re-verification (not full setup).
5. **`--reset-registry` flag:** Deletes the registry and runs full tool setup.
   Use when tools have been intentionally changed or upgraded.
6. **`--setup-only` flag:** Runs tool setup and writes registry, exits without
   running the pipeline. Suitable for CI bootstrap step.
7. **Harness interoperability:** Any harness (AGY, Claude, OpenCode, CI runner)
   that sets `SUPERCONDUCTOR_HOME` correctly will share the same tool registry,
   avoiding duplicate tool discovery across environments.

#### Installation Guidance
For each unavailable capability, the registry script prints:
```
❌ [fingerprint] tokei not found. Alternatives tried: scc ❌, cloc ❌
   Install: cargo install tokei  OR  brew install tokei  OR  apt install tokei
   Or install any alternative: cargo install scc  |  sudo apt install cloc
   After installing, run: npx tsx scripts/intelligence-pipeline.ts --reset-registry
```

### FR-1: Tool Availability Matrix
- Script `scripts/intelligence-preflight.ts` reads the Tool Capability Registry
  (FR-0) and runs quick-verification on all installed tools
- Reports a per-capability status: ✅ preferred / ⚠️ alternative / ❌ unavailable
- Required capabilities: `fingerprint`, `complexity`, `coupling` (git fallback always
  available). All others are degraded-mode optional.
- Degraded mode: unavailable capabilities produce a `null` output file; pipeline continues
- Prints installation guidance for each unavailable capability

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
- **Graceful degradation:** Pipeline never hard-fails. Unavailable capability slots
  produce null outputs; the registry and manifest both record degraded/unavailable
  status. A `git-log-raw` built-in fallback ensures `coupling` is always computed.
- **Self-healing:** If a registered tool fails verification at runtime, the pipeline
  automatically tries alternatives, updates the registry, and continues. No human
  intervention required for tool substitution.
- **Idempotency:** Running the pipeline twice produces identical outputs for the
  same codebase state. Registry re-verification is non-destructive.
- **TypeScript-native:** All orchestration scripts are TypeScript (`npx tsx`).
  Shell commands invoked via Node.js `child_process.execSync`. No bash-only scripts.
- **Zero new runtime npm deps:** Only `node:fs`, `node:path`, `node:child_process`,
  `node:os`. The tool binaries are the runtime dependencies.

## Acceptance Criteria

### Tool Capability Registry
- [ ] `superconductor/intelligence/.tool-registry.json` created on first run
- [ ] Registry schema matches FR-0 (schema_version, verified_at, capabilities, overall_status)
- [ ] Subsequent run with valid registry: skips setup, uses stored routing in <1s
- [ ] Self-heal: registered tool binary deleted → alternative detected, registry updated, ⚠️ logged
- [ ] Self-heal: all alternatives exhausted → capability `unavailable`, ❌ logged, pipeline continues
- [ ] `--reset-registry` flag: deletes registry, triggers full tool setup
- [ ] `--setup-only` flag: writes registry, exits without running pipeline
- [ ] Stale registry (>7 days): re-verification triggered automatically
- [ ] Installation guidance printed for every unavailable capability
- [ ] `git-log-raw` fallback always resolves coupling slot even without code-maat JAR

### Pipeline
- [ ] `scripts/intelligence-preflight.ts` reads registry and reports per-capability status
- [ ] `scripts/intelligence-pipeline.ts` produces all 7 output files + manifest
- [ ] Full pipeline completes in <60 seconds on a 100k LOC TypeScript codebase
- [ ] Unavailable capability produces `null` file + manifest degraded flag — pipeline continues
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
- [ ] Unit test: registry missing → full setup runs, registry written
- [ ] Unit test: registered binary deleted → self-heal finds alternative, updates registry
- [ ] Unit test: all alternatives unavailable → capability status `unavailable`, pipeline continues
- [ ] Unit test: registry >7 days old → re-verification triggered
- [ ] Unit test: pipeline with all optional tools missing → 5 null files, manifest records degraded
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
