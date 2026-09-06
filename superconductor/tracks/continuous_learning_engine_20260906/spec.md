# Spec: Superconductor Continuous Learning Engine (CLE)

**Track ID:** `continuous_learning_engine_20260906`
**Type:** Feature
**Author:** Root Orchestrator (session a40ea7c8)
**Created:** 2026-09-06
**Status:** Approved

---

## Project Constraints (from Notebook)

- ℹ️ **User Preference (`26300989-2d49-42cd-bdad-e9e260de7ef4`):**
  - **Harvesting Strategy:** Hybrid (automatically harvest execution trajectories post-track, incubating learnings/skills in staging with queued review).
  - **Promotion & Governance:** Vetting Gate with Review (staging area for newly synthesized skills with validation checks before promoting to active skills).
  - **Storage Layer:** Unified Notebook & Workspace Skills (persist procedural notes to `superconductor-kernel` notebook and skills to `.agents/skills/`).
  - **Initial Track Scope:** Comprehensive End-to-End (both Error-to-Invariant reflection and Workflow-to-Skill distillation).
- ℹ️ **User Preference (`8a33dbcc-402c-4851-9978-487586fd0047`):**
  - **Oracle Proactive Planning:** Enabled for architectural improvements & reusable components.

⚠️ **Intelligence: STALE (17.2d old, 83 commits behind · keyword heuristics active · run /superconductor:setup for surgical precision)**

---

## Overview

Superconductor's multi-agent swarms excel at executing complex feature tracks via spec-driven decomposition, parallel implementors, quorum reviews, and oracle reconciliation. However, currently each track executes largely statelessly from an experience perspective:
1. **Recurring Error Classes:** Remediators repeatedly fix similar edge cases, boundary errors, or Dogma violations across different tracks because past failure-and-fix trajectories are not systematically synthesized into persistent invariants.
2. **One-Off Skill Synthesis:** High-leverage workflows discovered and executed by agents during tracks are not automatically harvested or distilled into reusable skills, forcing agents to rediscover patterns from scratch.

The **Continuous Learning Engine (CLE)** creates a closed-loop experiential learning system for Superconductor. By capturing execution traces, reflecting on Quorum remediation cycles, distilling reusable workflows into structured skills (`SKILL.md`), and subjecting new skills to a deterministic vetting gate and user-governed promotion queue, Superconductor will continuously improve and learn on the job over time.

---

## Research Notes (DeerFlow SOTA Research Synthesis)

Deep research conducted via our connected **DeerFlow 2.0** instance synthesized four primary state-of-the-art architectures in agent continuous learning:

1. **Voyager (Wang et al., 2023):**
   - *Code as Action/Skill Primitive:* Programs are expressive, compositional, and naturally reusable across environments.
   - *Vector Skill Library:* Stores executable skill programs with natural language docstrings and descriptions indexed for semantic retrieval.
   - *Recursive Synthesis:* Complex skills are constructed hierarchically by composing simpler vetted skills.

2. **ExpeL (Zhao et al., 2023):**
   - *Experiential Pool:* Ingests successful and failed trajectories across tasks into a cross-task experiential repository.
   - *Rule/Insight Extraction:* Distills natural language heuristics and guidelines via pairwise trajectory comparison.
   - *Evolutionary Upvoting/Downvoting:* Continuously adjusts heuristic utility weights based on subsequent task success rates, pruning ineffective guidelines.

3. **Reflexion (Shinn et al., 2023):**
   - *Verbal Reinforcement Learning:* When encountering execution failures or assertion misses, agents produce self-reflective diagnostic summaries.
   - *Episodic Memory Buffer:* Short-term reflective feedback is buffered and injected into subsequent attempts to prevent repeating the same failure modes.

4. **DSPy (Khattab et al., 2023):**
   - *Deterministic Assertions & Compilation:* Replaces brittle ad-hoc prompting with typed modules and programmatic validation assertions.
   - *Canary Optimization & Regression Protection:* Automatically compiles and evaluates candidate prompts/skills against canary assertions before deployment.

### Key Architectural Pitfalls & Mitigations
- **Semantic Drift & Hallucinated Tools:** Synthesized skills that invent non-existent APIs or degrade existing protocols. *Mitigation:* Deterministic AST validation, Dogma conformance checks, and canary test runs in isolated environments.
- **Context Bloat & Token Inefficiency:** Injecting too many low-quality heuristics or skills degrades reasoning. *Mitigation:* Staging incubation gate, confidence scoring, strict deduplication, and on-demand semantic retrieval rather than eager injection.
- **Security & Prompt Injection:** Malicious or rogue content embedded in execution outputs must not become executable skills. *Mitigation:* Structural isolation, strict YAML frontmatter schemas, prohibited shell constructs, and mandatory human review before promotion.

