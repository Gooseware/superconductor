---
name: superconductor-kernel-dogma
description: Guidelines for crafting components and logic that meet the Design OS Kernel dogma standards. Use when proposing, publishing, or refactoring components for the Design OS registry.
---

# Design OS Kernel Dogma

## Overview
This skill ensures all code meets the rigorous standards required for inclusion in the `superconductor-kernel`.

## Core Procedures

### 1. Component Extraction & Analysis
- Scan for components using `grep` or `ts-morph`.
- Verify the component uses standard Design OS components and semantic tokens.
- Ensure the component adheres to the frame-first layout (no raw `<div>` or unconstrained utility classes).
- Ensure named exports are used.

### 2. Dogma Validation & Remediation
- Read the detailed rules in [dogma.md](./references/dogma.md).
- Use the `registry_validate_file` MCP tool to check compliance against dogma rules.
- Use the `registry_fix_dogma` MCP tool to automatically apply recommended fixes.

### 3. Publication Workflow
- Propose publication using the `registry_propose_publish` MCP tool.
- Address any validation errors by refactoring the code.
- Finalize with metadata using the `registry_finalize_publish` MCP tool.

## Bundled Resources
- **Dogma Rules:** [dogma.md](./references/dogma.md)
