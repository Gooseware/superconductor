---
name: design-os-vision
description: Use when the user wants to start a new project or define a product's purpose, problems, and features in Design OS.
---

# Design OS Vision

## Overview
Guides the agent through a conversational process to define a product's vision, resulting in a structured `product/product-overview.md` file. This is the first step in the Design OS planning flow.

## When to Use
- User says "I want to build X"
- User says "Start a new project"
- User says "Define my product vision"
- Missing `product/product-overview.md`

## The Process

### 1. Gather Input
Ask the user for raw notes or ideas:
"I'd love to help you define your product vision. Tell me about the product you're building. What problem are you trying to solve? Who is it for?"

*Note: If the user provides a comprehensive document instead of raw notes, use the `design-os-spec-ingest` skill instead.*

### 2. Clarify
Use `AskUserQuestion` to get:
- **Product Name**
- **Core Description** (1-3 sentences)
- **Key Problems** (1-5 specific pain points)
- **Solutions** (How it solves those points)
- **Main Features**

### 3. Draft & Refine
Present a draft summary and iterate until satisfied.

### 4. Create the File
Write to `product/product-overview.md` using this format:

```markdown
# [Product Name]

## Description
[1-3 sentence description]

## Problems & Solutions

### Problem 1: [Problem Title]
[How it solves it]

## Key Features
- [Feature 1]
```

## Common Mistakes
- Jumping to code before a vision exists.
- Creating the file without user approval of the draft.
- Forgetting the product name.
