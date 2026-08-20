# Implementation Plan: Design Heuristics Skill

## Phase 0: Skill Structure & Core Rules

- [x] Task: Create `skills/design-heuristics/SKILL.md` with 25 core rules [TIER-3]
    - [x] Sub-task: Write YAML frontmatter (name, description with UI keyword triggers)
    - [x] Sub-task: Write Color Discipline section (5 rules: typography near-black, single accent, grayscale restraint, card contrast, shadow opacity cap)
    - [x] Sub-task: Write Spatial Rhythm section (5 rules: section alternation, 2:1 data-to-label ratio, consistent grid, no identical adjacent cards, whitespace breathing room)
    - [x] Sub-task: Write Information Hierarchy section (4 rules: elevation via contrast not borders, reading-order structure, single focal point per section, progressive disclosure)
    - [x] Sub-task: Write Interactive Feedback section (5 rules: 200ms spring entry, ease-out exit, 0.98 tap scale, hover lift max 2px, focus ring always visible)
    - [x] Sub-task: Write Accessibility section (6 rules: WCAG 2.2 AA minimum, keyboard-first, no color-only signals, 44px minimum tap targets, alt text for all images, form labels always visible)
    - [x] Sub-task: Add "On-Demand References" section linking to the three reference docs with loading instructions
    - [x] Sub-task: Verify core rules fit within 600 tokens
- [~] Task: User Manual Verification 'Phase 0: Skill Structure & Core Rules' (Protocol in workflow.md)

## Phase 1: Reference Documents

- [x] Task: Create `skills/design-heuristics/references/color-rules.md` [TIER-3]
    - [x] Sub-task: Exhaustive color table: hex values, contrast ratios, use cases, WCAG level
    - [x] Sub-task: Near-black typography system (#2A2A2A → #6B6B6B → #9B9B9B progression)
    - [x] Sub-task: Accent color application rules (when/how to use the single accent)
    - [x] Sub-task: Dark mode equivalents for each color rule
- [x] Task: Create `skills/design-heuristics/references/layout-rules.md` [TIER-3]
    - [x] Sub-task: Section alternation patterns with examples (hero/compact/feature/compact)
    - [x] Sub-task: Card elevation table: background color combinations with contrast ratios
    - [x] Sub-task: Grid and spacing system (8px base unit, modular scale)
    - [x] Sub-task: Component stagger rules for dashboards (metric card variety requirements)
- [x] Task: Create `skills/design-heuristics/references/motion-rules.md` [TIER-3]
    - [x] Sub-task: Spring physics specification (stiffness, damping, mass values)
    - [x] Sub-task: CSS custom property examples for animation tokens
    - [x] Sub-task: Timing reference table (enter/exit/micro-interaction/transition durations)
    - [x] Sub-task: GSAP equivalents for each CSS animation pattern
- [x] Task: User Manual Verification 'Phase 1: Reference Documents' (Protocol in workflow.md)

## Phase 2: Catalog & Auto-Activation

- [x] Task: Add `design-heuristics` entry to `skills/catalog.md` [TIER-3]
    - [x] Sub-task: Write entry with description, URL, party (1p), detection signals
    - [x] Sub-task: Verify detection signal keywords cover all major UI use cases
- [x] Task: Update `implement.toml` Section 3.0.e for UI keyword auto-detection [TIER-3]
    - [x] Sub-task: Add UI keyword list (UI, dashboard, component, frontend, page, interface, layout, design)
    - [x] Sub-task: Add conditional check: if any keyword found in spec/plan content, suggest design-heuristics activation
    - [x] Sub-task: Wire suggestion through `ask_user` tool before proceeding with implementation
- [x] Task: User Manual Verification 'Phase 2: Catalog & Auto-Activation' (Protocol in workflow.md)
