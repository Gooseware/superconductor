---
name: design-os-design-system
description: Use when the user needs to define the visual language (colors, typography) for their product in Design OS.
---

# Design OS Design System

## Overview
Guides the selection of semantic design themes and tokens for the product, integrating with the new Astryx Design System (`@astryxdesign/core`) and the Astryx Theme Builder.

## When to Use
- Roadmap and Data Model are defined.
- `product/design-system/colors.json` or `typography.json` are missing.
- User says "Pick colors" or "Choose fonts".

## The Process

### 1. Style Analysis
Ask the user for the "Vibe" or "Aesthetic" (e.g., Clean/Modern, Brutalist, Playful). Determine if one of the pre-built Astryx themes fits (e.g., `neutral`, `butter`, `chocolate`, `gothic`, `matcha`, `stone`, `y2k`).

### 2. Scaffold Theme
If a pre-built theme is chosen, instruct the user to install it via npm:
```bash
npm install @astryxdesign/theme-{name}
```

If a custom theme is required, instruct the user to use the Astryx Theme Builder CLI:
```bash
npx astryx theme
```
This interactive wizard will generate the semantic color scale tokens (e.g., `--color-background-{hue}`, `--color-border-{hue}`) and output the required theme variables.

### 3. Update the Application Provider
Ensure the main app entry wraps the application in the Astryx `<Theme>` provider and imports the CSS resets:
```tsx
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { Theme } from '@astryxdesign/core/theme';
import { customTheme } from './theme.ts'; // or from @astryxdesign/theme-{name}

function App() {
  return (
    <Theme theme={customTheme} mode="system">
      <YourApp />
    </Theme>
  );
}
```

## Common Mistakes
- Using Tailwind utility names (e.g., `bg-lime-400`) instead of Astryx component props or semantic token variables (`var(--color-*)`).
- Manually overriding CSS variables like `--color-*` in `:root` instead of using `npx astryx theme`.
- Setting manual font sizes instead of relying on the Astryx type scale (e.g., `<Text type="large">`).
