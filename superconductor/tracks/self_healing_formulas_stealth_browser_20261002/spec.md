# Track Specification: Self-Healing Scraper Formulas, Resumable Checkpoints, JS State Inspection, Human Stealth & JEV MCP Replacement

**Track ID:** `self_healing_formulas_stealth_browser_20261002`  
**Phase:** `Phase 1: Active Tracks (core-foundation)`  
**Status:** `Draft`  
**Target Package:** `packages/superconductor-browser` & extension-level MCP/Skills  

---

## 1. Overview & Objectives

This track upgrades `@superconductor/browser` from a single-pass browser scraper into an **industrial-grade, self-healing, agent-driven browser platform**. 

It formalizes four core capabilities:
1. **Self-Healing Scraper Formulas:** The AI compiles DOM & schema extraction rules into declarative "Formulas". Formulas execute deterministically at machine speed (10–50ms, no LLM required). When structural drift or site redesigns break extraction invariants, the system triggers self-healing re-compilation.
2. **Resumable Multi-Page Checkpointing:** An append-only cursor and checkpoint journal that allows crawlers and scrapers to traverse infinite scroll feeds or paginated websites, safely stopping and resuming exactly where they left off without data loss or duplication.
3. **Client-Side JS State & Hydration Inspection:** Direct extraction from in-memory global state objects (`window.__NEXT_DATA__`, `window.WIZ_global_data`, `window.__INITIAL_STATE__`) and network route response interception, bypassing DOM rendering overhead.
4. **Human Behavioral Stealth Physics:** Sub-perceptual natural mouse Bezier curves with micro-jitter, variable flight and dwell keystroke timing, inertial scroll deceleration, and runtime fingerprint sanitization.
5. **JEV MCP Replacement & Cutover:** Expose these capabilities via a dedicated `@superconductor/browser` MCP server, register it in both **AGY** and **Hermes**, cleanly remove the legacy `jev-browser` tools, and author a companion Superconductor Skill (`superconductor-browser`) to guide AI agents on effective usage.

---

## 2. Ecosystem Alignment & Prior Art (Anti-Reinvention)

- **Prior Art Evaluated:**
  - `ghost-cursor` / `puppeteer-extra-plugin-stealth`: Validated for natural Bezier curve math and CDP flag patching. We build on top of our existing native Playwright CDP connection to standard release Google Chrome (`/usr/local/bin/google-chrome-stable`).
  - Next.js / Nuxt / WIZ Hydration: Modern frameworks hydrate from embedded `<script type="application/json">` or global arrays. Native evaluation is 50x faster than querying rendered DOM nodes.
  - Checkpoint Journals: SQLite / JSON journal with atomic writes and hash-based deduplication guarantees idempotency.
- **Architectural Distinction:** Rather than an external un-audited npm plugin nest, all stealth heuristics and formula engines are natively typed in TypeScript inside `packages/superconductor-browser`, maintaining single-repo provenance and submodule synchronization.

---

## 3. Architecture Committee Debate & Consensus

- **Dreamer (Architecture):**
  - Formulas should be declarative JSON schema objects stored in `.superconductor/formulas/<domain-hash>.json`.
  - An MCP server should run over stdio, implementing standard MCP tools (`browser_navigate`, `browser_goal`, `browser_scrape`, `browser_compile_formula`, `browser_execute_formula`, `browser_inspect_state`).
  - Checkpoint journal should write atomic JSON deltas with `fs.rename` to prevent corrupted states during abrupt process termination.
- **Reviewer (Security & Reliability):**
  - Invariant checks must be strictly defined: a formula must declare required fields and min/max expected item thresholds. If violated, it must not output empty records silently; it must signal `FORMULA_DRIFT`.
  - Human stealth timing must use bounded random distributions (Gaussian/Pareto) to avoid synthetic regularities that bot detectors flag.
  - MCP replacement in Hermes (`~/.hermes/config.yaml`) and AGY (`~/.gemini/antigravity-cli/settings.json`) must be backed up before mutation to allow instant zero-friction rollback.

---

## 4. Functional Requirements

### FR-1: Self-Healing Scraper Formulas
- **Compile:** AI analyzes the live DOM, identifies repeating entity clusters and semantic selectors, and compiles a `ScrapeFormula` (CSS/XPath selectors, regex transforms, expected types, invariant assertions).
- **Store:** Formulas are saved locally with metadata (`formulaId`, `domain`, `version`, `createdAt`, `checksum`).
- **Execute:** Deterministic engine executes the formula without calling an LLM. Runs in 10–50ms per page.
- **Self-Heal:** If assertions fail (0 items found, null required fields), the engine emits `FORMULA_DRIFT`, launches an inspection pass, patches the formula, and re-validates.

