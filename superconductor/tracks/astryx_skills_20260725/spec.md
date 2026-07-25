# Specification: Astryx Agent Skills & Design Orchestrator

## Overview
This track focuses on scaffolding a comprehensive suite of AI agent skills tailored for the Astryx design system and aggregating all existing design-related skills into a central `design-director` orchestrator skill. The goal is to provide agents with deterministic capabilities for component scaffolding, theme generation, multimodal design inference (Jina/Playwright), and advanced vector asset generation (Potrace/SVG), enabling them to build, theme, and maintain modern frontend UIs seamlessly.

## Architectural Committee Recommendations
- Scaffold granular Astryx skills in `~/.agents/skills/` (e.g., `astryx-component-creator`, `astryx-theme-builder`, `astryx-multimodal-ingest`, `astryx-svg-animator`).
- Consolidate the existing `design-os-*` skills into a unified `design-director` skill that dictates the flow of frontend tasks regardless of the underlying UI library (Astryx, Shadcn, Tailwind, etc.).
- Ensure new skills are properly registered in `~/.agents/plugin.json` for agent discoverability.

## Research Notes
- **AI Architect Reality (2026):** Agents require precise context. We must use Dense Mode docs and machine-readable JSON manifests to avoid hallucinations during component generation.
- **Multimodal Extraction:** Leveraging headless browsers (Playwright) and Vision APIs (Jina) bridges the gap between raw pixels and computed CSS/themes.
- **Vectorization:** Procedural transformation of rasters to SVGs via Potrace allows language models to dynamically animate and colorize branding assets.

## Functional Requirements
1. **Astryx Component Creator Skill:** Create an `astryx-component-creator` skill that teaches the agent how to use `astryx template`, `astryx swizzle`, and dense documentation for scaffolding components.
2. **Astryx Theme Builder Skill:** Create an `astryx-theme-builder` skill outlining how to map tokens, bridge Tailwind utilities, and fix known CLI type generation bugs during theme compilation.
3. **Astryx Multimodal Ingest Skill:** Create an `astryx-multimodal-ingest` skill that instructs agents on using the Jina Reader API and Playwright to extract layouts and CSS parameters from URLs and images.
4. **Astryx SVG Animator Skill:** Create an `astryx-svg-animator` skill detailing the use of Sharp, Potrace, and programmatic CSS keyframes to transform and animate bitmap assets.
5. **Design Director Orchestrator Skill:** Synthesize all existing `design-os-*` skills and the new Astryx skills into a master `design-director` skill. This skill will act as the routing engine for all UI tasks, guiding the agent on how to manage theming, structure, and system UI choices (Astryx, Shadcn, Tailwind) over the lifecycle of a project.
6. **Skill Refactoring:** Refactor the internal logic of the existing `design-os-*` skills where well-researched rationale exists to modernize them alongside Astryx capabilities.

## Non-Functional Requirements
- All new skills must include robust `SKILL.md` instruction files formatted for agent ingestion.
- The `~/.agents/plugin.json` must be updated to expose the newly created skills.
- The instructions must enforce non-interactive CLI execution (e.g., `npx -y`) for autonomous agent compatibility.

## Acceptance Criteria
- [ ] 4 new Astryx-specific skills are generated and populated in `~/.agents/skills/`.
- [ ] 1 new `design-director` orchestrator skill is created in `~/.agents/skills/`, summarizing the workflow and linking to other design skills.
- [ ] Existing `design-os-*` skills are evaluated and refactored if justified.
- [ ] The `plugin.json` in `~/.agents` is updated to include all new skills.
- [ ] A review panel confirms that the generated `SKILL.md` files provide clear, deterministic guidance for AI agents.

## Out of Scope
- Actually executing the Astryx CLI or writing application code (this track focuses strictly on creating the *skills* that teach agents how to do so).
