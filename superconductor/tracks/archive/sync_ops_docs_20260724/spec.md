# Track Specification: Synchronize Operational Documentation

## 1. Overview
Update the Superconductor `implement` skill to automatically synchronize and maintain operational documentation at the end of every completed track. This ensures that instructions on how to build, run, and maintain the system (both for humans and AI agents) never fall out of date as the codebase evolves.

## 2. Research Notes & Architecture Committee Recommendations
- **Separation of Concerns:** Human-facing documentation (`README.md`) should be kept separate from machine/agent-facing documentation (`superconductor/AGENTS.md` or similar agent directives). 
- **Drift Prevention:** Synchronizing documentation at the track-completion boundary is the most effective way to prevent "documentation drift".

## 3. Functional Requirements
1. **Update `skills/implement/SKILL.md`:** 
   - Modify Phase `4.0 SYNCHRONIZE PROJECT DOCUMENTATION & KERNEL ANALYSIS`.
   - Add a step to analyze the track's specification and implementation plan for changes to build processes, environment setups, or system operation requirements.
2. **Sync Root `README.md`:**
   - If changes to human-facing operational steps are detected, prompt the user with a proposed diff to update the root `README.md`.
3. **Sync Agent Directives (`superconductor/AGENTS.md`):**
   - If changes affect how AI agents should interact with, build, or test the repository, prompt the user with a proposed diff to update `superconductor/AGENTS.md` (or the equivalent agent directive file).
4. **Approval Flow:**
   - Use the existing "Propose and Confirm" `ask_user` loop (displaying diffs for approval) before writing to disk, ensuring headless mode compatibility.

## 4. Non-Functional Requirements
- **Consistency:** The new synchronization steps must strictly follow the existing pattern used for `product.md` and `tech-stack.md`.

## 5. Out of Scope
- Modifying how the track execution itself works.
- Syncing API documentation or code-level JSDoc/TSDoc (this is handled during implementation).
