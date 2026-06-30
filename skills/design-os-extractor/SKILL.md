---
name: design-os-extractor
description: Use when the user wants to extract a feature, component, or configuration from their current project and save it as a reusable Design OS Opinion Block in their ui-kit-registry.
---

# Design OS Extractor

## Overview
Acts as a harvesting tool to turn working code (Auth flows, Database setups, Admin panels, UI components) from an existing project into a reusable, framework-agnostic Design OS Opinion Block (`registry:block`).

## When to Use
- When the user says "Extract my auth setup into a block"
- When the user says "Save this component to the registry"
- When the user wants to modularize an existing opinionated setup.

## The Extraction Process

### 1. Identify the Target and Domain
1. Ask the user *exactly* what feature they want to extract.
2. Search the current codebase (using `ast-grep` or `rg`) to identify all files related to the feature (e.g., if extracting Auth, find the `AuthProvider`, API routes, middleware, and `package.json` dependencies).
3. Determine the Block Name: Must follow the `[domain]-[opinion]` format (e.g., `auth-clerk`, `db-prisma`, `admin-refine`).

### 2. Scaffold the Block
1. Locate the registry directory (`DESIGN_OS_HOME/packages/ui-kit-registry/blocks/` or the user's local registry).
2. Create the block directory: `blocks/[domain]-[opinion]/`.
3. Create the required subdirectories (e.g., `components/`, `routes/`, `lib/`).

### 3. Extract the Files (Literal Extraction)
Do not attempt to rewrite or "clean up" the code during extraction. We want a 1:1 replica of the working feature.
1. Copy the relevant files from the project into the block's subdirectories.
2. Create `registry.json` inside the block directory, conforming to the Shadcn registry schema. Include all extracted files and external NPM dependencies.

### 4. Write the WIRING.md Contract
This is the most critical step. You must explain how an AI should inject this block into a new project in the future.
1. Create `WIRING.md` in the block directory.
2. Use the exact headers required by the Design OS Block Template:
   - `## 1. Dependencies` (List NPM packages)
   - `## 2. File Placement` (Where the copied files should go)
   - `## 3. Integration Points` (Exact instructions and code snippets for patching root layouts, configuration files, etc.)
   - `## 4. Verification` (How to test the block works)

### 5. Final Review
1. Ensure the block follows the format defined in `packages/ui-kit-registry/blocks/BLOCK_TEMPLATE.md`.
2. Inform the user that the block has been successfully extracted and is now available to the Orchestrator for future scaffolding.
