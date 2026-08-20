# Specification: Design Heuristics Skill

## Overview

Create a new bundled Superconductor-internal skill (`design-heuristics`) that codifies visual design rules for UI/UX generation. The skill uses a progressive disclosure structure: a compact core (~25 rules) always loads on activation; three reference documents (color, layout, motion) load on demand only when the track involves UI-heavy work. The `implement` command auto-suggests activating this skill when a track spec contains UI-related keywords.

## Motivation

Based on research (UPDATES.md) describing the StyleSeed framework: without strict, formalized design parameters, AI-generated UIs default to average aesthetic vectors from training data, producing "AI slop" — generic layouts, disjointed color palettes, poor conversion psychology. Codified heuristics injected as a progressively-disclosed skill solve this without polluting the base context window.

## Functional Requirements

### FR-1: Core Skill File (`skills/design-heuristics/SKILL.md`)

- MUST have valid YAML frontmatter with `name: design-heuristics` and a keyword-rich description triggering on UI/UX generation tasks.
- MUST contain ~25 core visual rules organized into categories: Color Discipline, Spatial Rhythm, Information Hierarchy, Interactive Feedback, Accessibility.
- MUST reference the three reference documents for on-demand deep-dive.
- Key rules to include:
  - Never use pure black (#000000) for typography; use #2A2A2A (contrast 15:1, WCAG AAA)
  - Restrict to a single accent color; secondary elements use a 5-level grayscale (#2A through #9B)
  - Never repeat the exact same section layout consecutively; alternate tall/compact
  - Quantitative data displays: value font-size MUST be 2x the unit label font-size
  - Card elevation via background contrast (e.g. white card #FFFFFF on #FAFAFA page), not borders
  - Box shadow opacity capped at 4% maximum
  - No identical adjacent metric cards; stagger component types
  - Entry animations: 200ms duration with spring physics
  - Exit animations: ease-out curve
  - Interactive tap/click: scale to exactly 0.98
  - WCAG 2.2 AA minimum; keyboard-first interactions
  - No color-only signals (always pair with icon or text)

### FR-2: Reference Documents (On-Demand)

- `skills/design-heuristics/references/color-rules.md`: Exhaustive color constraints with hex values, contrast ratios, and rationale.
- `skills/design-heuristics/references/layout-rules.md`: Spatial rhythm, section alternation, card contrast rules, grid patterns.
- `skills/design-heuristics/references/motion-rules.md`: Animation physics reference with CSS custom property examples and timing values.
- These files MUST be referenced in `SKILL.md` with explicit instruction: load them only when the track spec or plan contains UI-heavy signals.

### FR-3: Skill Catalog Registration (`skills/catalog.md`)

- Add a `design-heuristics` entry with:
  - Description matching the SKILL.md frontmatter
  - Detection signals: keywords `UI`, `dashboard`, `component`, `frontend`, `page`, `interface`, `layout`, `design`
  - Party: `1p` (first-party)

### FR-4: Auto-Activation in `implement.toml`

- In Section 3.0.e (Activate Relevant Skills), add an explicit check:
  - If the track spec or plan contains any of the UI keywords (case-insensitive: UI, dashboard, component, frontend, page, interface, layout, design), the agent MUST recommend activating the `design-heuristics` skill.
  - The suggestion MUST be made via `ask_user` before proceeding.

## Non-Functional Requirements

- The 25 core rules MUST fit within 600 tokens to preserve context budget.
- Reference documents are structured for selective loading — the agent explicitly calls out which reference it is loading and why.
- The skill MUST NOT conflict with existing `frontend-design` skill; it complements it with mathematical constraints.

## Acceptance Criteria

- `skills/design-heuristics/SKILL.md` passes frontmatter validation (name matches directory name).
- When `/superconductor:implement` runs a UI-related track, it recommends activating the skill.
- Core rules loaded on activation are under 600 tokens.
- Reference docs are accessible and correctly linked.
- `skills/catalog.md` contains the new entry with correct detection signals.

## Out of Scope

- Automated CSS/HTML linting against the rules (a future `/ss-lint` equivalent).
- Integration with external design token systems or Figma.
- React component library (shadcn/ui or otherwise).
