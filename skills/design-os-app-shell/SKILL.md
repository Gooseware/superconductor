---
name: design-os-app-shell
description: Use when the user needs to design the persistent layout and navigation (the "chrome") of their product in Design OS.
---

# Design OS Application Shell

## Overview
Guides the design of the global navigation, user menus, and overall layout pattern using the Astryx Design System frame components (e.g., `AppShell`, `SideNav`, `TopNav`, `Layout`).

## When to Use
- Design system tokens are defined.
- `product/shell/spec.md` is missing.
- User says "Design the layout" or "Setup navigation".

## The Process

### 1. Pattern Selection
Use the Astryx CLI to discover available layout archetype templates:
`npx astryx template --list`
Pick the best layout pattern based on the Roadmap (e.g., Tracker/work tool uses `AppShell` + `SideNav`, Media library uses `AppShell` + `TopNav`).

### 2. Layout Discovery and Navigation
Scaffold or study the structure of the chosen template:
`npx astryx template <name> --skeleton`
Define the main links for the global navigation.

### 3. Create the Spec
Write to `product/shell/spec.md`:
```markdown
# Application Shell Spec

## Astryx Frame
Describe the layout pattern and the Astryx frame components to be used (e.g., `<AppShell>`, `<SideNav>`, `<LayoutPanel>`).

## Global Navigation
- **Home**: [Path]
- **[Section 1]**: [Path]

## Responsive Contract
- > 1024px: [e.g., nav 256px | content flex]
- <= 1024px: [e.g., inspector overlays content]
- <= 768px: [e.g., nav collapses into MobileNav drawer]
```

### 4. Implementation
Use the Astryx CLI to fetch the necessary components:
`npx astryx build "layout shell with sidebar and header"`
Do not build layouts using `<div>` tags. Use Astryx layout components (e.g., `Stack`, `Grid`, `Layout`, `AppShell`).

## Common Mistakes
- Using `<div>` tags instead of Astryx Layout components (`Stack`, `Grid`, `Layout`, etc.).
- Skipping the responsive contract before building.
- Manually recreating elements that exist in the Astryx component library (use `npx astryx search`).
