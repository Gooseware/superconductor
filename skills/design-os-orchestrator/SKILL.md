---
name: design-os-orchestrator
description: Use when the user asks "What's next?", "How do I start?", or "Status check" in Design OS. This skill manages the overall planning sequence.
---

# Design OS Orchestrator

## Overview
Acts as the central nervous system of Design OS, ensuring the user follows the structured planning flow and knows which step is next.

## When to Use
- Every new session.
- When a task is completed.
- When the user is confused about the process.

## The Planning Flow
1. **Kernel Setup** (`design-os-kernel-setup`) -> Connection check.
2. **Vision** (`design-os-vision`) -> `product/product-overview.md`
3. **Inspiration Study** (`design-os-inspiration`) -> `product/design-study.md`
4. **Registry Selection** -> Ensure `design-os.config.json` specifies the component registries, running `registry_recommend` using the Vibe Synthesis from the Design Study.
5. **Plugin Injection** -> Use `block-injector` to add cross-cutting concerns like `auth-sso` or `db-drizzle` from the local registry.
6. **Component Adaptation** -> If required components are found in remote (Tier 1) registries, use the `component-adapter` skill to fetch them to staging, enforce Dogma rules, and publish them to your local Golden Source (Tier 2).
7. **Roadmap** (`design-os-roadmap`) -> `product/product-roadmap.md`
8. **Data Model** (`design-os-data-model`) -> `product/data-model/data-model.md`
9. **i18n** (`design-os-i18n`) -> `product/i18n/spec.md`
10. **Design System** (`design-os-design-system`) -> Use `npx astryx theme` to generate brand themes.
11. **App Shell** (`design-os-app-shell`) -> Scaffold using `npx astryx template`.
12. **Sections** -> One folder per roadmap item.
13. **Enhancement & Refinement** (`design-os-enhance`, `theme-manager-flow`)
14. **Export** -> `/export-product` (Command reference).

## The Process

### 1. Status Check
Check the existence of the core planning files.

### 2. Guide Next Step
Based on the status check, suggest the *exact next step*.
