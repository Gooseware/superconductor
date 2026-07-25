---
name: theme-manager-flow
description: Use when the user wants to modify, add themes, or implement dark mode logic within the Theme Manager.
---

# Theme Manager Flow

## Overview
Guides the creation and modification of themes, including the implementation of "Dark Mode" and high-contrast accessibility variants using the Astryx Theme Builder (`npx astryx theme`) and `<Theme>` provider.

## When to Use
- User says "Add a dark mode".
- User says "Modify the primary color for the admin section".
- User wants to create a new "Season" or "Brand" theme.

## The Process

### 1. Identify Context
Determine if the change is **Global** or **Scoped** (using `contextOverrides`).

### 2. Dark Mode Implementation
If the goal is "Dark Mode":
- Generate dark-mode specific semantic tokens using `npx astryx theme`.
- Ensure the **App Shell** wraps the app in the Astryx `<Theme>` provider.
- Toggle between `mode="light"`, `mode="dark"`, or `mode="system"` on the provider.

### 3. Generative Refinement
Use the Astryx CLI to generate the tokens and persist changes.
Example workflow for adding Dark Mode:
```bash
npx astryx theme --mode dark
```
This updates the theme variables in the `@astryxdesign/core` system or your local `theme.ts`.

### 4. Verification
- Verify that color contrast (WCAG) is maintained in both modes.
- Ensure all components use semantic variables (e.g., `var(--color-background)`) instead of fixed colors.

## Common Mistakes
- Hardcoding specific token hues (e.g., `var(--color-gray-100)`) instead of semantic tokens (`var(--color-background)`).
- Forgetting to pass the `mode` prop to the Astryx `<Theme>` provider.
- Not defining "Active" and "Hover" state tokens for custom brand themes.
