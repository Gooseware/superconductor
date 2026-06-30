---
name: component-adapter
description: Use when pulling a raw component from a third-party remote registry (Tier 1) into the local Golden Source (Tier 2). It automates staging, Dogma-validation, theme adaptation, and local publishing.
---

# Component Adapter Pipeline

## Overview
This skill transforms raw, untrusted upstream components (e.g., from Aceternity, Magic UI, or generic shadcn) into Dogma-compliant "Golden Source" components. 

By running this pipeline, you ensure all components in the local registry obey the application's theming requirements (no hardcoded colors, correct semantic spacing) *before* they are ever used in production code. 

## When to Use
- You find a perfect component in a third-party registry via `registry_recommend`.
- A user asks to "import and use" a component from a remote URL.
- An upstream component fails the `registry_validate_file` (Dogma check) because it has hardcoded `hex` colors or improper exports.

## The Pipeline

Follow these exact steps to adapt and publish a component:

### 1. Fetch to Staging
Do **not** install raw third-party code directly into the app's `ui/` folder.
Install it into a temporary staging directory first:
- **Tool**: `registry_install`
- **Params**: `family`, `variant`, `sourceUrl` (matching the remote registry), and `targetPath: "app/components/staging/[family]"`

### 2. Validate Dogma
Run the Dogma verifier to find non-compliant code (e.g., hardcoded hex colors, missing exports).
- **Tool**: `registry_validate_file`
- **Params**: `path: "app/components/staging/[family]/[file].tsx"`

### 3. Adapt & Fix (The Loop)
If validation fails:
1. Use your file editing tools (`Edit` or `ast_grep_replace`) to fix the violations in the staging file.
2. Replace hardcoded colors (e.g., `bg-[#1e293b]`, `text-white`) with your local theme variables (e.g., `bg-card`, `text-card-foreground`).
3. Replace arbitrary or absolute spacing with semantic Tailwind classes if necessary.
4. Run `registry_validate_file` again. 
5. Repeat until the tool returns `success: true`.

### 4. Propose Publish
Once the staged file is 100% Dogma-compliant, propose it for the Golden Source.
- **Tool**: `registry_propose_publish`
- **Params**: `path` (the staging path), `family` (e.g., "card"), `variant` (e.g., "glowing-stars"), `type` (e.g., "molecule" or "organism").

### 5. Finalize Publish
Provide the rich metadata required to make this adapted component easily discoverable by `registry_recommend` for all future projects!
- **Tool**: `registry_finalize_publish`
- **Params**: 
  - `description`: What it does and what you changed.
  - `intent`: When should the AI pick this variant over others? (e.g., "Use for high-impact, animated feature highlights").
  - `tags`: JSON array of visual/behavioral tags.
  - `dependencies`: Any npm packages it requires.

### 6. Clean Up & Implement
1. Delete the staging directory (`rm -rf app/components/staging/[family]`).
2. Now that the perfected component is safely in your local `ui-kit-registry`, you can install it normally into `app/components/ui/` or import it directly if your workflow dictates.

## Why We Do This
Every time you run this pipeline, you permanently increase the value of the local registry. The next time you need this component, it will already be perfectly themed and waiting in the Golden Source.
