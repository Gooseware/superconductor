# Specification: Orchestrator Self-Healing & Brownfield Quorum Reviews

## 1. Overview
This track enhances the Superconductor framework to gracefully handle two major edge cases: agents falling off the track protocol, and running reviews on brownfield/non-Superconductor codebases. It introduces a "recovery daemon" to enforce track context, and upgrades the `/superconductor:review` skill to orchestrate quorum reviews. For large or un-initialized codebases, it leverages the Intelligence Layer to chunk the codebase by dependency analysis, run targeted review-remediate loops per chunk, and synthesize foundational context documents (`product.md` and `tech-stack.md`).

## 2. Research Notes
*   **State of the Art (2026):** Agentic swarm orchestration has moved beyond monolithic agents to specialized, stateless agents. Multi-agent swarms rely on firm "org charts" and handoff protocols.
*   **Self-Healing:** Modern systems use observability and background recovery daemons to re-inject context (like the track's `plan.md`) when agents deviate.
*   **Agentic Chunking:** Codebases must be chunked semantically (using ASTs or dependency graphs) rather than by raw token counts, ensuring the reviewer LLM has the right localized context to function properly.

## 3. Architecture Committee Recommendations
*   **Dreamer (Architecture):** We should integrate the "recovery daemon" as a middleware or wrapper in the swarm orchestrator (`swarm-orchestrate.ts`). The codebase chunker should utilize the existing `IntelligenceSnapshotReader` and `DependencyAnalyzer` to partition files.
*   **Reviewer (Security & Perf):** Ensure the recovery daemon doesn't result in infinite looping (i.e. if re-injecting the plan doesn't fix the agent's behavior, it must gracefully fail or escalate). When generating the synthetic `product.md`, ensure no sensitive secrets or environment details are accidentally persisted.

## 4. Functional Requirements
*   **Recovery Daemon:** The swarm orchestrator must monitor agent actions. If it detects an LLM straying from the track plan (e.g. attempting un-planned architectural shifts or losing awareness of the phase), it must forcibly re-inject the track's `plan.md` context.
*   **Quorum Review Setup:** Running `/superconductor:review` must trigger a full 4-panel Quorum Review (Correctness, Security, Adversarial, Regression).
*   **Remediation Swarm:** The review process must loop automatically (`review > remediate > review`) using a Remediation Processor until all checks are green.
*   **Brownfield Intelligence Chunking:** If no track history or Superconductor context exists, the system must chunk the codebase by module/directory using the Intelligence Layer's dependency analysis.
*   **Synthetic Onboarding:** For brownfield sweeps, the Intelligence Layer must generate a synthetic `superconductor/product.md` and `superconductor/tech-stack.md` to permanently onboard the project.

## 5. Non-Functional Requirements
*   **Performance:** Codebase chunking should be optimized to fit well within the context limits (e.g., max 100k tokens per chunk) to avoid model degradation.
*   **Safety:** The remediation loop must have a configurable maximum iteration limit (e.g., 3 loops) to prevent run-away swarm behavior.

## 6. Acceptance Criteria
*   [ ] A recovery daemon correctly detects an agent that has "fallen off track" and successfully realigns it by re-injecting the plan.
*   [ ] `/superconductor:review` executes a full quorum review and enters a remediation loop if violations are found.
*   [ ] The codebase chunking logic correctly partitions a large sample project based on dependency edges rather than arbitrary file sizes.
*   [ ] Running a review on a naked repository successfully generates `product.md` and `tech-stack.md` based on semantic analysis.

## 7. Out of Scope
*   Creating entirely new reviewer agents (we will use the existing Quorum agents).
*   Handling multi-repository codebase chunking (monorepos/polyrepos).
