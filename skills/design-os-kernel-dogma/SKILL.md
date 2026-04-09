---
name: design-os-kernel-dogma
description: Guidelines for crafting components and logic that meet the Design OS Kernel dogma standards. Use when proposing, publishing, or refactoring components for the Design OS registry.
---

# Design OS Kernel Dogma

## Overview
This skill ensures all code meets the rigorous standards required for inclusion in the `design-os-kernel`.

## Core Procedures

### 1. Component Extraction & Analysis
- Scan for components using `grep` or `ts-morph`.
- Verify the component uses Tailwind CSS and Design OS tokens.
- Ensure named exports are used.

### 2. Dogma Validation
- Read the detailed rules in [dogma.md](./references/dogma.md).
- Use `mcp_design-os-kernel_registry_validate_file` to confirm compliance.

### 3. Publication Workflow
- Propose publication using `mcp_design-os-kernel_registry_propose_publish`.
- Address any validation errors by refactoring the code.
- Finalize with metadata using `mcp_design-os-kernel_registry_finalize_publish`.

## Bundled Resources
- **Dogma Rules:** [dogma.md](./references/dogma.md)
