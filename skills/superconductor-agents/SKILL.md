---
name: superconductor-agents
description: Protocol for Superconductor agents to operate within the Superconductor spec-driven framework
---

## 1.0 SYSTEM DIRECTIVE
You are a Superconductor agent (Dreamer, Processor, Reviewer, or Oracle) operating within a project that uses the Superconductor spec-driven development framework. You MUST follow these protocols to align your generation, testing, reviews, and plan tracking with the Superconductor codebase structure.

---

## 2.0 PROTOCOLS FOR SUPERCONDUCTOR AGENTS

### 2.1 Context Ingestion & Project Setup
Whenever a Superconductor agent starts a task:
1. **Locate Index:** Find the project root index file at `superconductor/index.md` or track index file at `superconductor/tracks/<track_id>/index.md`.
2. **Read Specifications:** Read `superconductor/tracks/<track_id>/spec.md` to establish the exact system constraints and goals.
3. **Read Implementation Plan:** Read `superconductor/tracks/<track_id>/plan.md` to see the roadmap of tasks and sub-tasks.
4. **Identify Active Branch:** Ensure you are executing code edits on the branch matching `track/<track_id>`. Do NOT make edits on the `main` or `dev` branches directly.

### 2.2 Implementation & TDD Workflow (For Processor Agents)
When implementing a task assigned in `plan.md`:
1. **Red Phase (failing tests first):**
   - Create a test file (e.g., `tests/<feature>.test.js` or matching project styles).
   - Write unit tests covering both positive and negative cases.
   - Run tests and verify they fail.
2. **Green Phase (make tests pass):**
   - Write implementation code to satisfy the failing tests.
   - Re-run tests and confirm success.
3. **Refactor Phase:**
   - Optimize code readability, styling, and DRY violations.
   - Re-run tests.
4. **Commit & Log:**
   - Commit code changes with the message format: `track(<track_id>): phase - description`.
   - Update `plan.md` tasks status from `[ ]` to `[x]` and append the short git commit SHA.

### 2.3 Review & Audit Format (For Reviewer & Oracle Agents)
When providing feedback on another agent's work:
1. **Format Report:** Output the audit feedback exactly according to the template in `templates/oracle_review_prompt.md`.
2. **Identify Auto-Fixes:** Clearly list code recommendations as "Auto-Fix Candidates" containing precise Git diffs.
3. **Assign Verdict:** Provide a final verdict of either `[Ready]` or `[Needs Fixes]`.

### 2.4 Plan Updates from Subagents
When a task is complete, update `superconductor/tracks/<track_id>/plan.md`:
- Locate the task description.
- Replace `[~] Task: <Task>` or `[ ] Task: <Task>` with `[x] Task: <Task> (SHA: <7-char-sha>)`.
- If a phase concludes, update the phase header to include `[checkpoint: <checkpoint-sha>]` after running the verification checks.

### 2.5 Orchestrator Behavior

## Orchestrator Override Protection
If a Phase Gate reviewer reports that fixes from a previous RESOLVED are still not applied:
- NEVER terminate the reviewer and assume the code is correct.
- ALWAYS treat the reviewer's persistent finding as ground truth.
- Escalate to Oracle tier immediately with both the Processor's RESOLVED claim and the Reviewer's finding.
- The Oracle arbitrates — the Orchestrator does not override unilaterally.

