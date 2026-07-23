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


