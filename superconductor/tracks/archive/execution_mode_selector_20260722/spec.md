# Specification: Implement Execution Mode Selector
## Interactive Choice for Swarm vs Sequential Execution

---

## 1. Overview

Currently, when `/superconductor:implement` runs, section `4.a` checks for the `swarm-orchestrate` skill. If present, it asks the user:
> *"I've detected the `swarm-orchestrate` skill. Would you like to launch the autonomous multi-agent swarm (Dreamer -> Processors -> Reviewers -> Oracle) to complete this track with zero-touch intermediate loops?"*

This track updates section `4.a` of the `implement` skill to explicitly present an interactive choice using `ask_user` with clear options for:
1. **Multi-Agent Swarm (Recommended)** — Autonomous swarm execution (auto-selecting `parallel` fan-out or `pipeline` assembly-line based on plan structure).
2. **Sequential (Standard)** — Single-agent sequential task execution following standard workflow checkpoints.

---

## 2. Functional Requirements

### FR-1: Interactive Execution Mode Choice
- When `swarm-orchestrate` skill is detected during `/superconductor:implement`:
  - Present an interactive choice prompt using `ask_user`.
  - Header: `"Execution Mode"`
  - Options:
    - `Multi-Agent Swarm (Recommended)`: Launches autonomous multi-agent swarm (`swarm-orchestrate`). Automatically handles parallel or pipeline assembly-line execution.
    - `Sequential (Standard)`: Executes tasks sequentially using a single model with standard manual review checkpoints.

### FR-2: Headless Mode Default
- In `--headless` mode, automatically default to `Multi-Agent Swarm` without asking.

### FR-3: Skill Synchronization
- Update both local repository (`skills/implement/SKILL.md`) and plugin location (`~/.gemini/config/plugins/superconductor/skills/implement/SKILL.md`).

---

## 3. Acceptance Criteria

- [ ] `skills/implement/SKILL.md` Section 4.a presents explicit choice between Swarm and Sequential execution.
- [ ] Plugin location `~/.gemini/config/plugins/superconductor/skills/implement/SKILL.md` is synced.
- [ ] `skill-line-count.test.ts` passes (all SKILL.md ≤ 500 lines).
- [ ] All 171 existing engine tests pass.
- [ ] Track registered in `superconductor/tracks.md` and merged to `main`.
