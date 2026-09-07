# Implementation Plan: Continuous Learning Engine — Contrastive Trajectory & Remediation Distillation

**Track ID:** `continuous_learning_refinement_20260907`  
**Target Branch:** `main`  
**Track Branch:** `track/continuous_learning_refinement_20260907`  

---

## Swarm Blueprint

### Topology Map & Model Tier Routing

| Phase | Description | Agents | Domain Scope | Models | Max Concurrency |
|---|---|---|---|---|---|
| 0 | Preflight Verification | setup | package.json, test cache | flash_lite | 1 |
| 1 | Transcript & Git Diff Ingestion | superconductor-processor | packages/superconductor-core/src/learning/harvester.ts, types.ts | flash | 1 |
| 2 | Contrastive Templates & Distiller | superconductor-processor | packages/superconductor-core/src/learning/templates.ts, skill-distiller.ts | flash | 2 |
| 3 | CLI & E2E Contrastive Suite | superconductor-processor | packages/superconductor-core/src/cli/learn.ts, tests/e2e/ | flash | 2 |
| 4 | Integration & Merge | setup | superconductor/tracks.md | flash_lite | 1 |

---

## Phase 0: Swarm Preflight

- [x] Task: Verify preflight test baseline is green [TIER-1:TCS=1] [AGENT:setup]
    CREATES: .superconductor/preflight-cache.json
    PROTECTED: package.json
    INVARIANT_AFTER: "Preflight tests MUST be green before implementation starts."
    - [x] Run npm test -- --run and verify 100% green [TIER-1:TCS=1]
    - [x] Cache preflight report [TIER-1:TCS=1]

- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 1: Transcript & Git Diff Ingestion Engine

- [x] Task: Implement Transcript & Git Diff Ingestion in TrajectoryHarvester [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/transcript-parser.ts, packages/superconductor-core/src/learning/__tests__/transcript-parser.test.ts
    PROTECTED: packages/superconductor-core/src/learning/sanitizer.ts
    INVARIANT_AFTER: "Transcript parser MUST extract real tool calls and redact credentials via TrajectorySanitizer."
    - [x] Write unit tests for parsing transcript.jsonl entries (tool calls, error outputs, stack traces) [TIER-1:TCS=2]
    - [x] Implement TranscriptParser to extract tool action sequences and failure-remediation pairs [TIER-1:TCS=3]
    - [x] Implement git diff extraction between pre-remediation commit and post-remediation commit in TrajectoryHarvester [TIER-1:TCS=3]
    - [x] Verify test suite and coverage [TIER-1:TCS=2]

- [x] Task: Superconductor - User Manual Verification 'Phase 1: Transcript & Git Diff Ingestion' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 2: Contrastive Template & Micro-Skill Distillation

- [x] Task: Upgrade SkillTemplateGenerator with Contrastive Learning Sections [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/__tests__/templates.test.ts
    PROTECTED: packages/superconductor-core/src/learning/templates.ts
    INVARIANT_AFTER: "Contrastive templates MUST render Anti-Patterns (where things went wrong) and Hardened Patterns (where things went right)."
    - [x] Write unit tests for rendering contrastive sections (Anti-Patterns, Hardened Patterns, Invariants, Verification) [TIER-1:TCS=2]
    - [x] Update SkillTemplateGenerator to format contrastive markdown blocks [TIER-1:TCS=2]
    - [x] Verify test suite and coverage [TIER-1:TCS=2]

- [x] Task: Implement Remediation Micro-Skill Distillation in WorkflowSkillDistiller [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/__tests__/skill-distiller.test.ts
    PROTECTED: packages/superconductor-core/src/learning/skill-distiller.ts
    INVARIANT_AFTER: "Distilled micro-skills MUST NOT exceed 15 steps and MUST adhere to Dogma tool whitelist."
    - [x] Write unit tests for distilling individual remediation cycles into micro-skills [TIER-1:TCS=2]
    - [x] Implement distillRemediationMicroSkills to extract problem-solution pairs from Quorum findings & git diffs [TIER-1:TCS=3]
    - [x] Verify test suite and coverage [TIER-1:TCS=2]

- [x] Task: Superconductor - User Manual Verification 'Phase 2: Contrastive Distillation' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 3: CLI Remediation Harvest & E2E Verification

- [x] Task: Extend CLI learn command to support micro-skill remediation harvesting [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/cli/__tests__/learn.test.ts
    PROTECTED: packages/superconductor-core/src/cli/learn.ts, commands/superconductor/learn.toml
    INVARIANT_AFTER: "CLI learn --harvest MUST support harvesting remediation micro-skills and staging each individually."
    - [x] Write unit tests for learn --harvest --remediations CLI flags [TIER-1:TCS=2]
    - [x] Wire remediation micro-skill harvesting into learnCommand [TIER-1:TCS=3]
    - [x] Update commands/superconductor/learn.toml documentation [TIER-1:TCS=1]
    - [x] Verify test suite and coverage [TIER-1:TCS=2]

- [x] Task: Implement End-to-End Contrastive Learning Integration Test Suite [TIER-2:TCS=2] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/tests/e2e/contrastive-learning-e2e.test.ts
    PROTECTED: packages/superconductor-core/tests/e2e/
    INVARIANT_AFTER: "Harvested micro-skills MUST pass SkillDogmaValidator and CanaryHarness vetting gate."
    - [x] Write E2E test simulating a failure -> remediation -> transcript/diff harvest -> micro-skill staging -> vetting pass [TIER-1:TCS=2]
    - [x] Run global test suite to verify 100% green [TIER-1:TCS=2]

- [x] Task: Superconductor - User Manual Verification 'Phase 3: CLI & E2E Verification' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 4: Integration & Finalization

- [ ] Task: Integrate track 'continuous_learning_refinement_20260907' into main branch [TIER-1:TCS=2] [AGENT:setup]
    CREATES: superconductor/tracks.md
    PROTECTED: .git/
    INVARIANT_AFTER: "Track branch MUST be merged cleanly into main without regressions."

- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=4]
