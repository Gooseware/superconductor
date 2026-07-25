---
name: design-os-enhance
description: Use when the user wants to use Design OS to enhance, update, or refactor an existing application (brownfield project).
---

# Design OS Flow Enhancement

## Overview
Guides the process of integrating Design OS logic into an existing application to improve UX flows, refactor components, or align styling with the Theme Manager.

## When to Use
- User says "Enhance my existing app" or "Refactor this flow".
- User provides existing files to "Design OS-ify".
- Project has pre-existing `src/` or `app/` code outside the Design OS flow.

## The Process

### 1. Context Analysis
- Use `ls` and `grep` to understand the existing project structure.
- Identify core "Flows" (e.g., Auth, Checkout, Dashboard).
- Map existing components to the **Registry**.

### 2. Introspection
Ask the user:
- "What is the primary goal of this enhancement? (Performance, Visual Polish, Feature Addition?)"
- "Should we strictly follow the existing code patterns or migrate to our component-driven Astryx stack (`@astryxdesign/core`)?"

### 3. Flow Mapping
- Draft an "Enhancement Plan" in `docs/plans/YYYY-MM-DD-enhance-[flow].md`.
- Identify "Touch Points" where the **Theme Manager** or **Registry Components** can be injected.

### 4. Implementation
- Use the **`registry_recommend`** tool to find better variants for existing components.
- Run **`registry_validate_file`** on existing files to find "Dogma" violations (hardcoded colors, etc.).

## Common Mistakes
- Refactoring everything at once (prefer incremental flow updates).
- Ignoring existing business logic while updating the UI.
- Not verifying if the existing app is compatible with the Astryx design system and tokens.
