---
name: theme-manager-flow
description: Use when the user wants to modify, add themes, or implement dark mode logic within the Theme Manager.
---

# Theme Manager Flow

## Overview
Guides the creation and modification of themes, including the implementation of "Dark Mode" and high-contrast accessibility variants.

## When to Use
- User says "Add a dark mode".
- User says "Modify the primary color for the admin section".
- User wants to create a new "Season" or "Brand" theme.

## The Process

### 1. Identify Context
Determine if the change is **Global** or **Scoped** (using `contextOverrides`).

### 2. Dark Mode Implementation
If the goal is "Dark Mode":
- Define a `.dark` context override.
- Map dark-mode specific HSL values (e.g., lower lightness for backgrounds, higher for foregrounds).
- Ensure the **App Shell** has a toggle tool that adds/removes the `.dark` class from the `<html>` or `<body>`.

### 3. Generative Refinement
Use the **`set_theme`** tool to persist changes.
Example for adding Dark Mode:
```json
{
  "contextOverrides": {
    "dark": {
      "background": "220 15% 10%",
      "foreground": "220 5% 95%",
      "primary": "220 90% 60%"
    }
  }
}
```

### 4. Verification
- Verify that color contrast (WCAG) is maintained in both modes.
- Use `registry_validate_file` on components to ensure they use variables (`hsl(var(--background))`) instead of fixed colors.

## Common Mistakes
- Hardcoding `bg-white` instead of `bg-background`.
- Forgetting to sync the SQLite database with the `product/design-system/theme.json` file.
- Not defining "Active" and "Hover" states for the dark theme.
