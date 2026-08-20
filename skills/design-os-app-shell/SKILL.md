---
name: design-os-app-shell
description: Use when the user needs to design the persistent layout and navigation (the "chrome") of their product in Design OS.
---

# Design OS Application Shell

## Overview
Guides the design of the global navigation, user menus, and overall layout pattern using Design OS frame components (e.g., `AppShell`, `SideNav`, `TopNav`, `Layout`).

## When to Use
- Design system tokens are defined.
- `product/shell/spec.md` is missing.
- User says "Design the layout" or "Setup navigation".

## The Process

### 1. Pattern Selection
Use the `registry_list_blocks` MCP tool (or `registry_recommend`) to discover available layout archetype templates and shell components from the registry.
Pick the best layout pattern based on the Roadmap (e.g., Tracker/work tool uses `AppShell` + `SideNav`, Media library uses `AppShell` + `TopNav`).

### 2. Layout Discovery and Navigation
Scaffold or install the chosen template using the `registry_install` MCP tool (or inspect via `registry_get_block_wiring`).
Define the main links for the global navigation.

### 3. Create the Spec
Write to `product/shell/spec.md`:
```markdown
# Application Shell Spec

## Layout Frame
Describe the layout pattern and the frame components to be used (e.g., `<AppShell>`, `<SideNav>`, `<LayoutPanel>`).

## Global Navigation
- **Home**: [Path]
- **[Section 1]**: [Path]

## Responsive Contract
- > 1024px: [e.g., nav 256px | content flex]
- <= 1024px: [e.g., inspector overlays content]
- <= 768px: [e.g., nav collapses into MobileNav drawer]
```

### 4. Implementation
Use the `registry_install` MCP tool to install the necessary layout components into the project.
Run `registry_validate_file` or `registry_fix_dogma` to enforce dogma compliance.
Do not build layouts using raw `<div>` tags. Use layout components (e.g., `Stack`, `Grid`, `Layout`, `AppShell`).

## Common Mistakes
- Using `<div>` tags instead of structured Layout components (`Stack`, `Grid`, `Layout`, etc.).
- Skipping the responsive contract before building.
- Manually recreating elements that exist in the component library (use `registry_list_blocks`).
