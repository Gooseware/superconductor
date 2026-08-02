# Specification: Matt Pocock Skills Integration

## 1. Overview
Integrate Matt Pocock's "Skills for Real Engineers" into the Superconductor framework. The integration will involve a comprehensive review of all skills in the repository to extract core concepts (like deep grilling, domain modeling, and strict TDD loops) into Superconductor's core commands (`newTrack`, `implement`), as well as porting highly useful tools as standalone installable Superconductor skills (`/superconductor:grill`, `/superconductor:improve-architecture`, etc.).

## 2. Research Notes & Architecture Committee
- **Best Practices Research**: Agent-driven development benefits from narrow, specific tool use. "Grilling" (pre-alignment) drastically reduces semantic drift. Building a ubiquitous language (`CONTEXT.md`) cuts down token usage and improves LLM accuracy.
- **Architecture Committee**: Recommended a sweeping audit of the entire skills repository to "farm out" the best concepts. Useful mechanics should be directly woven into the Superconductor orchestrator logic (e.g., `workflow.md`), while distinct capabilities should be packaged as standalone plugins.

## 3. Functional Requirements

### 3.1. Comprehensive Audit
- **Skill Review**: Conduct a full audit of all skills in Matt Pocock's repository (including `triage`, `to-spec`, `ask-matt`, etc.) to identify and extract any additional high-value concepts for the Superconductor ecosystem. We will adapt and farm out useful concepts even from skills that are tightly coupled to other specific agents.

### 3.2. Core Workflow Enhancements
- **`/superconductor:new-track` Augmentation**: Introduce an optional "Grilling" phase. The AI can dynamically suggest this phase if requirements are ambiguous, or the user can explicitly request it. This phase aligns the domain model before creating `spec.md`.
- **Implementation Loop Augmentation**: Inject concepts from `diagnosing-bugs` and `tdd` into Superconductor's `implement` command. Emphasize strict Red-Green-Refactor cycles and systematic bug diagnosis.

### 3.3. Standalone Skills Porting
- **`/superconductor:grill`**: Port `grill-with-docs` to help establish a project's ubiquitous language (`CONTEXT.md`) and document ADRs (Architecture Decision Records) outside the standard track flow.
- **`/superconductor:improve-architecture`**: Port the `improve-codebase-architecture` skill. It will scan the codebase for decoupling/deepening opportunities and provide interactive refactoring guidance.
- **`/superconductor:to-tickets`**: Provide a utility to break specs into tracer-bullet tickets.
- **Additional Skills**: Port any other skills identified during the comprehensive audit as beneficial standalone commands.

## 4. Non-Functional Requirements
- **Extensibility**: Standalone skills must fit the standard Superconductor plugin architecture.
- **Token Efficiency**: The ubiquitous language generation (CONTEXT.md) must be concise to optimize LLM context limits.

## 5. Acceptance Criteria
- [ ] A full audit of Matt Pocock's skills repository is completed, and useful concepts are extracted (even from agent-specific skills).
- [ ] `/superconductor:new-track` offers an optional "Grilling" phase.
- [ ] `/superconductor:grill` is available as a standalone command.
- [ ] `/superconductor:improve-architecture` is available as a standalone command.
- [ ] `workflow.md` is updated to reflect the augmented TDD and bug-diagnosing workflows.
- [ ] Superconductor's `skills` directory includes the new standalone skills (and any others identified in the audit) for easy installation.

## 6. Out of Scope
- None. All skills will be evaluated for potential concept extraction and adaptation.
