# Specification: Incremental Intelligence Layer — Always-Current, Basically-Free Repo Awareness

## Problem Statement

The intelligence pipeline currently runs **once, when explicitly triggered** via the `superconductor_run_intelligence` MCP tool. No skill reads from it. No git hook updates it. The data produced by the 8-phase scan (complexity, dependency graph, SAST, test gaps, coupling, etc.) is orphaned — written to disk and never consulted.

A full pipeline scan costs **60–200 seconds** on a medium repository. This makes "run it often" impractical. The result: every plan is generated blind, every swarm blueprint uses keyword heuristics instead of real repo data.

The goal of this track is to make repository intelligence **always current and effectively free** through three complementary mechanisms:

1. **Incremental Update Engine** — re-scans only the files changed since the last snapshot, merging results atomically. Cost: ~3–5 seconds per commit.
2. **Git Post-Commit Hook** — automatically triggers incremental updates after every commit. Zero user intervention.
3. **Universal Skill Integration** — every Superconductor skill that benefits from repo context loads the snapshot at startup, with a graceful degradation banner when none exists.

---

## Research Notes

- **LSP incremental model:** Language servers (e.g. TypeScript LS) invalidate only the files whose AST changes on save. The same pattern applies here — each intelligence phase produces file-keyed JSON arrays that can be surgically updated.
- **`lizard` supports single-file mode:** `lizard <file>` produces the same output format as a full scan, enabling per-file re-analysis in ~50ms.
- **`semgrep` supports `--include`:** Scoping SAST to changed files reduces runtime from 60s to <2s for typical commits.
- **`depcruise` supports focused targets:** Running `depcruise <file>` outputs the dependency graph for that file's import closure, not the whole repo.
- **`git log PREV_SHA..HEAD --name-only`**: The coupling/churn phase only needs to process commits since the last run — `O(new commits)` not `O(all history)`.
- **Atomic merge pattern:** Read JSON → filter out entries for changed files → append new entries → write with `fs.writeFileSync` (atomic on Linux). No corruption risk.

---

## Phase-to-File Invalidation Map

When files change, only the relevant phases need re-running:

| Changed File Type | Phases to Invalidate |
|---|---|
| Any `.ts` / `.js` source file | complexity, dependency-graph, symbol-extraction, test-gaps, package-surface, sast |
| Any `.test.ts` / `.spec.ts` | test-gaps only |
| `package.json` | fingerprint, dependency-graph |
| Any commit (always) | coupling (git churn — incremental log since last SHA) |
| `.semgrepignore`, semgrep config | sast |

---

## Functional Requirements

### FR-1: `IncrementalIntelligenceUpdater`
A new module in `packages/superconductor-core/src/intelligence/incremental-updater.ts`:

- `update(projectRoot: string, changedFiles: string[], outputDir: string): UpdateReport`
  - Determines which phases are affected using the invalidation map
  - Runs only those phase runners, scoped to `changedFiles`
  - Merges results into existing JSON files atomically (read → diff → merge → write)
  - Returns an `UpdateReport`: `{ phasesRun, filesUpdated, durationMs, snapshotSha }`
- `mergeIntoJson<T extends { file: string }>(outputFile: string, newEntries: T[]): void`
  - Reads existing array, removes entries where `entry.file` matches any in `newEntries`, appends `newEntries`, writes atomically
- Each phase runner must be updated to accept an optional `scopedFiles?: string[]` parameter that limits analysis to those files

### FR-2: Git Post-Commit Hook Installer
`scripts/install-git-hook.sh` — installed during `/superconductor:setup §2.7`:

```bash
#!/usr/bin/env bash
# .git/hooks/post-commit
CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only $(git hash-object -t tree /dev/null) HEAD)
if [ -z "$CHANGED" ]; then exit 0; fi
node "$(git rev-parse --show-toplevel)/packages/superconductor-core/dist/intelligence/cli-update.js" $CHANGED &
# Runs in background — zero blocking latency for the developer
```

- `cli-update.js` is a thin CLI wrapper around `IncrementalIntelligenceUpdater.update()`
- The hook runs **in background** (`&`) — commit latency is 0ms to the developer
- On first run (no existing snapshot), falls back to a full pipeline scan

### FR-3: Snapshot SHA Tracking
`00_manifest.json` gains two new fields:
- `lastCommitSha: string` — the HEAD SHA at the time of the last update, used by `coupling` to compute `git log LAST_SHA..HEAD`
- `incrementalRuns: number` — count of incremental updates since the last full scan

