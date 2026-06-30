---
name: design-os-spec-ingest
description: Use when the user provides an external specification file (PDF, Markdown, etc.) to drive the product creation.
---

# Design OS Spec Ingestion

## Overview
Automates the transition from a raw external specification to the structured Design OS planning files (`product/` directory). It skips the conversational vision step by extracting details directly from the provided source.

## When to Use
- User provides a path to a specification file.
- User says "Build this based on [file]".
- `product/` directory is empty but a spec file is present.

## The Process

### 1. Source Identification
Identify the external spec file. If it's an image or PDF, use the `multimodal-looker` subagent to extract text.

### 2. Deep Analysis
Use the **`ultrabrain`** category to analyze the spec and map it to Design OS entities:
- **Vision**: Product name, problem, solution, target audience.
- **Roadmap**: Feature breakdown into 3-5 sections.
- **Data Model**: Core entities and relationships.
- **Visuals**: Any mentions of branding, colors, or mood.

### 3. Orchestrated Scaffolding
Automatically generate the initial set of planning files:
1.  `product/product-overview.md`
2.  `product/product-roadmap.md`
3.  `product/data-model/data-model.md`

### 4. Review & Approval
Present the generated files to the user for a "Sanity Check".

### 5. Orchestration
Once approved, the agent SHOULD automatically move to the next logical steps in the `design-os-orchestrator` flow (e.g., proposing the Design System or App Shell) without waiting for a new user prompt for each stage.

## Common Mistakes
- Over-extracting details (keep the overview concise).
- Hallucinating features not in the spec.
- Not asking for clarification on ambiguous sections of the external spec.