---

## Architecture Committee Findings

### Dreamer (Architecture & Decoupling)
- **Decoupled 5-Stage Pipeline:**
  1. `TrajectoryHarvester`: Asynchronously monitors track completions and Quorum runs, serializing clean execution traces.
  2. `ReflectiveSynthesizer` (Fast Loop): Converts failure loops and Quorum fixes directly into `task-store` invariants and high-priority notebook warning notes.
  3. `WorkflowDistiller` (Slow Loop): Identifies high-leverage multi-step execution graphs and distills them into candidate `SKILL.md` documents.
  4. `IncubationStaging`: Quarantines candidate skills in `.agents/skills/incubating/<skill-name>/` to prevent unvetted execution.
  5. `VettingAndPromotion`: Evaluates candidates against automated Dogma and canary checks, surfacing vetted candidates to `/superconductor:learn` for user approval.
- **Storage Strategy:**
  - Procedural heuristics & error warnings → `superconductor-kernel` Notebook (`note-writer.ts`).
  - Strict post-conditions & system rules → `task-store` Invariants.
  - Reusable agent workflows → `.agents/skills/` (project-local) or `~/.agents/extensions/superconductor/skills/` (global).

### Reviewer (Security, Performance & Dogma)
- **REV-1 (Security):** Generated skills must NEVER execute unsanitized bash commands or dynamic code without static validation. `SkillValidator` must enforce a strict whitelist of permissible actions and require explicit tool declarations.
- **REV-2 (Isolation):** Incubating skills MUST NOT be visible to standard agent discovery (`find-skills`, `using-superpowers`) until promoted. They must reside in a dedicated staging directory `.agents/skills/incubating/`.
- **REV-3 (Performance):** Trajectory harvesting must be non-blocking and execute either asynchronously at track completion or via explicit CLI trigger (`/superconductor:learn --harvest`).
- **REV-4 (Deduplication):** Invariants mined from Quorum remediation must be deduplicated via semantic cosine similarity or fingerprint hashing before writing to `task-store` to prevent database pollution.

---

## Oracle Proactive Planning Findings

- **TrajectorySanitizer Module:** Reusable sanitizer stripping ANSI escapes, passwords, private keys, and API tokens from execution traces.
- **InvariantDeduplicator Module:** Token and semantic fingerprinting module to prevent duplicate invariants from accumulating in `task-store`.
- **SkillDogmaValidator:** Static analyzer for `SKILL.md` documents enforcing YAML frontmatter schema, markdown hierarchy, and prohibited shell constructs.
- **CanaryHarness Sandbox:** Lightweight evaluation runner that executes candidate skills against test prompts in isolated environments before promotion.

---

## Functional Requirements

### FR-1: Experience & Trajectory Harvester (`TrajectoryHarvester`)
- Ingests track execution artifacts: `plan.md`, `task-store` logs, Quorum FSM history (`.superconductor/quorum/` and `quorum-state.json`), and standalone review outputs.
- Extracts:
  - Successful tool call sequences and problem-solving patterns.
  - Quorum reviewer critique and remediation diffs.
  - User feedback and corrections recorded in session notes.
- Filters out noise, transient errors, and redacts sensitive environment variables or secrets via `TrajectorySanitizer`.

### FR-2: Reflective Invariant Synthesizer (`ReflectiveInvariantSynthesizer`)
- Analyzes Quorum remediation cycles where initial implementations failed review.
- Identifies the root cause failure pattern (e.g., missing parameter validation, race conditions, file modification out of bounds).
- Formulates codified invariants formatted as actionable constraints:
  - Checks `InvariantDeduplicator` to ensure novelty.
  - Writes formal invariant rules to `task-store` (`invariant_create` / `task-store` API).
  - Emits high-priority warning notes to notebook via `NoteWriter.writeWarningNote`.

### FR-3: Workflow-to-Skill Distiller (`WorkflowSkillDistiller`)
- Identifies successful, non-trivial multi-task workflows that solved novel problems.
- Distills the workflow into a standard agent skill folder containing:
  - `SKILL.md` with validated YAML frontmatter (`name`, `description`).
  - Clear triggers, prerequisites, step-by-step procedures, and verification criteria.
  - Optional helper scripts or reference templates.
- Assigns an initial confidence score and source track provenance metadata.

### FR-4: Skill Incubation & Staging Area (`.agents/skills/incubating/`)
- Places distilled skill candidates into `.agents/skills/incubating/<skill-name>/`.
- Embeds incubation metadata:
  ```yaml
  ---
  name: <skill-name>
  description: <description>
  superconductor_learning:
    status: incubating
    source_track: <track_id>
    harvest_timestamp: <iso-timestamp>
    confidence_score: 0.85
    vetting_status: pending
  ---
  ```
