# Track: Engine Complexity Refactor
**Track ID:** `engine_complexity_refactor_20260723`
**Status:** 🔄 In Progress
**Priority:** High — top engine hotspots from intelligence layer

---

## Context

Intelligence pipeline CCN data on packages/engine/:

| File | CCN | Churn | Score | Tests | Risk |
|---|---|---|---|---|---|
| `dag/validator.ts` | 26 | 3 | 36.0 | ✅ dag.test.ts | Low |
| `dispatcher/dispatcher.ts` | 15 | **9** | 34.5 | ✅ dispatcher.test.ts | Medium |
| `context/builder.ts` | 15 | 7 | 31.2 | ✅ context.test.ts | Low |
| `dag/parser.ts` | 20 | 3 | 27.7 | ✅ dag.test.ts | Low |
| `dispatcher/job-dispatcher.ts` | 10 | 6 | 19.5 | ✅ job-dispatcher.test.ts | Medium |

All files have tests. No test-first phase required.

Bonus: `validator.ts` and `parser.ts` share a duplicated `findLineNumber` helper.
Extract it to `dag/utils.ts` — one shared util, zero duplication.

**Target:** All functions CCN ≤ 10. All 171 existing engine tests still pass.

---

## Acceptance Criteria

- [ ] `validateTaskGraph` split into `checkMissingDependencies`, `detectCycles`, `detectOrphanNodes`; CCN ≤ 5 each
- [ ] `parseYamlDag` split into `parseYamlDocument`, `validateRawTaskNode`; shared `findLineNumber` extracted to `dag/utils.ts`
- [ ] `dag/utils.ts` created with shared `findLineNumber` helper; both validator.ts and parser.ts import from it
- [ ] `buildContext` split into `formatTaskMetadata`, `formatTaskDependencies`, `truncatePromptToBudget`; dedup with `generateDiffPayload`
- [ ] `fetchDynamicTierConfig` extracts `categorizeModelTier` pure helper; `checkToolSurfaceViolations` extracted
- [ ] `dispatchNextJob` split into `generateTrackId`, `setupTrackWorkspace`, `spawnAgentAndSync`
- [ ] All 171 engine tests pass: `npm test` in `packages/engine`
- [ ] `npm run build` succeeds in `packages/engine` with zero TypeScript errors
- [ ] Re-run intelligence: engine hotspots drop out of top-5

---

## Phase 1 — Agent A: DAG files (validator.ts + parser.ts)

Both files share a duplicated `findLineNumber` helper. Do the shared util first.

### Task 1.0 — Create dag/utils.ts
File: `packages/engine/src/dag/utils.ts` (NEW)

```typescript
/**
 * Returns the 1-based line number where the given content appears in yamlText.
 * Returns -1 if not found.
 */
export function findLineNumber(yamlText: string, content: string): number {
  const lines = yamlText.split('\n');
  const idx = lines.findIndex(l => l.includes(content));
  return idx === -1 ? -1 : idx + 1;
}
```

Then update both `validator.ts` and `parser.ts` to remove their local copy and import from `./utils`.

### Task 1.1 — Refactor validator.ts (CCN 26 → ≤5 per function)
File: `packages/engine/src/dag/validator.ts`

`validateTaskGraph` is 103 lines doing 3 distinct algorithms. Extract:

1. `checkMissingDependencies(tasks, yamlText)` — validates all deps exist (~11 lines, lines 23-32)
   - Loops through each task's `dependsOn`, checks if dep exists in task map
   - Returns array of `ValidationError`

2. `detectCycles(tasks, yamlText)` — Kahn's algorithm topological sort (~44 lines, lines 34-77)
   - Builds in-degree map and adjacency list
   - BFS processes in-degree=0 nodes
   - Returns array of `ValidationError` (circular deps if visited < total)

3. `detectOrphanNodes(tasks, yamlText)` — BFS from root nodes (~39 lines, lines 79-117)
   - Identifies tasks with no inbound edges (roots)
   - BFS marks reachable nodes
   - Returns ValidationError for any unreachable task

`validateTaskGraph` becomes:
```typescript
export function validateTaskGraph(tasks, yamlText): ValidationError[] {
  return [
    ...checkMissingDependencies(tasks, yamlText),
    ...detectCycles(tasks, yamlText),
    ...detectOrphanNodes(tasks, yamlText)
  ];
}
```

Verify: `npm test` in packages/engine — dag.test.ts must all pass.

### Task 1.2 — Refactor parser.ts (CCN 20 → ≤7 per function)
File: `packages/engine/src/dag/parser.ts`

`parseYamlDag` is a monolith doing YAML loading + root validation + per-node validation + graph building. Extract:

1. `parseYamlDocument(content)` — safe YAML loading + root schema validation (~17 lines, lines 21-37)
   - Calls `yaml.load(content)`, checks result is object with tasks array
   - Returns parsed doc or throws `ParseError`

