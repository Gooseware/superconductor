# Implementation Plan: Dynamic Skill Trigger Engine
**Track ID:** `skill_trigger_20260722`
**Spec:** [spec.md](./spec.md)

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify `swarm-orchestrate` skill is loaded and ready for autonomous execution

---

## Phase 1: SkillTriggerEngine Core

- [ ] Task: Write tests for `SkillTriggerEngine` — keyword match, glob match, intent pattern match, graceful degradation [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: keyword `"implement"` in prompt matches `implement` skill manifest
    - [ ] Test: `contextFiles` containing `superconductor/tracks/*/plan.md` matches via glob
    - [ ] Test: missing `skillsDir` → no crash, returns empty matches
    - [ ] Test: malformed manifest → skipped with warning
    - [ ] Test: total context output ≤ 8000 characters
- [ ] Task: Superconductor - User Manual Verification 'Phase 1 Tests' (Protocol in workflow.md)

- [ ] Task: Implement `SkillTriggerEngine` at `packages/engine/src/skills/skill-trigger-engine.ts` [TIER-3] [AGENT:caduceus-processor]
    - [ ] `scan(skillsDir: string): SkillManifest[]` — reads and validates all `skill-rules.json` files; caches in-memory
    - [ ] `match(task: DagNode): SkillMatch[]` — evaluates triggers in priority: executionEvents → fileGlobs → keywords → intentPatterns
    - [ ] `buildSkillContext(matches: SkillMatch[], headLines?: number): string` — reads first 100 lines of matched `SKILL.md`, prefixes with `--- Skill: <name> ---`, enforces 8000 char cap
    - [ ] Regex compilation cached per manifest (not per call)
    - [ ] `fs.readFileSync` for `SKILL.md` is lazy (on first match, not on scan)
- [ ] Task: Superconductor - User Manual Verification 'Phase 1 Implementation' (Protocol in workflow.md)

---

## Phase 2: Engine Integration

- [ ] Task: Add `SkillTriggerEngine` to `Engine` — types, constructor, config [TIER-2] [AGENT:caduceus-processor]
    - [ ] Add `skillsDir?: string` to `EngineConfig`
    - [ ] Add `public skillTrigger: SkillTriggerEngine` to `Engine` class
    - [ ] Instantiate `this.skillTrigger = new SkillTriggerEngine(config.skillsDir)` in constructor
- [ ] Task: Wire `skillTrigger.match()` + `buildSkillContext()` into `Engine.startTask()` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Call `skillTrigger.match(task)` after `toolSurface` assignment, before `buildContext()`
    - [ ] Inject returned context into `task.prompt` via `--- Active Skills ---` block
    - [ ] Ensure injection flows through existing `CacheManager.processPayload()` (no separate cache call needed)
- [ ] Task: Write integration test verifying skill context appears in dispatched prompt [TIER-2] [AGENT:caduceus-processor]
    - [ ] Test: `Engine` with a task prompt containing `"implement"` → `getTaskState` reflects skill trigger fired
    - [ ] Test: `Engine` with missing `skillsDir` → completes without error
- [ ] Task: Superconductor - User Manual Verification 'Phase 2 Integration' (Protocol in workflow.md)

---

## Phase 3: Verification & Hardening

- [ ] Task: Run full test suite — all 165 existing + new tests must pass [TIER-1] [AGENT:caduceus-processor]
    - [ ] `npx tsc --noEmit` → clean
    - [ ] `CI=true npm test` → 165+ passed, 0 failed
- [ ] Task: Performance check — skill matching for 20 manifests completes < 50ms [TIER-2] [AGENT:caduceus-reviewer]
- [ ] Task: Token safety check — assert no dispatch produces > 8000 chars of skill context [TIER-2] [AGENT:caduceus-reviewer]
- [ ] Task: Superconductor - User Manual Verification 'Phase 3 Hardening' (Protocol in workflow.md)

---

## Phase 4: Integration & Finalization

- [ ] Task: Commit all changes with message `feat(engine): Implement SkillTriggerEngine — dynamic skill context loading at dispatch time` [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Update `superconductor/tracks/skill_trigger_20260722/plan.md` with completion SHAs
- [ ] Task: Mark track complete in `superconductor/tracks.md`
- [ ] Task: Integrate track `skill_trigger_20260722` into `main` branch
- [ ] Task: Superconductor - User Manual Verification 'Phase 4 Finalization' (Protocol in workflow.md)