- Ensures incubating directory is excluded from active skill discovery paths until promoted.

### FR-5: Automated Vetting Gate & Dogma Validator (`SkillVettingGate`)
- **Static Linting:** Validates YAML frontmatter syntax, required fields, markdown headers, and links.
- **Dogma Conformance:** Checks against Superconductor Dogma (no rogue direct writes, proper error handling, tool whitelisting).
- **Safety Audit:** Scans for dangerous shell commands (e.g., `rm -rf`, raw redirections, arbitrary network downloads).
- **Canary Test:** Simulates or runs verification queries via `CanaryHarness` to verify the skill produces expected structured output.
- Updates candidate vetting status to `passed`, `flagged`, or `rejected` with diagnostic reasons.

### FR-6: CLI & Interactive Promotion Interface (`/superconductor:learn`)
- New command `/superconductor:learn` providing:
  - `--list`: Displays all incubating skills, confidence scores, and vetting status.
  - `--inspect <skill>`: Displays the candidate `SKILL.md`, diff against existing skills, and vetting report.
  - `--promote <skill> [--scope project|global]`: Promotes the candidate to active status by moving it to `.agents/skills/<skill>/` (project) or `~/.agents/extensions/superconductor/skills/<skill>/` (global).
  - `--discard <skill>`: Rejects and cleans up candidate skill.
  - `--harvest [--track <id>]`: Manually triggers trajectory harvesting on completed tracks.
- When invoked in interactive sessions, renders an interactive review modal for quick promotion.

### FR-7: Notebook & Task-Store Knowledge Integration
- Integrates with `packages/superconductor-core/src/notebook/note-writer.ts` to record learning lifecycle events:
  - `writeProcedureNote`: Upon skill distillation or promotion.
  - `writeWarningNote`: Upon invariant discovery from failures.
- Emits structured telemetry for continuous learning metrics (skills harvested, promoted, rejected, invariants added).

---

## Non-Functional Requirements

- **NFR-1 (Zero Disruption):** Continuous learning pipelines must not block, slow down, or destabilize active track execution or swarm runs.
- **NFR-2 (Deterministic Governance):** No skill is ever automatically promoted to active execution without passing the automated vetting gate and receiving user or policy-authorized approval.
- **NFR-3 (Modularity & Extensibility):** Synthesizers and distillers must implement pluggable interfaces, allowing custom LLM models or DeerFlow research backends for deep extraction.
- **NFR-4 (Robust Test Coverage):** Unit and integration test coverage ≥ 90% across harvester, synthesizer, distiller, and vetting gate modules.

---

## Acceptance Criteria

- **AC-1:** Completed track runs produce structured trajectory snapshots containing task execution steps, quorum findings, and tool traces.
- **AC-2:** Reflective Invariant Synthesizer accurately mines Quorum remediation cycles into valid `task-store` invariants and notebook warnings.
- **AC-3:** Workflow-to-Skill Distiller generates compliant `SKILL.md` candidates in `.agents/skills/incubating/` with accurate YAML frontmatter and instructions.
- **AC-4:** Incubating skills are completely isolated and not discovered by standard agent tools until promoted.
- **AC-5:** Skill Vetting Gate successfully flags syntax errors, dangerous commands, and Dogma violations in candidate skills.
- **AC-6:** `/superconductor:learn` CLI provides `--list`, `--inspect`, `--promote`, `--discard`, and `--harvest` subcommands.
- **AC-7:** Promoted skills are immediately usable and discoverable in the target workspace.
- **AC-8:** Comprehensive test suite passes with full test coverage across all new modules in `packages/superconductor-core` and `packages/engine`.

---

## Invariants Checklist

- [x] Incubating skills MUST reside in `.agents/skills/incubating/` and MUST NOT be discovered by standard agent runtime until promoted.
- [x] Candidate skills MUST pass automated static validation and Dogma checks before user promotion is permitted.
- [x] Trajectory harvesting MUST sanitize all recorded logs and redact sensitive environment tokens.
- [x] Invariants distilled from failures MUST be deduplicated before insertion into `task-store`.
- [x] Root agent MUST NOT write directly to `packages/*/src/**` during implementation; implementation tasks must be dispatched to Processor subagents.

---

## Out of Scope

- Autonomous unmonitored runtime self-modification of live core extension binaries without compilation.
- Direct real-time weight fine-tuning or LoRA training of underlying LLM checkpoints (this engine focuses on procedural skill, memory, and invariant learning).
- Automated external internet publishing of harvested skills to third-party public registries without explicit user export.
