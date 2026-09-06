# Implementation Plan: Superconductor Continuous Learning Engine (CLE)

**Track ID:** `continuous_learning_engine_20260906`
**Max Concurrent Agents:** 3
**Target Branch:** `main`

---

## Oracle Proactive Planning

- **TrajectorySanitizer Module:** Standalone utility stripping ANSI escapes, passwords, private keys, and API tokens from execution traces before serialization.
- **InvariantDeduplicator Module:** Token and semantic fingerprinting module preventing duplicate invariants from accumulating in `task-store`.
- **SkillDogmaValidator:** Static analyzer for `SKILL.md` documents enforcing YAML frontmatter schema, markdown hierarchy, and prohibited shell constructs.
- **CanaryHarness Sandbox:** Lightweight evaluation runner that executes candidate skills against test prompts in isolated mock environments before promotion.

---

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 13 tasks)
**Estimated Track Token Budget:** ~0.5M tokens · ~$0.04 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify swarm-orchestrate skill installed ... | flash_lite | 26K | ~6 min |
| 2 | Task: Implement TrajectorySanitizer utility [TI... | flash_lite | 27K | ~9 min |
| 3 | Verify test suite and coverage; Task: Implement... | flash_lite | 35K | ~9 min |
| 4 | Implement TrajectoryHarvester and ExperienceRec... | flash_lite | 35K | ~9 min |
| 5 | Task: Implement InvariantDeduplicator and Finge... | flash_lite | 27K | ~9 min |
| 6 | Verify test suite and coverage; Task: Implement... | flash_lite | 27K | ~9 min |
| 7 | Implement ReflectiveInvariantSynthesizer integr... | flash_lite | 35K | ~9 min |
| 8 | Task: Implement WorkflowSkillDistiller and Temp... | flash_lite | 35K | ~9 min |
| 9 | Verify test suite and coverage; Task: Implement... | flash_lite | 27K | ~9 min |
| 10 | Implement SkillIncubationManager isolating cand... | flash_lite | 35K | ~9 min |
| 11 | Task: Implement SkillDogmaValidator and Securit... | flash_lite | 28K | ~9 min |
| 12 | Verify test suite and coverage; Task: Implement... | flash_lite | 27K | ~9 min |
| 13 | Implement CanaryHarness with mock execution and... | flash_lite | 35K | ~9 min |
| 14 | Task: Implement SkillPromoter and Scope Migrati... | flash_lite | 27K | ~9 min |
| 15 | Verify test suite and coverage; Task: Implement... | flash_lite | 27K | ~9 min |
| 16 | Implement learn.ts CLI handler and register lea... | flash_lite | 43K | ~9 min |
| 17 | Task: Run global test suite and verify end-to-e... | flash_lite | 26K | ~9 min |
| 18 | Task: Integrate track 'continuous_learning_engi... | flash_lite | 26K | ~6 min |

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify swarm-orchestrate skill installed and swarm mode is active. Run global preflight npm test -- --run and cache result for quorum reviewers. [TIER-1:TCS=3] [AGENT:setup]
    CREATES: .superconductor/preflight-cache.json
    PROTECTED: package.json
    INVARIANT_AFTER: "Preflight tests MUST be green before implementation starts."
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 1: Trajectory Harvester & Data Sanitization

- [ ] Task: Implement TrajectorySanitizer utility [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/sanitizer.ts, packages/superconductor-core/src/learning/__tests__/sanitizer.test.ts
    PROTECTED: packages/superconductor-core/src/notebook/note-writer.ts
    INVARIANT_AFTER: "Sanitizer MUST redact API tokens, passwords, and private keys from all recorded traces."
    - [ ] Write unit tests for sensitive token redaction and input/output truncation [TIER-1:TCS=2]
    - [ ] Implement TrajectorySanitizer class with regex masks and schema filters [TIER-1:TCS=3]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Implement TrajectoryHarvester for swarm & quorum logs [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/harvester.ts, packages/superconductor-core/src/learning/types.ts, packages/superconductor-core/src/learning/__tests__/harvester.test.ts
    PROTECTED: packages/superconductor-core/src/orchestration/
    INVARIANT_AFTER: "Harvester MUST serialize execution traces asynchronously without blocking active swarm execution."
    - [ ] Write unit tests for trajectory parsing from plan.md, quorum-state.json, and review logs [TIER-1:TCS=3]
    - [ ] Implement TrajectoryHarvester and ExperienceRecord schemas [TIER-1:TCS=3]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Trajectory Harvester & Data Sanitization' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 2: Reflective Invariant Synthesizer (Fast Loop)

- [ ] Task: Implement InvariantDeduplicator and Fingerprint Index [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/deduplicator.ts, packages/superconductor-core/src/learning/__tests__/deduplicator.test.ts
    PROTECTED: packages/task-store/src/
    INVARIANT_AFTER: "Deduplicator MUST prevent identical or redundant invariants from polluting task-store."
    - [ ] Write unit tests for cosine/normalized text fingerprint hashing [TIER-1:TCS=2]
    - [ ] Implement InvariantDeduplicator with token similarity checks [TIER-1:TCS=3]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Implement ReflectiveInvariantSynthesizer for remediation failures [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/invariant-synthesizer.ts, packages/superconductor-core/src/learning/__tests__/invariant-synthesizer.test.ts
    PROTECTED: packages/superconductor-core/src/notebook/note-writer.ts, packages/task-store/
    INVARIANT_AFTER: "Mined invariants MUST be valid constraint strings and recorded with appropriate severity."
    - [ ] Write unit tests for extracting invariant rules from Quorum NEEDS_FIXES findings [TIER-1:TCS=2]
    - [ ] Implement ReflectiveInvariantSynthesizer integrating with task-store and NoteWriter.writeWarningNote [TIER-1:TCS=3]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Reflective Invariant Synthesizer' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 3: Workflow-to-Skill Distiller (Slow Loop)

- [ ] Task: Implement WorkflowSkillDistiller and Template Generator [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/skill-distiller.ts, packages/superconductor-core/src/learning/templates.ts, packages/superconductor-core/src/learning/__tests__/skill-distiller.test.ts
    PROTECTED: packages/superconductor-core/src/learning/types.ts
    INVARIANT_AFTER: "Distiller MUST produce valid SKILL.md documents with YAML frontmatter containing name and description."
    - [ ] Write unit tests for distilling execution graphs into SKILL.md documents [TIER-1:TCS=3]
    - [ ] Implement WorkflowSkillDistiller with confidence scoring and provenance metadata [TIER-1:TCS=3]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Implement SkillIncubationManager for staging storage [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/incubation-manager.ts, packages/superconductor-core/src/learning/__tests__/incubation-manager.test.ts
    PROTECTED: .agents/skills/
    INVARIANT_AFTER: "Incubating skills MUST be written only to .agents/skills/incubating/ and excluded from active discovery."
    - [ ] Write unit tests for staging directory lifecycle (stage, list, retrieve, clean) [TIER-1:TCS=2]
    - [ ] Implement SkillIncubationManager isolating candidate skills [TIER-1:TCS=3]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Workflow-to-Skill Distiller' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 4: Skill Incubation & Automated Vetting Gate

- [ ] Task: Implement SkillDogmaValidator and Security Scanner [TIER-2:TCS=4] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/dogma-validator.ts, packages/superconductor-core/src/learning/__tests__/dogma-validator.test.ts
    PROTECTED: packages/superconductor-core/src/permissions/
    INVARIANT_AFTER: "DogmaValidator MUST reject skills containing prohibited shell patterns or invalid tool names."
    - [ ] Write unit tests for syntax linting, frontmatter schema validation, and security pattern screening [TIER-1:TCS=3]
    - [ ] Implement SkillDogmaValidator enforcing Superconductor and Design OS rules [TIER-1:TCS=3]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Implement CanaryHarness for candidate skill simulation [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/canary-harness.ts, packages/superconductor-core/src/learning/__tests__/canary-harness.test.ts
    PROTECTED: packages/superconductor-core/src/learning/dogma-validator.ts
    INVARIANT_AFTER: "CanaryHarness MUST execute in an isolated sandbox without mutating production files."
    - [ ] Write unit tests for canary prompt execution and assertion verification [TIER-1:TCS=3]
    - [ ] Implement CanaryHarness with mock execution and timeout guards [TIER-1:TCS=2]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Skill Incubation & Automated Vetting Gate' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 5: CLI & Promotion Workflow (/superconductor:learn)

- [ ] Task: Implement SkillPromoter and Scope Migration [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/learning/promoter.ts, packages/superconductor-core/src/learning/__tests__/promoter.test.ts
    PROTECTED: .agents/skills/, ~/.agents/extensions/superconductor/skills/
    INVARIANT_AFTER: "Promoter MUST refuse promotion if vetting gate status is not PASSED."
    - [ ] Write unit tests for moving vetted skills to project/global active skill directories [TIER-1:TCS=2]
    - [ ] Implement SkillPromoter with NoteWriter procedure note instrumentation [TIER-1:TCS=3]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Implement CLI command handler and TOML command for /superconductor:learn [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/cli/learn.ts, commands/superconductor/learn.toml, packages/superconductor-core/src/learning/index.ts, packages/superconductor-core/src/cli/__tests__/learn.test.ts
    PROTECTED: packages/superconductor-core/src/cli/index.ts
    INVARIANT_AFTER: "CLI learn subcommands (--list, --inspect, --promote, --discard, --harvest) MUST handle non-interactive flags gracefully."
    - [ ] Write unit tests for CLI argument parsing and interactive dispatch [TIER-1:TCS=2]
    - [ ] Implement learn.ts CLI handler and register learn.toml [TIER-1:TCS=4]
    - [ ] Verify test suite and coverage [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 5: CLI & Promotion Workflow' (Protocol in workflow.md) [TIER-1:TCS=4]

---

## Phase 6: Integration & Finalization

- [ ] Task: Run global test suite and verify end-to-end continuous learning flow [TIER-2:TCS=2] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/tests/e2e/continuous-learning-e2e.test.ts
    PROTECTED: packages/superconductor-core/
    INVARIANT_AFTER: "All existing and new test suites MUST pass with >80% coverage on new learning code."
    - [ ] Write end-to-end integration test exercising Harvester -> Synthesizer -> Distiller -> Gate -> Promoter [TIER-1:TCS=2]
    - [ ] Run npm test -- --run and verify all tests green [TIER-1:TCS=2]

- [ ] Task: Integrate track 'continuous_learning_engine_20260906' into main branch. [TIER-1:TCS=3] [AGENT:setup]
    CREATES: superconductor/tracks.md
    PROTECTED: .git/
    INVARIANT_AFTER: "Track branch MUST be merged cleanly into main without regressions."

- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=4]
