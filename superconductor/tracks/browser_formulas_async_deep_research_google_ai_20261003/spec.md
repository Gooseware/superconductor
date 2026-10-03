# Track Specification: Browser Formulas & Async Push Engine for Gemini Deep Research and Google AI Search

**Track ID:** `browser_formulas_async_deep_research_google_ai_20261003`  
**Phase:** `Phase 1: Active Tracks (core-foundation)`  
**Status:** `Draft`  
**Target Package:** `packages/superconductor-browser` & extension-level MCP/Skills (`skills/gemini-deep-research`, `skills/google-ai-mode`)

---

## 1. Overview & Objectives

This track accomplishes three major evolutionary leaps across the Superconductor browser and agent research ecosystem:

1. **Pre-Crafted Golden Formulas for Gemini & Google AI:**
   Leverages `superconductor-browser`'s `FormulaStore` to store golden scraper formulas (`gemini_deep_research_canvas.json` and `google_ai_search_overview.json`). Formulas execute deterministically at machine speed (10–50ms) to parse deep research reports, canvas artifacts, source citations, search overviews, and multi-turn threads, backed by automatic `FormulaHealer` drift recovery when Google alters frontend DOM classes.

2. **Async Research Job Runner & Dual Push Notification Dispatcher:**
   Because Deep Research runs for 3–10 minutes while Gemini conducts autonomous web browsing, long-running research jobs are decoupled from blocking synchronous tool calls. We introduce an asynchronous research execution pipeline with a **dual push notification dispatcher**:
   - **Hermes Webhook Callback:** Directly POSTs structured completion events and the extracted markdown report to Hermes's built-in webhook subsystem (`/api/webhook/...`), immediately waking up the Hermes agent without polling.
   - **Herdr Agent Prompt Injection & Process Exit Signals:** Injects completed prompts into the agent terminal pane via `herdr agent prompt <target> <text>` and emits standard process exit signals for AGY/Herdr background task reactive wakeups.

3. **Skill Reformulation & Google AI Mode Creation:**
   - **Reformulated `gemini-deep-research`:** Replaces the legacy 380-line raw CDP script with declarative `superconductor-browser` MCP primitives (`browser_navigate`, `browser_goal`, `browser_execute_formula`, `browser_scrape`).
   - **New `google-ai-mode` Skill:** Drives Google Search AI Mode (`https://www.google.com/search?q=...&udm=50`), handles multi-turn follow-up queries, extracts source citations, and structures conversational search threads.
   - **Dynamic Destination & Git Sync:** Inspects the target storage directory (defaulting to `/home/gooseware/repos/gemini/gemini-obsidian`), detects whether a Git remote exists (e.g., `git@gitlab.com:goosewares/gemini-obsidian`), respects user preference for automatic commit/push, and records preferences in the notebook.

---

## 2. Ecosystem Alignment & Prior Art (Anti-Reinvention)

- **Prior Art Evaluated:**
  - `legacy run_deep_research.py`: Relied on 380 lines of raw CDP JSON-RPC WebSockets, brittle sleep loops, and simulated keydown/keyup events that break on Google DOM updates.
  - `Hermes Webhook Subsystem` (`hermes_cli/webhook.py`, `web_server_gateway.py`): Hermes has production-ready webhook routing with per-route HMAC secrets.
  - `Herdr Agent Management CLI` (`herdr agent prompt <target> <text>`): Native capability to send prompts directly to running agent panes.
  - `Superconductor Formula Engine` (`FormulaStore`, `FormulaCompiler`, `FormulaExecutor`, `FormulaHealer`): In-repo deterministic formula execution with checkpointing and auto-drift healing.
- **Architectural Distinction:**
  Instead of fragile external Python scripts or unmanaged polling loops, this track unites `superconductor-browser`'s stealth Playwright engine with Hermes and Herdr's native event-push primitives.

---

## 3. Architecture Committee Debate & Consensus

- **Dreamer (Architecture & Systems):**
  - Formulas should be stored in `.superconductor/formulas/` as version-controlled schemas with JSON schema validation.
  - Deep Research execution should be callable via both a high-level CLI command (`superconductor-browser research ...`) and an MCP tool (`browser_start_research_job`).
  - When the long-running job finishes, the notification dispatcher should fan out: if a Hermes webhook URL is configured, POST the completion payload; if a Herdr target agent is specified, invoke `herdr agent prompt`; and always write the structured report to the Obsidian Second Brain.
- **Reviewer (Security & Reliability):**
  - Webhook POST requests must support timeout guards (10s) and optional HMAC secret signing to avoid SSRF or unauthorized command injection.
  - Research job execution must be idempotent and bounded by a maximum time limit (default 15 minutes) to prevent zombie Chromium instances if Gemini hangs.
  - Dynamic vault destination resolution must sanitize file paths against path traversal (`..` sequences).
  - Git commit & push operations must be resilient to detached HEAD or transient network failures without crashing the research pipeline.

---

## 4. Project Constraints & Notebook History

- **From Notebook Preferences:**
  - Track assigned to `core-foundation` (Phase 1).
  - User selected **Dual Push Notification** support (Hermes Webhook + Herdr/AGY process signals).
  - User selected **Hybrid Scraper Formulas** (pre-crafted golden formulas with `FormulaHealer` drift recovery).
  - User selected **Dynamic Destination Discovery** with Git remote awareness for Obsidian Second Brain synchronization.
- **Planning & Dispatch Dogma:**
  - All source mutations under `packages/superconductor-browser/src/**` must be delegated to Processor subagents; the root agent remains strictly planning & dispatch.

---

## 5. Functional Requirements

