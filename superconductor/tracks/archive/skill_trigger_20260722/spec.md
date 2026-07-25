# Specification: Dynamic Skill Trigger Engine
## FR3 Completion — Skill-Aware Context Loading at Dispatch Time

---

## 1. Overview

This track closes **FR3** from the Swarm Excellence Engine track:

> *"The engine must dynamically load skill context based on active task triggers at dispatch time."*

Currently the engine dispatches tasks with only `contextFiles`, `prompt`, and `symbolDependencies`. The `skill-rules.json` manifests that ship with every skill — containing `triggers.keywords`, `triggers.fileGlobs`, `triggers.intentPatterns`, and `triggers.executionEvents` — are parsed and validated by tests but **never consulted at dispatch time**. The engine has no mechanism to detect which skills are relevant to a task and inject their context into the agent's prompt.

This track implements a `SkillTriggerEngine` that:
1. Scans the installed skill registry for `skill-rules.json` manifests.
2. Evaluates each manifest's trigger conditions against the incoming `DagNode` at dispatch time.
3. Appends matched skill context excerpts (first 100 lines of `SKILL.md`) to the task prompt.
4. Operates within the existing `CacheManager` so matched skill context is cached for token efficiency.

---

## 2. Existing Framework — Evaluate Before Extending or Replacing

> **IMPLEMENTATION DIRECTIVE**: Per Workflow Principle #7, the implementing agent must surface reasoning for extend vs. replace before writing any code.

| Existing Module | File | What It Already Does | What This Track Extends It With |
|:---|:---|:---|:---|
| `Dispatcher` | `packages/engine/src/dispatcher/dispatcher.ts` | Acquires lock, sets `toolSurface`, calls `simulateExecution` | Call `SkillTriggerEngine.resolve(task)` before `simulateExecution` to inject matched skill summaries into `task.prompt` |
| `CacheManager` | `packages/engine/src/routing/cache-manager.ts` | LRU-evicting prefix cache, `processPayload()` | Skill context injections flow through the existing `processPayload()` call — no extension needed |
| `buildContext` | `packages/engine/src/context/builder.ts` | Assembles task prompt from `DagNode` fields | Receives the pre-enriched `task.prompt` — no extension needed |
| `skill-rules.schema.json` | `superconductor/schema/skill-rules.schema.json` | JSON Schema for skill manifest validation | Read-only — used by `SkillTriggerEngine` to validate manifests before evaluating triggers |

---

## 3. Research Notes

- **Progressive Disclosure Principle**: Skill `SKILL.md` files can be up to 500 lines. Injecting the full file would defeat token optimisation. Inject only a configurable `headLines` excerpt (default: 100) — the skill's own progressive disclosure design means the first 100 lines contain the activation summary and most critical rules.
- **Trigger Evaluation Order**: Keywords are O(n) string scan; fileGlobs are O(m×n) glob match; intentPatterns are regex. Evaluation should short-circuit on first match per manifest to stay within the 500ms context-assembly NFR.
- **Cache Coherence**: Skill file content should be cached in memory for the engine's lifetime (cold-read once per boot) and invalidated only if the skills directory mtime changes. This prevents repeated `fs.readFileSync` on every dispatch.
- **Graceful Degradation**: If the skills directory is missing or a manifest is malformed, the engine must log a warning and continue dispatch without skill context rather than failing.

---

## 4. Architecture

### 4.1 New Module: `SkillTriggerEngine`
File: `packages/engine/src/skills/skill-trigger-engine.ts`

Responsibilities:
- `scan(skillsDir: string): SkillManifest[]` — reads all `skill-rules.json` files, validates against schema, caches in memory.
- `match(task: DagNode): SkillMatch[]` — evaluates trigger conditions (keyword, glob, intent, event) against the task and returns matched skills.
- `buildSkillContext(matches: SkillMatch[], headLines?: number): string` — reads and slices matched `SKILL.md` files, returns concatenated context string.