### FR-2: Resumable Checkpointing & Multi-Page Traversal Engine
- **State Store:** Checkpoints stored in `.superconductor/checkpoints/<job-id>.json`.
- **Journal Content:** Tracks `completedIds`, `lastCursor` (page number, scroll offset, or pagination token), `status` (`in_progress` | `paused` | `completed`), and extraction metrics.
- **Strategies:**
  - *Infinite Scroll / Virtualized:* Scroll container with mutation observers until no new items or height limit.
  - *Pagination Links:* Traverse `a[rel="next"]`, `.pagination-next`, or numeric route schemas.
- **Resume Protocol:** Re-running with `--resume` picks up from `lastCursor` and filters out all known `completedIds`.

### FR-3: Client-Side JS State & Hydration Deep Inspection
- **Hydration Extractor:** Inspects `<script id="__NEXT_DATA__">`, `window.__INITIAL_STATE__`, and Google WIZ objects (`window.WIZ_global_data`, `AF_initDataCallback`).
- **Network Interception:** Captures API responses (`page.on('response')`) for configured route patterns to extract raw JSON payloads before DOM transformation.

### FR-4: Human Behavioral Stealth Physics Engine
- **Mouse Physics:** Simulates natural human mouse paths using cubic Bezier curves, variable velocity, and random overshoot/correction.
- **Keystroke Dynamics:** Simulates human typing rhythms with randomized flight time (delay between keys: 60–140ms) and dwell time (key hold duration: 30–50ms).
- **Inertial Scrolling:** Mouse-wheel ticks with deceleration physics and reading pauses.
- **Fingerprint Masking:** Patches `navigator.webdriver`, simulates realistic `window.chrome`, hardware concurrency, and screen resolution.

### FR-5: Superconductor Browser MCP Server
- Implements MCP stdio protocol via `@modelcontextprotocol/sdk`.
- Exposes tools:
  - `browser_navigate`: Open URL with stealth profile.
  - `browser_goal`: Autonomous goal runner (Jev snapshot + OpenRouter/Mercury text inference).
  - `browser_scrape`: Dual scraper (Markdown + JSON schema).
  - `browser_compile_formula`: Derive extraction recipe.
  - `browser_execute_formula`: Fast deterministic extraction with pagination and checkpointing.
  - `browser_inspect_state`: Extract hydration / global JS state.

### FR-6: AGY & Hermes Integration & Clean Cutover
- Register `@superconductor/browser` MCP server in:
  - Antigravity CLI (`~/.gemini/antigravity-cli/`)
  - Hermes Agent (`~/.hermes/config.yaml`)
- Remove deprecated `jev-browser` and `jev-ultrafast_jev-browser` references.
- Preserve configuration backups prior to modification.

### FR-7: Companion Superconductor Skill
- Create `skills/superconductor-browser/SKILL.md` (and copy to plugin directories).
- Documents workflows:
  - When to compile a formula vs when to run a live goal.
  - How to resume multi-page crawler checkpoints.
  - How to extract hydration state from React/Next.js/Google web applications.
  - Troubleshooting formula drift.

---

## 5. Non-Functional Requirements & Invariants

1. **Deterministic Execution Performance:** Executing a compiled formula on a pre-loaded page MUST complete in under 100ms.
2. **Stealth Fidelity:** Stealth mode MUST successfully evade standard bot detection heuristics (e.g., `navigator.webdriver === undefined`, realistic `window.chrome.runtime`).
3. **Atomic State Persistence:** Checkpoint and formula files MUST be written atomically using temp files and atomic rename to prevent corruption on SIGINT.
4. **Anti-Hero Planning & Dispatch Dogma:** Root session MUST NOT mutate application source code files; implementation must be executed via Processor subagents.

---

## 6. Acceptance Criteria (ACs)

- [ ] **AC-1:** `FormulaEngine` compiles, validates, executes, and detects drift in declarative extraction recipes.
- [ ] **AC-2:** `CheckpointEngine` persists cursor state and successfully resumes an interrupted multi-page crawl without duplicate items.
- [ ] **AC-3:** `StateInspector` successfully extracts JSON hydration state from `window.__NEXT_DATA__` and Google WIZ objects.
- [ ] **AC-4:** `StealthEngine` generates natural Bezier mouse trajectories and human-paced keystrokes.
- [ ] **AC-5:** `@superconductor/browser` exports an MCP server with all tools passing functional verification.
- [ ] **AC-6:** Hermes `config.yaml` is updated with `superconductor-browser` and `jev-browser` is removed.
- [ ] **AC-7:** AGY settings and MCP directories are updated to register `superconductor-browser` and remove `jev-browser`.
- [ ] **AC-8:** Companion skill `superconductor-browser` is created and functional.
