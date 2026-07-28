# Agent Configuration

This file configures the model preferences and proxy endpoints for the Superconductor agent.

## Model Mappings per Routing Tier

Adjust the mapping of model identifiers to each logic tier based on your provider and budget:

- **Tier 2 (Triage & Extraction):** `gemini-2.0-flash-lite`
- **Tier 3 (Standard Inference):** `gemini-2.5-pro`
- **Tier 4 (Frontier Reasoning):** `gemini-2.5-pro` (thinking)

## Proxy & Endpoint Settings

Specify an optional custom endpoint (e.g., LiteLLM, OpenRouter, or a local server) if you route traffic through a central gateway:

- **Proxy Endpoint:** (none)
- **Research Provider:** `google-deep-research`

---

## Configuration Resolution Order

1. **Project Override:** The active agent resolves `superconductor/agent-config.md` first. If present, it takes precedence.
2. **Global Default:** If no project override exists, the agent falls back to the global default configuration at `~/.gemini/agent-config.md`.
3. **Internal Default:** If neither configuration file exists, the agent falls back to internal default model identifiers (`gemini-2.0-flash-lite`, `gemini-2.5-pro`).
