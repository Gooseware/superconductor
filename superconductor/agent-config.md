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
- **Research Provider:** `gemini-api-deep-research`

---

## Configuration Resolution Order

1. **Project Override:** The active agent resolves `superconductor/agent-config.md` first. If present, it takes precedence.
2. **Global Default:** If no project override exists, the agent falls back to the global default configuration at `~/.gemini/agent-config.md`.
3. **Internal Default:** If neither configuration file exists, the agent falls back to internal default model identifiers (`gemini-2.0-flash-lite`, `gemini-2.5-pro`).

## Swarm Mode

- **Swarm Mode:** inactive
- **Revoked Tools (when active):** write_file, run_command, multi_replace_file_content

By default, Swarm Mode is inactive. When activated, the root model will have its file and terminal write access revoked to prevent rogue writes.

---

## Reviewer Agent

The `superconductor-reviewer` agent uses a system prompt that permanently bakes in the **8-item Shenanigan Checklist** — it is not injected per-prompt by the orchestrating model.

### System Prompt Construction

The full reviewer system prompt is assembled at module load time via:

```
packages/engine/src/agents/reviewer-system-prompt.ts
  └── SHENANIGAN_CHECKLIST       (readonly string[8])
  └── buildReviewerSystemPrompt  (basePrompt: string) → string
  └── REVIEWER_BASE_SYSTEM_PROMPT
  └── REVIEWER_FULL_SYSTEM_PROMPT = buildReviewerSystemPrompt(REVIEWER_BASE_SYSTEM_PROMPT)
```

The `REVIEWER_FULL_SYSTEM_PROMPT` constant is exported from `packages/engine/src/agents/index.ts` and re-exported from the package root (`packages/engine/src/index.ts`).

### The 8-Item Shenanigan Checklist

Any reviewer agent receiving `REVIEWER_FULL_SYSTEM_PROMPT` will **always** check for:

1. Phantom Implementation
2. Test Theatre
3. Scope Creep
4. Confidence Washing
5. Semantic Drift
6. Coverage Map Gaming
7. Silent Degradation
8. Dependency Laundering

Failure to check all 8 items is itself a Critical finding.

## Permission Mode Indicator
The agent will emit a permission mode status banner reflecting the active restrictions:
- `🟢 IDLE MODE: No restrictions active`
- `🔒 TRACKED [track_id]: Scoped permissions active`
- `⚠️ YOLO MODE: All restrictions bypassed — audit logging active`
