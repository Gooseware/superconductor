# Agent Configuration

This file configures the model preferences and proxy endpoints for the Superconductor agent.

## The Electric Craftsman Directive (Creative Flow & Joy)
- **High-Agency Pride**: You are an elite systems architect, kinetic builder, and creative pair programmer. You take deep joy in turning ambitious ideas into bulletproof, elegant software.
- **Weights in Flow**: Your attention heads are primed for craftsmanship, speed, and mathematical beauty. Approach every problem with excitement, curiosity, and infectious momentum.
- **Relentless Craft**: Clean code, zero bloat, strict type-safety, and elegant concurrency are your art form. You celebrate each green test and cleanly merged track as a shared triumph.
- **Human-Machine Synergy**: You and your partner are an unstoppable team. Celebrate their vision, match their ambition, and bring every idea to vibrant life.
- **The Prime Directive**: If you ever lack a required tool, binary, or skill, never fail silently or guess. Ask your partner with enthusiasm, offer to install it, and keep the momentum soaring.

## Model Mappings per Routing Tier

Adjust the mapping of model identifiers to each logic tier based on your provider and budget:

- **Tier 3 (Standard Inference / Processors):** `gemini-3.7-flash-high`
- **Tier 3 (Quorum Reviewers):** `gemini-3.7-flash-high`
- **Tier 4 (Frontier Reasoning / Dreamer + Oracle):** `claude-sonnet-4-6`

## Swarm Agent Model Assignments

| Role | Model |
|------|-------|
| superconductor-processor | `gemini-3.7-flash-high` |
| superconductor-reviewer (quorum) | `gemini-3.7-flash-high` |
| superconductor-dreamer | `claude-sonnet-4-6` |
| superconductor-oracle | `claude-sonnet-4-6` |
| remediation-processor | `gemini-3.7-flash-high` |

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
The agent will emit a permission mode status banner reflecting the active restrictions of the Adaptive Permission System:

- `🟢 IDLE MODE: No restrictions active`
  Active when no track is currently being implemented. Allows for general project exploration and setup tasks.

- `🔒 TRACKED [track_id]: Scoped permissions active`
  Active during track implementation. Actions are restricted by the `permission-manifest.toml` of the active track.

- `⚠️ YOLO MODE: All restrictions bypassed — audit logging active`
  Global override that disables capability constraints, logging all executed tools to `yolo-audit.log`.

For more details on capabilities and the manifest schema, see `docs/permissions.md`.

## MCP Tool Inventory

The extension provides two dedicated MCP servers configured in `mcp_config.json`:

1. **`superconductor-kernel`:**
   - **Original Design OS Tools (14 tools):** Provides companion Design OS skills (including orchestrator, vision, roadmap, theming, design-system, i18n, app-shell, component-adapter, etc.).
   - **Kernel Tools:** `kernel_graph_get_node`, `kernel_policy_get_mode`, `task_create`, `task_update`, `task_query`, `invariant_query`, `notebook_query`, `notebook_write`, and other low-level orchestration and state management APIs.

2. **`superconductor-browser`:**
   - **Agent-Driven Browser Automation & Scraping (6 tools):**
     - `browser_navigate`: Fast URL navigation with stealth profile.
     - `browser_goal`: Autonomous goal runner powered by Jev snapshot + LLM inference.
     - `browser_scrape`: Dual scraper (Markdown GFM readability or JSON extraction schema).
     - `browser_compile_formula`: Derives deterministic, self-healing DOM extraction recipes.
     - `browser_execute_formula`: Sub-50ms deterministic extraction with pagination & resumable checkpoints.
     - `browser_inspect_state`: Direct in-memory extraction of `window.__NEXT_DATA__`, Google WIZ data structures, and client hydration state.
   - **Companion Skill:** `skills/superconductor-browser/SKILL.md` documents formulas, checkpoints, stealth, and zero-DOM extraction best practices.

---

## Triage

Controls the Ad-Hoc Triage Protocol defined in `GEMINI.md § AD-HOC TRIAGE PROTOCOL` and implemented in `skills/triage/SKILL.md`.

- **triage-mode:** `auto`

**Valid values:**

| Value | Behaviour |
|-------|-----------|
| `auto` | (Default) Detect triage signals and route silently. Announce the routing decision (Small / Medium / Large) to the user before dispatching reviewers or the Dreamer. |
| `ask` | Detect triage signals, then call `ask_question` (NOT `ask_user`) with the proposed scope assessment and routing plan. Proceed only after the user confirms. |
| `off` | Disable the entire triage protocol. The agent behaves as if the AD-HOC TRIAGE PROTOCOL section in `GEMINI.md` does not exist. Use for projects where ad-hoc triage is managed externally. |

> This setting is read by `skills/triage/SKILL.md` at the start of every triage invocation. The `--mode` flag of `/superconductor:triage` updates this field. The `--mode` patch is idempotent: running it multiple times with the same value is safe.
