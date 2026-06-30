---
name: design-os-i18n
description: Use when the user needs to plan for internationalization (i18n), localization (l10n), multi-language support, or currency handling in Design OS.
---

# Design OS i18n

## Overview
Guides the agent through planning the internationalization and currency strategy for the product. This ensures the app is architected to handle multiple locales and financial formats from the start.

## When to Use
- User mentions "multiple languages", "translation", or "global support".
- User mentions "currency", "prices", or "payments".
- Missing `product/i18n/spec.md`.

## The Process

### 1. Gather Strategy Input
Ask the user about their localization goals:
"I see you want to support multiple languages and currencies. How many regions are you targeting initially? Are there specific languages or currencies that are a priority?"

### 2. Propose Default Architecture
Assume and confirm the following patterns:
- **Language Detection**: Automatically detect based on `navigator.language` (browser preference).
- **Default Locale**: `en` (English).
- **Region Specifics**: Support sub-locales (e.g., `en-US` vs `en-GB`) for specific date formats or terminology.

### 3. Currency Planning
Ask targeted questions about currency handling:
- "Which currencies do you need to support (e.g., USD, EUR, GBP)?"
- "Do you need dynamic price conversion or fixed regional pricing?"
- "Should the currency be tied to the selected language or the user's IP/Location?"

### 4. Create the Spec
Write to `product/i18n/spec.md` using this format:

```markdown
# Internationalization & Currency Spec

## Language Strategy
- **Detection**: Browser preference (`navigator.language`)
- **Default**: `en`
- **Supported Locales**: [list, e.g., en, es, fr]
- **Region Specifics**: [e.g., en-US, en-GB]

## Currency Strategy
- **Base Currency**: [e.g., USD]
- **Supported Currencies**: [list]
- **Formatting**: [e.g., Intl.NumberFormat]

## Implementation Notes
- Store translations in `public/locales/`
- Use the `Intl` API for dates and currency
```

## Common Mistakes
- Hardcoding strings instead of using translation keys.
- Forgetting that different regions might use the same language but different currencies.
- Not specifying a fallback language.