After `incrementalRuns >= 50`, trigger a background full rescan to catch any drift (coupling scores accumulate, import graphs can diverge from per-file analysis).

### FR-4: Skill Integration Points
The following skills must be updated to load `RepoContext` at startup via `IntelligenceSnapshotReader.load()`:

| Skill | Integration Point | Behaviour |
|---|---|---|
| `setup/SKILL.md §2.7` | After worktrunk install | Run **full scan** (`runPipeline`), install git hook |
| `new-track/SKILL.md §2.0.5` | Architecture Committee Phase | Load snapshot; surface banner to user |
| `new-track/SKILL.md §2.3` | Plan generation | Pass `RepoContext` to `SwarmBlueprintGenerator` |
| `implement/SKILL.md` | Before Phase 0 | Load snapshot; if stale (> 24h or > 10 commits behind), trigger incremental update |
| `swarm-orchestrate/SKILL.md §1.1` | Before dispatching Wave 1 | Load snapshot; use for TCS scoring |
| `standalone-review/SKILL.md` | Before review dispatch | Load snapshot; feed `crossCuttingRisk` to security reviewer context |
| `coding-agent/SKILL.md` | Before each task | Load snapshot; inject complexity + test-gap context into task prompt |

### FR-5: Coding Agent Context Injection
When `coding-agent` receives a task, if a `RepoContext` is available, inject a **Surgical Context Block** into the task prompt:

```
## Repository Intelligence Context
Files touched by this task:
- src/review/abi.ts: hotspot_score=18.4, cyclomatic_complexity=12, SAST findings: 2
- src/intelligence/pipeline.ts: hotspot_score=6.1, testGap=HIGH (gitChurnScore=24)

Implications:
- abi.ts is a HIGH-complexity hotspot — prefer small, isolated refactors; write tests first
- pipeline.ts has a HIGH test gap with high churn — new logic MUST include unit tests
```

This replaces generic "write good code" guidance with file-specific signals derived from real repo history.

### FR-6: Degradation Banner Standard
All skill integration points must emit one of three standard banners:

```
ℹ️  Intelligence: LIVE (snapshot age: 4m · last commit: abc1234 · 3 incremental runs)
⚠️  Intelligence: STALE (snapshot age: 2d · 47 commits behind · consider running /superconductor:setup)
❌  Intelligence: NONE (keyword heuristics active · run /superconductor:setup for surgical precision)
```

---

## Non-Functional Requirements

- **NFR-1:** Incremental update for a 2–3 file commit must complete in < 10 seconds (measured from hook invocation to JSON write)
- **NFR-2:** The git hook must NEVER block the developer's commit — all work happens in a background process
- **NFR-3:** The merge operation must be crash-safe — if `cli-update.js` is killed mid-write, the existing JSON must remain valid
- **NFR-4:** All 8 phase runners must accept `scopedFiles` without breaking their existing full-scan call signature (backward compatible)
- **NFR-5:** Skills must never throw if the snapshot is missing — they must degrade silently to heuristics

---

## Acceptance Criteria

- [ ] AC-1: `IncrementalIntelligenceUpdater.update(root, ['src/foo.ts'], outputDir)` runs only the complexity, dependency-graph, test-gaps, sast, symbol-extraction, and package-surface phases (not fingerprint or coupling), and updates only the `src/foo.ts` entry in each JSON file
- [ ] AC-2: `mergeIntoJson` correctly replaces old entries for changed files without duplicating or losing entries for unchanged files
- [ ] AC-3: The git post-commit hook is installed by `setup §2.7`, is executable, runs in background, and does not add measurable latency to `git commit`
- [ ] AC-4: After `incrementalRuns >= 50`, the next update triggers a full rescan
- [ ] AC-5: `00_manifest.json` contains `lastCommitSha` and `incrementalRuns` after an incremental update
- [ ] AC-6: All 7 listed skills emit the correct degradation banner based on snapshot state
- [ ] AC-7: `coding-agent` receives the Surgical Context Block for all tasks where touched files appear in the snapshot
- [ ] AC-8: `runComplexity`, `runDependencyGraph`, `runSast`, `runTestGaps`, `runSymbolExtraction`, `runPackageSurface` all accept and correctly scope `scopedFiles?: string[]`
- [ ] AC-9: All new modules have ≥ 90% unit test coverage

---

## Out of Scope

- Real-time (watch-mode) file system watching — git hook is the trigger boundary
- Distributed snapshot sharing across team members (single developer, single machine in v1)
- Intelligence-driven auto-refactoring suggestions (data collection only, not action)
