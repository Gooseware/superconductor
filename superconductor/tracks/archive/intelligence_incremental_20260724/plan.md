# Implementation Plan: Incremental Intelligence Layer

## Phase 0: Swarm Preflight
- [x] Task: Verify `swarm-orchestrate` skill is installed and loaded. [TIER-2] [AGENT:caduceus-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Scoped Runner Contracts
*Prerequisite for all other phases. All 6 runners gain a `scopedFiles` param without breaking existing call signatures.*

- [x] Task: Update `runComplexity` signature to accept `scopedFiles?: string[]`. [TIER-3:TCS=6] [AGENT:caduceus-processor]
    - [ ] When `scopedFiles` provided: run `lizard <file>` for each file individually, merge results, skip git churn re-computation (churn is append-only)
    - [ ] When `scopedFiles` is empty/undefined: existing full-scan behaviour unchanged
    - [ ] Update return type to include `{ entries: ComplexityEntry[], status }` for merge compatibility
- [x] Task: Update `runDependencyGraph` to accept `scopedFiles?: string[]`. [TIER-3:TCS=7] [AGENT:caduceus-processor]
    - [ ] When scoped: run `depcruise <file>` for each, collect nodes + edges, return only the subgraph for those files
    - [ ] Existing full-scan unchanged
- [x] Task: Update `runSast`, `runSymbolExtraction`, `runTestGaps`, `runPackageSurface` to accept `scopedFiles?: string[]`. [TIER-3:TCS=5] [AGENT:caduceus-processor]
    - [ ] `runSast`: pass `--include <file>` flag to semgrep for each changed file
    - [ ] `runSymbolExtraction`: scope `ctags`/`tree-sitter` to provided files
    - [ ] `runTestGaps`: limit FS walk to `scopedFiles` and their test counterparts
    - [ ] `runPackageSurface`: limit import analysis to `scopedFiles`
- [x] Task: Write unit tests for all 6 scoped runner variants. [TIER-3:TCS=5] [AGENT:caduceus-processor]
    - [ ] Test: scoped run with 1 file → output contains only that file's entry
    - [ ] Test: scoped run with empty array → same as full scan (backward compat)
    - [ ] Test: scoped run with non-existent file → degrades gracefully, no throw
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Scoped Runner Contracts' (Protocol in workflow.md)

## Phase 2: Incremental Updater Core
- [x] Task: Implement `mergeIntoJson<T extends { file: string }>` in `packages/superconductor-core/src/intelligence/incremental-updater.ts`. [TIER-3:TCS=7] [AGENT:caduceus-processor]
    - [ ] Read existing JSON array from `outputFile` (returns `[]` if file missing or malformed)
    - [ ] Filter out entries where `entry.file` matches any file in `newEntries`
    - [ ] Append `newEntries`, sort by `hotspot_score` desc (for consistency)
    - [ ] Write atomically: write to `<file>.tmp`, then `fs.renameSync` → crash-safe
- [x] Task: Implement `IncrementalIntelligenceUpdater.update()`. [TIER-4:TCS=11] [AGENT:caduceus-oracle]
    - [ ] Accept: `{ projectRoot, changedFiles: string[], outputDir }`
    - [ ] Determine affected phases using invalidation map (see spec)
    - [ ] If no existing snapshot (`00_manifest.json` missing) → call `runPipeline([], projectRoot, outputDir)` (full scan) and return
    - [ ] For each affected phase: call scoped runner → merge results via `mergeIntoJson`
    - [ ] Always update coupling incrementally: `git log ${manifest.lastCommitSha}..HEAD --name-only`
    - [ ] Update `00_manifest.json`: set `lastCommitSha = HEAD`, increment `incrementalRuns`
    - [ ] If `incrementalRuns >= 50`: call `runPipeline` (full rescan) and reset counter
    - [ ] Return `UpdateReport: { phasesRun, filesUpdated, durationMs, snapshotSha }`
- [x] Task: Write unit tests for `IncrementalIntelligenceUpdater`. [TIER-3:TCS=8] [AGENT:caduceus-processor]
    - [ ] Test: `.ts` file changed → complexity, dep-graph, test-gaps, sast, symbol, package-surface phases run; fingerprint and coupling (full) do NOT run
    - [ ] Test: `.test.ts` file changed → only test-gaps phase runs
    - [ ] Test: `package.json` changed → fingerprint + dep-graph run
    - [ ] Test: no existing snapshot → triggers full scan
    - [ ] Test: `incrementalRuns >= 50` → triggers full scan and resets counter
    - [ ] Test: `mergeIntoJson` atomicity — simulate SIGKILL mid-write, verify original file intact
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Incremental Updater Core' (Protocol in workflow.md)

## Phase 3: Git Hook & CLI Wrapper
- [x] Task: Implement `packages/superconductor-core/src/intelligence/cli-update.ts` — thin CLI wrapper. [TIER-3:TCS=5] [AGENT:caduceus-processor]
    - [ ] Parse `process.argv` as a list of changed file paths
    - [ ] Resolve `projectRoot` via `git rev-parse --show-toplevel`
    - [ ] Resolve `outputDir` via `getSuperconductorHome()`
    - [ ] Call `IncrementalIntelligenceUpdater.update()`, log `UpdateReport` to stderr (not stdout — doesn't interfere with git output)
    - [ ] Build as `dist/intelligence/cli-update.js` via existing tsup/tsc build config
- [x] Task: Create `scripts/install-git-hook.sh`. [TIER-3:TCS=4] [AGENT:caduceus-processor]
    - [ ] Write `.git/hooks/post-commit` with content from spec FR-2
    - [ ] `chmod +x .git/hooks/post-commit`
    - [ ] Check if a hook already exists — if so, append superconductor block rather than overwriting
    - [ ] Make the script idempotent (re-running does not duplicate the hook block)
- [x] Task: Update `skills/setup/SKILL.md §2.7` to call `scripts/install-git-hook.sh` after worktrunk install. [TIER-3:TCS=5] [AGENT:caduceus-processor]
    - [ ] Add step: "Run `./scripts/install-git-hook.sh` to install incremental intelligence hook"
    - [ ] Add step: "Run full intelligence scan: trigger `superconductor_run_intelligence` MCP tool"
    - [ ] Surface the resulting snapshot age to user: `"✅ Intelligence baseline established (X files, Y ms)"`
- [x] Task: Write integration test for git hook install + incremental update cycle. [TIER-3:TCS=6] [AGENT:caduceus-processor]
    - [ ] Set up temp git repo with 2 source files
    - [ ] Run full scan
    - [ ] Modify 1 file, commit
    - [ ] Simulate hook execution (call cli-update.js directly)
    - [ ] Verify only the modified file's entries changed in the JSON outputs
    - [ ] Verify `lastCommitSha` updated in `00_manifest.json`
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Git Hook & CLI Wrapper' (Protocol in workflow.md)

## Phase 4: Universal Skill Integration
*Pair-coded: Coder writes the integration, Reviewer verifies the degradation banner and no-throw contract.*

- [x] Task: Integrate `IntelligenceSnapshotReader` into `skills/implement/SKILL.md`. [TIER-4:TCS=9] [AGENT:caduceus-oracle]
    - [ ] Add §0.5 "Intelligence Preflight" before Phase 0: load snapshot, emit degradation banner
    - [ ] If snapshot is stale (> 24h or > 10 commits behind current HEAD), trigger `cli-update.js` for `git diff --name-only HEAD~10..HEAD` before proceeding
- [x] Task: Integrate into `skills/swarm-orchestrate/SKILL.md §1.1`. [TIER-4:TCS=9] [AGENT:caduceus-oracle]
    - [ ] Before Wave 1 dispatch: load `RepoContext`, emit banner
    - [ ] Pass `RepoContext` to `SwarmBlueprintGenerator` for TCS scoring (from `swarm_planner_20260724` track)
- [x] Task: Integrate into `skills/standalone-review/SKILL.md`. [TIER-3:TCS=7] [AGENT:caduceus-processor]
    - [ ] Load snapshot; inject `crossCuttingRisk` signal (SAST findings for changed files) into security reviewer context prompt
- [x] Task: Integrate into `skills/coding-agent/SKILL.md` — Surgical Context Block. [TIER-4:TCS=12] [AGENT:caduceus-oracle]
    - [ ] Before each task: extract touched file paths from task description
    - [ ] Look up each file in `hotspotMap`, `testGapMap`, `sastFindings` from `RepoContext`
    - [ ] Build and inject the Surgical Context Block (format from spec FR-5) into the task prompt prefix
    - [ ] If file not found in snapshot: omit that signal (no placeholder text)
- [x] Task: Integrate into `skills/new-track/SKILL.md` — Architecture Committee + Plan phases. [TIER-3:TCS=7] [AGENT:caduceus-processor]
    - [ ] §2.0.5 Architecture Committee: pass snapshot data to Dreamer and Reviewer roles as context
    - [ ] §2.3 Plan generation: pass `RepoContext` to `SwarmBlueprintGenerator.annotatePlan()`
- [x] Task: Write integration tests verifying degradation banner output for all 3 snapshot states. [TIER-3:TCS=5] [AGENT:caduceus-processor]
    - [ ] Test: LIVE state → correct banner with age + SHA
    - [ ] Test: STALE state → correct banner with commit-behind count
    - [ ] Test: NONE state → correct banner + heuristic fallback activated
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Universal Skill Integration' (Protocol in workflow.md)

## Phase 5: Observability & Drift Rescan
- [x] Task: Implement `IntelligenceDriftMonitor` in `packages/superconductor-core/src/intelligence/drift-monitor.ts`. [TIER-3:TCS=6] [AGENT:caduceus-processor]
    - [ ] `checkDrift(manifest: Manifest, projectRoot: string): DriftReport`
        - Compute `commitsBehind`: `git rev-list --count ${manifest.lastCommitSha}..HEAD`
        - Compute `snapshotAgeMs`: `Date.now() - manifest.timestamp`
        - Returns `{ isDrifted: boolean, commitsBehind, snapshotAgeMs, recommendFullRescan: boolean }`
        - `recommendFullRescan` = true when `commitsBehind > 50` OR `snapshotAgeMs > 7 * 24h` OR `incrementalRuns >= 50`
    - [ ] `formatBanner(report: DriftReport): string` — produces the 3-state banner from spec FR-6
- [x] Task: Add `DriftMonitor` call to `IntelligenceSnapshotReader.load()` — compute and attach drift state to returned `RepoContext`. [TIER-3:TCS=5] [AGENT:caduceus-processor]
- [x] Task: Write unit tests for `DriftMonitor`. [TIER-3:TCS=4] [AGENT:caduceus-processor]
    - [ ] Test: 0 commits behind, recent snapshot → LIVE
    - [ ] Test: 15 commits behind → STALE
    - [ ] Test: `incrementalRuns=50` → `recommendFullRescan=true`
    - [ ] Test: all 3 banner formats render correctly
- [x] Task: Superconductor - User Manual Verification 'Phase 5: Observability & Drift Rescan' (Protocol in workflow.md)

## Phase X: Integration & Finalization
- [x] Task: Integrate track 'intelligence_incremental_20260724' into main branch. [TIER-2] [AGENT:caduceus-processor]
- [x] Task: Verify end-to-end: setup → full scan → commit → hook fires → incremental update → new-track → swarm blueprint uses real TCS. [TIER-4] [AGENT:caduceus-oracle]
- [x] Task: Superconductor - User Manual Verification 'Phase X: Integration & Finalization' (Protocol in workflow.md)

---

## Swarm Blueprint

**Mode:** pipeline (phases are strictly ordered — each phase depends on the previous)
**Max Concurrent Agents:** 4 (runners modify shared JSON files — limit parallelism)
**Oracle Cadence:** every 2 phases (high-complexity file-system operations warrant frequent checks)
**Estimated Track Token Budget:** ~8.4M tokens (~$0.92 blended)

### Wave Schedule

| Wave | Phase | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|---|
| 1 | Phase 1 | 6 scoped runners + tests | Flash×3 | 1.2M | ~7 min |
| 2 | Phase 2 | Merge core + Updater + tests | Pro, Flash | 2.1M | ~12 min |
| 3 | Phase 3 | CLI wrapper + git hook + setup integration | Flash×3 | 1.4M | ~6 min |
| 4 | Phase 4 | 5 skill integrations + tests | Pro×3, Flash×2 | 2.8M | ~18 min |
| 5 | Phase 5 | Drift monitor + banner + tests | Flash×2 | 0.9M | ~4 min |
