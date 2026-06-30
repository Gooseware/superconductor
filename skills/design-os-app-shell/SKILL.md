---
name: design-os-app-shell
description: Use when the user needs to design the persistent layout and navigation (the "chrome") of their product in Design OS.
---

# Design OS Application Shell

## Overview
Guides the design of the global navigation, user menus, and overall layout pattern (Sidebar vs Top-Nav).

## When to Use
- Design system tokens are defined.
- `product/shell/spec.md` is missing.
- User says "Design the layout" or "Setup navigation".

## The Process

### 1. Pattern Selection
Propose a layout pattern based on the Roadmap (e.g., Sidebar is better for complex apps, Top-Nav for simple marketing/tools).

### 2. Navigation Mapping
Define the main links (mapping to the Roadmap sections).

### 3. Create the Spec
Write to `product/shell/spec.md`:
```markdown
# Application Shell Spec

## Layout Pattern
[Sidebar | Top-Nav]

## Global Navigation
- **Home**: [Path]
- **[Section 1]**: [Path]

## Component Architecture
The system MUST follow the standard Design OS layout terminology:
- **Layouts**: Global shells and persistent wrappers (e.g., `AppShell.tsx`).
- **Pages**: Top-level route components.
- **Atoms**: Primitive UI elements (Button, Input, Label).
- **Molecules**: Groups of atoms (SearchField, CardHeader).
- **Organisms**: Complex UI sections (Header, Sidebar, ThemeSwitcher).
- **Forms**: Data entry groups with validation.
- **Utils**: Shared helper functions (CN, Date Formatters).

## Directory Structure
- `app/components/layouts/`
- `app/components/pages/`
- `app/components/atoms/`
- `app/components/molecules/`
- `app/components/organisms/`
- `app/components/forms/`
- `app/utils/`
```

### 4. Implementation
Use the `registry_recommend` MCP tool to find matching primitives. Ensure all new components are placed in their respective folders.

## Common Mistakes
- Including too much logic in the shell.
- Forgetting the user profile/auth menu.
- Non-responsive designs.
