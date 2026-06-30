---
name: design-os-data-model
description: Use when the user needs to define the core entities and relationships (the "nouns") of their product in Design OS.
---

# Design OS Data Model

## Overview
Helps the user define the fundamental data structures of their application, ensuring consistency across all screens and features.

## When to Use
- Vision and Roadmap are defined.
- `product/data-model/data-model.md` is missing.
- User says "Define the database" or "What are the entities?".

## The Process

### 1. Identify Entities
Based on the Roadmap, identify the core entities (e.g., User, Task, Project, Team).

### 2. Define Relationships
Explain how they connect (e.g., "A Project has many Tasks").

### 3. Draft the Model
List each entity with its primary fields and relationships. Keep it high-level (not full SQL yet).

### 4. Create the File
Write to `product/data-model/data-model.md`:

```markdown
# Data Model

## Entities

### [Entity Name]
- **Fields**: id, name, created_at...
- **Relationships**: Belongs to [OtherEntity]

## Relationships
- [Entity A] -> [Entity B] ([Type])
```

## Common Mistakes
- Getting too deep into technical details (DB indexes, types) too early.
- Forgetting common fields (id, created_at, updated_at).
- Missing cross-entity relationships.
