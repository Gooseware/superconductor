---
name: design-os-roadmap
description: Use when the user has defined a vision and needs to break the product into development sections (milestones) in Design OS.
---

# Design OS Roadmap

## Overview
Guides the agent through breaking a product into 3-5 manageable development sections. Each section represents a self-contained feature area.

## When to Use
- `product/product-overview.md` exists.
- `product/product-roadmap.md` is missing or incomplete.
- User says "What's next?" or "Plan the development".

## The Process

### 1. Analysis
Read `product/product-overview.md` to understand the core features.

### 2. Propose Sections
Propose 3-5 logical sections. Example:
1. **Foundation**: User auth, base layout.
2. **Core Feature A**: Main value proposition.
3. **Core Feature B**: Secondary workflows.
4. **Settings & Profile**: User management.

### 3. Refine
Iterate with the user on section names and descriptions.

### 4. Create the File
Write to `product/product-roadmap.md` using this format:

```markdown
# Product Roadmap

## Sections

### 1. [Section Title]
[Description of what's built in this section]

### 2. [Section Title]
[Description]
```

## Common Mistakes
- Too many sections (keep it 3-5).
- Overlapping responsibilities between sections.
- Forgetting to link sections to the problems identified in the vision.
