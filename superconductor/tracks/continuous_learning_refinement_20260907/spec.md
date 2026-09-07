# Spec: Continuous Learning Engine — Contrastive Trajectory & Remediation Distillation

**Track ID:** `continuous_learning_refinement_20260907`  
**Type:** Feature  
**Target Branch:** `main`  
**Track Branch:** `track/continuous_learning_refinement_20260907`  
**Status:** Pending  

---

## 1. Overview & Problem Statement

The initial implementation of the Superconductor Continuous Learning Engine (CLE) established the core lifecycle pipeline (Harvester -> Synthesizer -> Distiller -> Incubation -> Dogma/Canary Vetting Gate -> Promoter -> CLI). However, harvesting at the coarse track level resulted in an anti-pattern:
1. When full tool execution events were absent, the harvester fell back to reading all 52 tasks from `plan.md`.
2. The distiller emitted 52 dummy `Execute plan_task` steps without semantic domain context.
3. The resulting candidate was rejected by `CanaryHarness` for exceeding the 50-step limit and flagged by `DogmaValidator` for unwhitelisted `plan_task` tools.
4. Critically, the engine did not capture **where the agents went wrong** (vulnerabilities, test failures, regex evasion) versus **where the agents went right** (hardened boundary fixes, strict path checks, canary harness execution).

This refinement track upgrades the Continuous Learning Engine with **Transcript & Git Diff Fusion**, **Remediation-Centric Micro-Skill Distillation**, and **Contrastive SKILL.md Templates**.

---

## 2. Research Notes & Grounding

Based on modern agentic self-improvement literature (Reflexion, ExpeL, Voyager) and recent empirical findings:
- **Reflexion & Episodic Contrast**: Self-improvement occurs when agents store contrastive pairs—the failed attempt (anti-pattern, error trace) paired directly with the successful resolution (working diff, hardened invariant).
- **Git Diff as Ground Truth**: Rather than dumping entire codebases or macro-level track plans, surgical git diff hunks focus the agent on the exact changes that resolved the failure, keeping token footprint low and signal high.
- **Micro-Skill Granularity**: Reusable skills should be modular, single-responsibility procedures (3–10 steps) rather than 50+ step track-level replays.

---

## 3. Acceptance Criteria

- **AC-1: Transcript Log Ingestion**: `TrajectoryHarvester` MUST support ingesting `transcript.jsonl` files (from parent sessions or subagents) to extract actual tool calls (`view_file`, `replace_file_content`, `run_command`), error messages, and test outputs.
- **AC-2: Git Remediation Diff Ingestion**: `TrajectoryHarvester` MUST support extracting git diffs between pre-remediation and post-remediation commits to capture exact code corrections.
- **AC-3: Remediation-Centric Micro-Skill Distillation**: `WorkflowSkillDistiller` MUST support distilling discrete micro-skills for individual remediation cycles (e.g. `path-traversal-containment`, `markdown-shell-pattern-hardening`, `isolated-canary-sandboxing`) rather than giant track-level dumps.
- **AC-4: Contrastive SKILL.md Architecture**: `SkillTemplateGenerator` MUST generate canonical `SKILL.md` documents containing:
  - `## Overview` & `## When to Use`
  - `## Anti-Patterns & Common Traps (Where Things Go Wrong)`: Concrete error traces, naive regexes, or insecure assumptions.
  - `## Hardened Implementation Pattern (Where Things Go Right)`: The exact verified fix and architecture.
  - `## Invariants & Rules`: Actionable RFC-2119 rules.
  - `## Verification Recipe`: Concrete test or assertion command.
- **AC-5: Vetting Gate Compliance**: Distilled micro-skills MUST adhere to `SkillDogmaValidator` permitted tool whitelist and pass `CanaryHarness` simulation within step thresholds.
- **AC-6: CLI Support**: `/superconductor:learn` CLI MUST support harvesting micro-skills from recent remediations via `superconductor learn --harvest [--remediations] [--track <id>]`.
- **AC-7: Test Coverage**: 100% test pass rate across all existing and new unit/e2e tests with >80% coverage.

---

## 4. Architecture & Data Flow

```
+-------------------------------------------------------------+
|               Experiential Data Sources                     |
|  1. transcript.jsonl (tool calls, failures, stderr)         |
|  2. Quorum findings (REV-1..3, ADV-1..4)                   |
|  3. Git remediation diffs (git diff <pre-fix>..<post-fix>)  |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|             TrajectoryHarvester Refinement                  |
|  - extractTranscriptEvents(transcriptPath)                  |
|  - extractRemediationDiffs(preCommit, postCommit)           |
|  - bundle into RemediationExperienceRecords                 |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|            WorkflowSkillDistiller Refinement                |
|  - distillRemediationMicroSkill(record)                     |
|  - synthesizes contrastive Anti-Pattern vs Fix sections    |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|         SkillTemplateGenerator (Contrastive Format)         |
|  - ## Overview & When to Use                                |
|  - ## Anti-Patterns & Common Traps (Where things went wrong)|
|  - ## Hardened Implementation Pattern (Where things went right)|
|  - ## Invariants & Rules (RFC-2119)                         |
|  - ## Verification Recipe                                   |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|  Vetting Gate (SkillDogmaValidator + CanaryHarness)         |
|  --> .agents/skills/incubating/<micro-skill>/SKILL.md       |
+-------------------------------------------------------------+
```

---

## 5. Invariants to Uphold

1. **Micro-Skill Step Bound**: Distilled micro-skills MUST NOT exceed 15 procedural steps.
2. **Contrastive Integrity**: Every remediation-distilled skill MUST contain both the error context and the verified resolution.
3. **Sandbox Safety**: Canary simulation of distilled micro-skills MUST remain isolated in temp sandboxes without mutating production code.
4. **Non-Regressive Vetting**: The `PASSED` status requirement for skill promotion remains strictly enforced.
