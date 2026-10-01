# Specification: DRY Intelligence & Architecture Refactoring Swarm

## Overview
This track implements a foundational DRY (Don't Repeat Yourself) constraint system across Superconductor, coupled with a multi-agent architectural refactoring swarm. It integrates Design OS Kernel component registries and local codebase symbol awareness into the planning phase, builds an interactive Astryx-based React app for the `improve-architecture` report, and encodes anti-reinvention heuristics directly into the Quorum review pipeline.

## Architecture Committee Report
The current `improve-architecture` skill operates serially and produces static HTML reports, limiting its scalability on large codebases. Furthermore, planning and review pipelines lack strict enforcement of component reuse, leading to "reinvention" of existing UI blocks. By leveraging the Intelligence System (coupling, dependency surfaces, and complexity hotspots) to partition analysis across a parallel swarm, we can drastically accelerate refactoring discovery. Upgrading the report to an interactive Astryx application allows developers to seamlessly select refactoring candidates and immediately spawn new Superconductor tracks. Finally, extending the Adversarial Reviewer to audit PRs against the component registry acts as an automated governance layer against non-DRY contributions.

## Functional Requirements
- **FR-1:** Agents MUST resolve available components and blocks via `registry_recommend`, `registry_list_blocks`, and `06_api_surface.toon` during the planning phase.
- **FR-2:** The `plan.md` task schema MUST support and enforce a `REUSES: [components]` metadata tag to explicitly state which existing components handle the required functionality.
- **FR-3:** The `skills/improve-architecture/SKILL.md` MUST be updated to orchestrate a multi-agent swarm, partitioning the codebase based on coupling clusters (`04_coupling.json`), dependency surfaces (`08_dependency_surface.json`), and complexity hotspots (`03_complexity.json`).
- **FR-4:** The `improve-architecture` output MUST be an interactive frontend application built with Astryx components, displaying before/after architectures and actionable checkboxes for generating track proposals.
- **FR-5:** The `adversarial-reviewer` MUST include a new heuristic (Shenanigan #9: Component Reinvention) to automatically reject PRs that hand-roll functionality available in the component registry.

## Non-Functional Requirements
- **Performance:** Multi-agent architecture scanning must complete significantly faster than the legacy serial scanner.
- **Usability:** The Astryx interactive report must provide clear visualizations (e.g., mermaid diagrams or custom visualizers) and one-click track generation functionality.
- **Extensibility:** The DRY enforcement logic in Quorum must be designed such that additional registry sources or symbol indices can be easily integrated.

## Acceptance Criteria
- **AC-1:** Planning agents successfully query the component registry and local symbol index to populate the `REUSES:` tag in `plan.md` task cards.
- **AC-2:** The swarm-based `improve-architecture` scanner correctly partitions analysis workloads using Intelligence System JSON artifacts.
- **AC-3:** Running the `improve-architecture` skill launches the new interactive Astryx application with populated refactoring candidates.
- **AC-4:** Users can interact with the Astryx application to select candidates and trigger track generation.
- **AC-5:** Submitting code that reimplements a known registered component triggers a `NEEDS_FIXES` from the Adversarial Reviewer citing "Shenanigan #9".
- **AC-6:** All modified skills and reviewers pass existing unit and integration test suites.

## Out of Scope
- Expanding the Intelligence System metrics beyond coupling, dependencies, and complexity.
- Modifying the underlying source code of the UI components themselves.
- Automatic merging of generated tracks without user approval.
