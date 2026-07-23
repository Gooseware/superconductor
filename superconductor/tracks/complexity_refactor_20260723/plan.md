# Track: Complexity Refactor — Hotspot Files
**Track ID:** `complexity_refactor_20260723`
**Status:** 🔄 In Progress
**Priority:** High — Top 5 hotspots from intelligence layer CCN analysis

---

## Context

Intelligence pipeline (Phase 3: lizard) identified 5 files with cyclomatic complexity > 19.

| File | CCN | Churn | Score | Tests? | Risk |
|---|---|---|---|---|---|
| `superconductor-mcp-server/src/index.ts` | 27 | 6 | 52.5 | ❌ None | Medium |
| `intelligence/runners/sast.ts` | 36 | 2 | 39.6 | ❌ None | Medium |
| `review/aggregate-coverage.ts` | 21 | 4 | 33.8 | ✅ Good | Low |
| `review/aggregate-findings.ts` | 19 | 4 | 30.6 | ✅ Good | Low |
| `review/deterministic-preflight.ts` | 27 | 1 | 18.7 | ❌ None | Medium |

**Target:** All 5 files at CCN ≤ 10 per function after refactor.

---

## Acceptance Criteria

- [ ] `runSast` split into `runSemgrepScan`, `parseSemgrepOutput`, `runTrivyScan`, `parseTrivyOutput`; max CCN ≤ 10
- [ ] `aggregateCoverageManifests` split into `resolveCoverageManifest`, `normalizeCoverageEntry`, `aggregateManifestStats`; existing tests pass
- [ ] `aggregateFindings` split into `extractReviewerFindings`, `deduplicateFindings`; existing tests pass
- [ ] `runDeterministicPreflight` split into `detectProjectLanguage`, `getDiagnosticCommand`, `executeDiagnosticCommand`; CCN ≤ 10
- [ ] MCP handler refactored into `validateProjectRoot`, `handleGetTrackStatus`, `handleRunReview`, `routeToolCall`; CCN ≤ 10
- [ ] Tests written for sast.ts covering `parseSemgrepOutput`, `parseTrivyOutput`, `runSast` (mocked)
- [ ] Tests written for `detectProjectLanguage`, `getDiagnosticCommand`
- [ ] All 171+ engine tests pass: `npm test` in `packages/engine`
- [ ] `npm run build` succeeds in both packages with zero TypeScript errors
- [ ] Re-run intelligence: all refactored functions have CCN ≤ 10 in new `03_complexity.json`

---

## Phase 1 — Agent A: Low-risk review files (tests already exist)

### Task 1.1 — aggregate-coverage.ts (CCN 21 → ≤7)
File: `packages/superconductor-core/src/review/aggregate-coverage.ts`

Extract from `aggregateCoverageManifests`:
- `resolveCoverageManifest(item, manifestsDir?)` — 3-tier fallback (lines 34–71, ~38 lines)
- `normalizeCoverageEntry(entry)` — string vs object normalizer (lines 90–95, ~6 lines)
- `aggregateManifestStats(manifests)` — dedup + stats loop (lines 83–102, ~20 lines)

`aggregateCoverageManifests` becomes an orchestrator calling these 3.
Verify: `npm test` in packages/superconductor-core — all pass.

### Task 1.2 — aggregate-findings.ts (CCN 19 → ≤6)
File: `packages/superconductor-core/src/review/aggregate-findings.ts`

Extract from `aggregateFindings`:
- `extractReviewerFindings(item, manifestsDir?)` — 3-tier resolution + schema guard (lines 43–96, ~54 lines)
- `deduplicateFindings(findings)` — consensus dedup loop (lines 102–120, ~19 lines)

`isLineRangeClose` already standalone at lines 125–134 — no change needed.
Verify: `npm test` in packages/superconductor-core — all pass.

---

## Phase 2 — Agent B: sast.ts (write tests first, then refactor)

### Task 2.1 — Write tests for sast.ts
Create: `packages/superconductor-core/tests/sast.test.ts`
- Mock `child_process.execSync` with `vi.mock`
- Test `parseSemgrepOutput`: empty results, severity mapping (ERROR→critical, WARNING→high, INFO→medium), missing fields
- Test `parseTrivyOutput`: multiple Results, CVSS severity, missing Vulnerabilities
- Test `runSast`: degraded when both capabilities unavailable, ok with mock semgrep findings

### Task 2.2 — Refactor sast.ts (CCN 36 → ≤8 per function)
File: `packages/superconductor-core/src/intelligence/runners/sast.ts`

Extract 4 functions:
- `parseSemgrepOutput(jsonStr)` — consolidates duplicated mapping from try + catch blocks (~12 lines)
- `runSemgrepScan(projectRoot, capability)` — semgrep CLI + error.stdout fallback (lines 21–60, ~40 lines)
- `parseTrivyOutput(jsonStr)` — nested Results/Vulnerabilities iteration (~16 lines)
- `runTrivyScan(projectRoot, scaCapability)` — trivy CLI + error.stdout fallback (lines 62–93, ~32 lines)

`runSast` becomes: capability check → run scanners → merge findings → write JSON → return status.
Verify: all new sast tests pass.

---

## Phase 3 — Agent C: deterministic-preflight.ts + mcp-server/index.ts

### Task 3.1 — Write tests for deterministic-preflight.ts
Create: `packages/superconductor-core/tests/deterministic-preflight.test.ts`
- `detectProjectLanguage`: TypeScript from tech-stack.md, Python from pyproject.toml, unknown fallback
- `getDiagnosticCommand`: tsc for TypeScript, undefined for unknown

### Task 3.2 — Refactor deterministic-preflight.ts (CCN 27 → ≤8)
File: `packages/superconductor-core/src/review/deterministic-preflight.ts`

Extract 3 functions:
- `detectProjectLanguage(projectDir)` — tech-stack.md parsing + root file heuristics (lines 13–38, ~26 lines)
- `getDiagnosticCommand(lang)` — language-to-CLI map (lines 40–45, ~6 lines)
- `executeDiagnosticCommand(command, projectDir)` — execSync + error output parsing (lines 54–75, ~22 lines)

### Task 3.3 — Refactor mcp-server/index.ts (CCN 27 → ≤8)
File: `packages/superconductor-mcp-server/src/index.ts`

Extract from the `setRequestHandler` callback:
- `validateProjectRoot(rawRoot?)` — realpath containment check (lines 44–60, ~17 lines)
- `handleGetTrackStatus(projectRoot, args)` — single track vs registry (lines 75–99, ~25 lines)
- `handleRunReview(projectRoot, args)` — review flags + preflight (lines 121–152, ~32 lines)
- Replace switch with a typed handler dispatch map

---

## Phase 4 — Verify & measure (all agents)

- [ ] `npm test` in `packages/engine` — 171+ passing, 0 failing
- [ ] `npm test` in `packages/superconductor-core` — all tests pass including new ones
- [ ] `npm run build` in both packages — zero errors
- [ ] Re-run: `node packages/superconductor-core/dist/cli/index.js intelligence --skip-sast`
- [ ] Confirm new `superconductor/intelligence/03_complexity.json`: refactored functions CCN ≤ 10

---

## Swarm Assignment

| Agent | Scope | Workspace |
|---|---|---|
| A | Phase 1: aggregate-coverage + aggregate-findings | branch |
| B | Phase 2: sast.ts tests + refactor | branch |
| C | Phase 3: deterministic-preflight + mcp-server | branch |
