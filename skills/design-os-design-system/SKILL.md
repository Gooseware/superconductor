---
name: design-os-design-system
description: Use when the user needs to define the visual language (colors, typography) for their product in Design OS.
---

# Design OS Design System

## Overview
Guides the selection of semantic design themes and tokens for the product, integrating with the Design OS Kernel (`superconductor-kernel`) and the `set_theme` / `registry_install` MCP tools.

## When to Use
- Roadmap and Data Model are defined.
- `product/design-system/colors.json` or `typography.json` are missing.
- User says "Pick colors" or "Choose fonts".

## The Process

### 1. Style Analysis
Ask the user for the "Vibe" or "Aesthetic" (e.g., Clean/Modern, Brutalist, Playful). Determine if one of the pre-built themes fits (e.g., `neutral`, `butter`, `chocolate`, `gothic`, `matcha`, `stone`, `y2k`).

### 2. Scaffold Theme
If a pre-built theme is chosen, configure it using the `set_theme` MCP tool:
```json
{
  "theme": "<theme_name>",
  "mode": "system"
}
```

If custom tokens or component blocks are required, discover and install them using `registry_list_blocks` and `registry_install`.
This generates the semantic color scale tokens (e.g., `--color-background-{hue}`, `--color-border-{hue}`) and outputs the required theme variables.

### 3. Update the Application Provider
Ensure the main app entry wraps the application in the `<Theme>` provider and imports the CSS resets and design tokens:
```tsx
import "./theme.css";
import { Theme } from './theme';
import { customTheme } from './theme.ts';

function App() {
  return (
    <Theme theme={customTheme} mode="system">
      <YourApp />
    </Theme>
  );
}
```

### 4. Enforce Dogma Compliance
Run `registry_validate_file` or `registry_fix_dogma` on generated/modified files to ensure strict compliance with Design OS standards.

## Common Mistakes
- Using hardcoded utility names (e.g., `bg-lime-400`) instead of component props or semantic token variables (`var(--color-*)`).
- Manually overriding CSS variables like `--color-*` in `:root` instead of using the `set_theme` tool.
- Setting manual font sizes instead of relying on the standard type scale (e.g., `<Text type="large">`).