### FR-1: Stored Golden Formulas
- **F-1.1:** Author and persist `gemini_deep_research_canvas.json` in `.superconductor/formulas/`:
  - Target: `https://gemini.google.com/app`
  - Extraction rules: Canvas title, markdown report body, source citation cards, thinking steps, and research outline.
  - Invariants: `minItems: 1`, required fields `["title", "content"]`.
- **F-1.2:** Author and persist `google_ai_search_overview.json` in `.superconductor/formulas/`:
  - Target: `https://www.google.com/search?q=...&udm=50`
  - Extraction rules: AI overview markdown text, source chip links, multi-turn follow-up history, and suggested searches.
  - Invariants: `minItems: 1`, required fields `["overview", "sources"]`.
- **F-1.3:** Integration with `FormulaHealer`: If Google alters class names, `FormulaHealer` detects drift, computes semantic fallback selectors, and outputs auto-repair diagnostics.

### FR-2: Async Research Job Runner & Dual Push Notification Dispatcher
- **F-2.1:** Asynchronous Job Runner:
  - Can be launched headlessly via CLI: `pnpm superconductor-browser research --topic "<topic>" [options]`.
  - Also exposed via MCP tool: `browser_start_research_job` returning `{ jobId, status: "running" }`.
- **F-2.2:** Push Notification Dispatcher:
  - **Hermes Webhook:** If `--webhook-url` (or `HERMES_WEBHOOK_URL`) is supplied, send a `POST` request with `{ event: "research_complete", jobId, topic, filePath, summary, sources }`.
  - **Herdr Agent Prompt:** If `--herdr-agent <name>` is supplied, invoke `herdr agent prompt <name> "Deep Research complete for '<topic>'. Report saved to <filePath>."`.
  - **Process Exit Signal:** Cleanly exits with code `0` on success or non-zero on failure, enabling AGY/Herdr background task reactive wakeups.

### FR-3: Reformulate `gemini-deep-research` Skill
- **F-3.1:** Strip out legacy raw CDP socket code and reliance on `run_deep_research.py`.
- **F-3.2:** Update `skills/gemini-deep-research/SKILL.md` to use:
  - `browser_navigate`: Open Gemini with stealth profile.
  - `browser_goal`: Type topic, select Deep Research mode, approve plan, await completion.
  - `browser_execute_formula`: Extract Canvas report using `gemini_deep_research_canvas`.
  - Async runner with push notification options for long tasks.
- **F-3.3:** Document how Hermes and AGY agents trigger deep research and handle reactive wakeups.

### FR-4: Create `google-ai-mode` Skill
- **F-4.1:** Author `skills/google-ai-mode/SKILL.md`:
  - Supports search queries via `https://www.google.com/search?q=<query>&udm=50`.
  - Supports multi-turn search conversations and follow-ups.
  - Uses `google_ai_search_overview` formula and `browser_inspect_state` for WIZ data.
- **F-4.2:** Register the skill in the Superconductor and AGY plugin catalogs.

### FR-5: Dynamic Setup & Obsidian Second Brain Archival
- **F-5.1:** Destination Preference Resolution:
  - Reads output path preference from config or environment (default: `/home/gooseware/repos/gemini/gemini-obsidian`).
  - Deep Research reports saved to `<vault>/Research/YYYY-MM-DD - <Topic>.md`.
  - Google AI search threads saved to `<vault>/Conversations/YYYY-MM-DD - <Query>.md`.
- **F-5.2:** Git Remote Detection & Sync:
  - Inspects target directory for Git configuration (`git rev-parse --is-inside-work-tree`).
  - If a Git remote is configured (e.g. `git@gitlab.com:goosewares/gemini-obsidian`), executes commit and push to GitLab according to user preference.

---

## 6. Non-Functional Requirements

- **NFR-1 (Stealth & Bot Resistance):** Research operations must utilize `FingerprintHardener` and `HumanInput` physics to prevent bot-detection friction on Google accounts.
- **NFR-2 (Non-Blocking Concurrency):** Long research jobs must never block the main agent turn; jobs run asynchronously in background with event callbacks.
- **NFR-3 (Timeout & Fault Tolerance):** Research runners must enforce an upper time limit (15m default), capture diagnostic screenshots on failure, and clean up browser contexts properly.
- **NFR-4 (Security & Safe Schemas):** Webhook dispatch URLs and file paths must be validated using safe schemas; no credentials or auth tokens logged to stdout.

---

## 7. Acceptance Criteria (ACs)

- **AC-1:** Golden formulas `gemini_deep_research_canvas.json` and `google_ai_search_overview.json` exist in `.superconductor/formulas/`, validate against `ScrapeFormulaSchema`, and successfully extract content via `browser_execute_formula`.
- **AC-2:** `superconductor-browser` provides an asynchronous research runner and push notification dispatcher supporting Hermes Webhook `POST` and Herdr `agent prompt`.
- **AC-3:** Reformulated `skills/gemini-deep-research/SKILL.md` operates without legacy CDP scripts, exclusively using `superconductor-browser` tools and async push patterns.
- **AC-4:** Brand new `skills/google-ai-mode/SKILL.md` is authored, validated, and capable of driving Google Search AI Mode (`udm=50`) with citation and thread extraction.
- **AC-5:** Dynamic Obsidian vault resolver detects destination folders, verifies Git remotes, and automates Git commit/push to GitLab when configured.
- **AC-6:** All existing 218 unit/integration tests in `packages/superconductor-browser` continue to pass, plus new tests covering formula execution and notification dispatching.

---

## 8. Out of Scope

- Bypassing Google login credentials programmatically (relies on user's existing Chrome profile or standard remote auth).
- Rebuilding the entire Hermes server; we integrate with Hermes's existing webhook and Herdr CLI APIs.