2. `validateRawTaskNode(rawTask, index, yamlText)` — per-node field validation + conversion (~37 lines, lines 46-82)
   - Validates id, role enum, tier bounds, dependsOn array
   - Returns `Task` object

3. Remove local `findLineNumber` — now imported from `./utils`

`parseYamlDag` becomes:
```typescript
export function parseYamlDag(content): ParseResult {
  const doc = parseYamlDocument(content);
  const errors: ParseError[] = [];
  const tasks: Task[] = [];
  for (const [i, raw] of doc.tasks.entries()) {
    const result = validateRawTaskNode(raw, i, content);
    if (result.errors) errors.push(...result.errors);
    else tasks.push(result.task);
  }
  if (errors.length) return { success: false, errors };
  return { success: true, graph: validateTaskGraph(tasks, content) };
}
```

Verify: `npm test` in packages/engine — dag.test.ts must all pass.

---

## Phase 2 — Agent B: context/builder.ts

### Task 2.1 — Refactor buildContext (CCN 15 → ≤5 per function)
File: `packages/engine/src/context/builder.ts`

`buildContext` is a 11-branch conditional string builder. Extract:

1. `formatTaskMetadata(task)` — id, name, role, description, constraints, variables formatting (~25 lines, lines 56-76)
   - Returns a partial context string for all task identity/config fields

2. `formatTaskDependencies(task, options?)` — contextFiles + symbolDependencies formatting (~10 lines, lines 78-84)
   - Returns the dependencies section string

3. `truncatePromptToBudget(prompt, maxTokens)` — prompt length budget calculation and truncation (~10 lines, lines 98-106)
   - Estimates token count, truncates if needed with `[truncated]` marker

4. **Dedup**: Lines 87-94 in buildContext contain git diff logic IDENTICAL to `generateDiffPayload`. Replace those lines with a call to `generateDiffPayload(task)`.

`buildContext` becomes: call each helper in sequence, join sections, truncate.

Verify: `npm test` in packages/engine — context.test.ts must all pass.

---

## Phase 3 — Agent C: dispatcher files

### Task 3.1 — Refactor dispatcher.ts (CCN 15 → ≤7)
File: `packages/engine/src/dispatcher/dispatcher.ts`

High churn (9) — be careful to preserve all behavior.

Extract:

1. `categorizeModelTier(model)` — pure function: returns 2, 3, or 4 based on name/description string matching (~12 lines, lines 27-36)
   - The tier2/3/4 regex or string checks
   - Pure: no side effects, easily unit-testable

2. `checkToolSurfaceViolations(toolSurface, requestedTools)` — validates tools against readonly/forbidden surface restrictions (~12 lines, lines 142-152)
   - Returns array of violation strings or empty array

`fetchDynamicTierConfig` and `dispatch` retain remaining logic but at lower CCN since the inner branches are now named functions.

Verify: `npm test` in packages/engine — dispatcher.test.ts must all pass.

### Task 3.2 — Refactor job-dispatcher.ts (CCN 10 → ≤5)
File: `packages/engine/src/dispatcher/job-dispatcher.ts`

`dispatchNextJob` does 6 sequential operations. Extract:

1. `generateTrackId(jobTitle)` — sanitize title (lowercase, alphanumeric, underscores) + append YYYYMMDD timestamp (~10 lines, lines 71-80)
   - Pure function, zero side effects

2. `setupTrackWorkspace(trackId, workerPool, lockManager)` — acquires worker, git checkout `track/${trackId}`, creates track directory (~24 lines, lines 92-115)
   - Returns { workerId, branchName, trackDir }

3. `spawnAgentAndSync(trackId, trackDir, workerId, workerPool, lockManager)` — spawns `agy` child process, registers close/error listeners that handle git add/commit/push and cleanup (~48 lines, lines 118-165)
   - IMPORTANT: preserve the error and cleanup semantics exactly. Both the 'close' and 'error' handlers must call releaseWorker and releaseLock.

Verify: `npm test` in packages/engine — job-dispatcher.test.ts must all pass.

---

## Phase 4 — Verify all

- [ ] `npm run build` in packages/engine — zero TypeScript errors
- [ ] `npm test` in packages/engine — **171 tests passing, 0 failing**
- [ ] Re-run: `node packages/superconductor-core/dist/cli/index.js intelligence --skip-sast`
- [ ] Confirm engine hotspots in new `03_complexity.json`: all target functions CCN ≤ 10

## Swarm Assignment

| Agent | Scope | Key concern |
|---|---|---|
| A | dag/validator.ts + dag/parser.ts + dag/utils.ts | Shared util extraction |
| B | context/builder.ts | Dedup generateDiffPayload |
| C | dispatcher/dispatcher.ts + dispatcher/job-dispatcher.ts | Preserve async cleanup semantics |