### 4.2 Integration Point: `Dispatcher.dispatch()`
After `task.toolSurface` assignment and before `buildContext(task, commonContext)` is called (in `Engine.startTask()`), call:
```typescript
const skillContext = await this.skillTrigger.buildSkillContext(
  this.skillTrigger.match(task)
);
if (skillContext) {
  task.prompt = `${task.prompt}\n\n--- Active Skills ---\n${skillContext}`;
}
```

### 4.3 New Types
```typescript
interface SkillManifest {
  name: string;
  skillDir: string;         // absolute path to the skill directory
  triggers: {
    keywords?: string[];
    fileGlobs?: string[];
    intentPatterns?: string[];
    executionEvents?: string[];
  };
  metadata: {
    name: string;
    marketplace: string;
    version: string;
  };
}

interface SkillMatch {
  manifest: SkillManifest;
  matchedBy: 'keyword' | 'glob' | 'intent' | 'event';
}
```

---

## 5. Functional Requirements

- **FR3-1**: `SkillTriggerEngine.scan()` reads all `skill-rules.json` files from a configurable `skillsDir` (default: the superconductor `skills/` directory relative to the engine's CWD). Caches results in memory after the first scan.
- **FR3-2**: `SkillTriggerEngine.match(task)` evaluates triggers in priority order:
  1. `executionEvents` — if `'TrackInitialization'` is present and task is the first in a DAG.
  2. `fileGlobs` — match against `task.contextFiles` using `minimatch`.
  3. `keywords` — case-insensitive substring match against `task.prompt`.
  4. `intentPatterns` — regex test against `task.prompt`.
  - Returns all skills that match ANY condition (union, not intersection).
- **FR3-3**: `SkillTriggerEngine.buildSkillContext()` reads the first `headLines` lines (default: 100) of each matched skill's `SKILL.md`. Prefixes each with `--- Skill: <name> ---`. Total injected context must not exceed 2000 tokens (~8000 chars).
- **FR3-4**: `Engine` instantiates `SkillTriggerEngine` in its constructor. `EngineConfig` accepts an optional `skillsDir?: string`.
- **FR3-5**: Skill context is injected into `task.prompt` in `Engine.startTask()` before `buildContext()` is called.
- **FR3-6**: If `skillsDir` does not exist or contains no valid manifests, dispatch proceeds normally with a `console.warn`.
- **FR3-7**: Skill scanning is cached per engine instance. File content is read lazily (on first match, not on scan).

---

## 6. Non-Functional Requirements

- **NFR1 (Performance)**: Skill matching must complete in < 50ms for up to 20 installed skills. Regex compilation is cached.
- **NFR2 (Token Safety)**: Total injected skill context ≤ 8000 characters across all matched skills.
- **NFR3 (Graceful Degradation)**: Invalid manifests are skipped with a warning. Missing `SKILL.md` files are skipped.
- **NFR4 (Backward Compatibility)**: All 165 existing tests must continue to pass. New code must be additive only.

---

## 7. Acceptance Criteria

- [ ] `SkillTriggerEngine` exists at `packages/engine/src/skills/skill-trigger-engine.ts` and exports `scan`, `match`, `buildSkillContext`.
- [ ] `Engine` instantiates `SkillTriggerEngine` and calls `match(task)` + `buildSkillContext()` in `startTask()`.
- [ ] A task whose `prompt` contains keyword `"implement"` matches the `implement` skill's manifest (keyword trigger).
- [ ] A task whose `contextFiles` includes `superconductor/tracks/*/plan.md` matches the `implement` skill's manifest (glob trigger).
- [ ] Injected skill context contains `--- Skill: implement ---` in the task prompt.
- [ ] Total injected context for any task ≤ 8000 characters.
- [ ] If `skillsDir` is missing, engine dispatches normally (no crash).
- [ ] All 165 existing tests pass. New tests cover keyword match, glob match, and graceful degradation.

---

## 8. Out of Scope

- Modifying any existing `skill-rules.json` manifest file.
- Loading skills from remote registries or URLs.
- Hot-reload of skill manifests during engine execution.
- Modifying the `skill-rules.schema.json` schema.
