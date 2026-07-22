# Implementation Plan: Dynamic Skill Trigger Engine
**Track ID:** `skill_trigger_20260722`
**Spec:** [spec.md](./spec.md)

---

## Phase 0: Swarm Preflight

- [x] Task: Verify `swarm-orchestrate` skill is loaded and ready for autonomous execution

---

## Phase 1: SkillTriggerEngine Core

- [x] Task: Write tests for `SkillTriggerEngine` — keyword match, glob match, intent pattern match, graceful degradation [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: keyword `"implement"` in prompt matches `implement` skill manifest
    - [x] Test: `contextFiles` containing `superconductor/tracks/*/plan.md` matches via glob
    - [x] Test: missing `skillsDir` → no crash, returns empty matches
    - [x] Test: malformed manifest → skipped with warning
    - [x] Test: total context output ≤ 8000 characters
- [x] Task: Superconductor - User Manual Verification 'Phase 1 Tests' (Protocol in workflow.md)

- [x] Task: Implement `SkillTriggerEngine` at `packages/engine/src/skills/skill-trigger-engine.ts` [TIER-3] [AGENT:caduceus-processor]
    - [x] `scan(skillsDir: string): SkillManifest[]` — reads and validates all `skill-rules.json` files; caches in-memory
    - [x] `match(task: DagNode): SkillMatch[]` — evaluates triggers in priority: executionEvents → fileGlobs → keywords → intentPatterns
    - [x] `buildSkillContext(matches: SkillMatch[], headLines?: number): string` — reads first 100 lines of matched `SKILL.md`, prefixes with `--- Skill: <name> ---`, enforces 8000 char cap
    - [x] Regex compilation cached per manifest (not per call)
    - [x] `fs.readFileSync` for `SKILL.md` is lazy (on first match, not on scan)
- [x] Task: Superconductor - User Manual Verification 'Phase 1 Implementation' (Protocol in workflow.md)

---

## Phase 2: Engine Integration

- [x] Task: Add `SkillTriggerEngine` to `Engine` — types, constructor, config [TIER-2] [AGENT:caduceus-processor]
    - [x] Add `skillsDir?: string` to `EngineConfig`
    - [x] Add `public skillTrigger: SkillTriggerEngine` to `Engine` class
    - [x] Instantiate `this.skillTrigger = new SkillTriggerEngine(config.skillsDir)` in constructor
- [x] Task: Wire `skillTrigger.match()` + `buildSkillContext()` into `Engine.startTask()` [TIER-3] [AGENT:caduceus-processor]
    - [x] Call `skillTrigger.match(task)` after `toolSurface` assignment, before `buildContext()`
    - [x] Inject returned context into `task.prompt` via `--- Active Skills ---` block
    - [x] Ensure injection flows through existing `CacheManager.processPayload()` (no separate cache call needed)
- [x] Task: Write integration test verifying skill context appears in dispatched prompt [TIER-2] [AGENT:caduceus-processor]
    - [x] Test: `Engine` with a task prompt containing `"implement"` → `getTaskState` reflects skill trigger fired
    - [x] Test: `Engine` with missing `skillsDir` → completes without error
- [x] Task: Superconductor - User Manual Verification 'Phase 2 Integration' (Protocol in workflow.md)

---

## Phase 3: Verification & Hardening

- [x] Task: Run full test suite — all 165 existing + new tests must pass [TIER-1] [AGENT:caduceus-processor]
    - [x] `npx tsc --noEmit` → clean
    - [x] `CI=true npm test` → 171 passed, 0 failed
- [x] Task: Performance check — skill matching for 20 manifests completes < 50ms [TIER-2] [AGENT:caduceus-reviewer]
- [x] Task: Token safety check — assert no dispatch produces > 8000 chars of skill context [TIER-2] [AGENT:caduceus-reviewer]
- [x] Task: Superconductor - User Manual Verification 'Phase 3 Hardening' (Protocol in workflow.md)

---

## Phase 4: Integration & Finalization

- [ ] Task: Commit all changes with message `feat(engine): Implement SkillTriggerEngine — dynamic skill context loading at dispatch time` [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Update `superconductor/tracks/skill_trigger_20260722/plan.md` with completion SHAs
- [ ] Task: Mark track complete in `superconductor/tracks.md`
- [ ] Task: Integrate track `skill_trigger_20260722` into `main` branch
- [ ] Task: Superconductor - User Manual Verification 'Phase 4 Finalization' (Protocol in workflow.md)
