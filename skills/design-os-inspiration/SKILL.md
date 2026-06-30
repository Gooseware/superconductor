---
name: design-os-inspiration
description: Use when the user provides an image, URL, or moodboard and wants to extract design tokens, psychological rationale, and "vibes" for the project.
---

# Design OS Inspiration Engine

## Overview
This skill acts as an AI-native design strategist. Instead of just pulling hex codes, it conducts a deep **Psychological & Aesthetic Study** of an inspiration source (image or moodboard). It creates a foundational artifact (`product/design-study.md`) that documents the rationale behind the design, ensuring all future component decisions convert users and match the intended vibe.

## When to Use
- User uploads an image and says "make it look like this".
- User provides a URL for inspiration.
- Immediately after `design-os-vision` (Step 2.5 of the Orchestrator flow).

## The Process

### 1. Multi-Agent Vision Analysis (The "Vibe Check")
Different AIs interpret visual aesthetics differently. If possible, delegate the image analysis to at least one subagent to get a second opinion. 
*Example: Ask an `artistry` agent to define the emotional tone, while you (the primary agent) define the structural layout.*

### 2. Temperature Cues (User Clarification)
Ask the user 1-2 pointed questions to lock in their intent. Do not assume.
- *Examples*: "This image uses a very stark, brutalist vibe. Is that aggressive tone intentional, or do you just like the high contrast?"
- "The primary CTA is hidden in a ghost button here. Are we optimizing for exploration, or direct conversion?"

### 3. Deep Competitive Research (Optional)
Before writing the final study, offer the user the option to run a "Deep Research" prompt to ground the aesthetic decisions in actual market data.
- **Generate a Prompt**: Create a prompt like: *"Conduct a deep internet search on SaaS dashboards targeting B2B finance. Find the top 3 highest-converting designs. Analyze their primary color palettes, typography choices, and CTA placement. Return a psychological UX breakdown of why these specific visual choices drive trust and conversion in this niche."*
- **The Handoff**: Ask the user: *"Would you like me to submit this to a Deep Research agent, or would you like to run it yourself and paste the results back here?"*
- **Synthesis**: Once the research results are returned, integrate those findings into the psychological rationale and conversion strategy.

### 4. Generate the Design Study Artifact
Once the vibe and rationale are locked, write the findings to `product/design-study.md` using this exact structure:

```markdown
# Inspiration Study

## 1. Vibe Synthesis
*A 2-3 sentence description of the overarching aesthetic (e.g., "Cyberpunk Neo-Brutalism", "Soft Enterprise SaaS"). This string will be fed directly into the `registry_recommend` tool later.*

## 2. Psychological Rationale
*Why does this design work for the target audience? What emotional state does it trigger (e.g., trust, urgency, playfulness)?*

## 3. Conversion UX Strategy
*Where are the focal points? What drives the user to click the primary CTA? What friction points exist in this style that we should avoid?*

## 4. Key Design Tokens
- **Primary Color Identity**: (e.g., High saturation neon purple)
- **Typography Tone**: (e.g., Monospace headers, sans-serif highly legible body)
- **Spacing/Density**: (e.g., Extremely loose, airy, high padding)
- **Border/Shadow Radius**: (e.g., Sharp 0px corners, hard black shadows)

## 5. Analytics Markers
*What metrics should we track to prove this design rationale works? (e.g., "Track CTA hover time to see if the ghost button styling is causing hesitation.")*
```

### 5. Execute Kernel Commands
After the artifact is written, use the extracted "Vibe Synthesis" string and pass it directly to the `registry_recommend` MCP tool to find the closest matching shadcn registries in the user's `design-os.config.json`.

Present the recommended registries to the user and ask if they are ready to proceed to the Data Model / Roadmap phase.
