---
name: design-os-design-system
description: Use when the user needs to define the visual language (colors, typography) for their product in Design OS.
---

# Design OS Design System

## Overview
Guides the selection of semantic design tokens (HSL/OKLCH) for the product, integrated with the SQLite-backed `theme-manager` system.

## When to Use
- Roadmap and Data Model are defined.
- `product/design-system/colors.json` or `typography.json` are missing.
- User says "Pick colors" or "Choose fonts".

## The Process

### 1. Style Analysis
Ask the user for the "Vibe" or "Aesthetic" (e.g., Clean/Modern, Brutalist, Playful).

### 2. Propose Semantic Tokens
Propose **Semantic HSL values** that align with the `theme-manager` schema, including states and contexts:
- **Core**: `primary`, `foreground`, `background`, `border`, `radius`.
- **States**: `primaryHover`, `primaryActive`, `disabled`, `disabledForeground`.
- **Alerts**: `success`, `warning`, `info`, `destructive`.
- **Fonts**: `fontSans`, `fontSerif`.
- **Contexts**: `contextOverrides` for sections like `admin` or `landing`.

Example for overrides:
```json
{
  "contextOverrides": {
    "admin": {
      "primary": "217 91% 60%",
      "background": "240 5% 98%"
    }
  }
}
```

### 3. Update the Kernel
Use the **`set_theme`** MCP tool to store these tokens. It will automatically merge with the existing theme.

### 4. Create Files
Write to `product/design-system/theme.json`:
```json
{
  "primary": "142 71% 45%",
  "foreground": "20 14% 4%",
  "background": "0 0% 100%",
  "radius": "0.5rem",
  "fontSans": "Inter",
  "fontSerif": "Montserrat"
}
```

## Common Mistakes
- Using Tailwind utility names (e.g., `bg-lime-400`) instead of raw HSL/OKLCH values for tokens.
- Forgetting to call `set_theme` to persist changes for the AI agent.
- Choosing fonts that aren't available on Google Fonts.
