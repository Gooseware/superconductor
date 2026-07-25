# Specification: Model Switcher Integration & Superconductor–Caduceus Symbiosis

## 1. Overview

This track accomplishes four tightly related objectives:

1. **Model Switcher Integration** — Wire the previously planned `model_selector_20260721` components (CacheManager, lazy-fetch, TUI prompt) into the live Superconductor engine as a "Smart" model router. The router resolves models from `agent-config.md` at session start and only surfaces the TUI selector when the resolved model has changed or the user explicitly triggers it.

2. **Caduceus Superconductor-Awareness** — Extend Caduceus's `pre_invoke` hook to detect Superconductor workspaces and inject a structured context digest (active track ID, current phase, incomplete tasks, workspace + track registry summary) into `<CADUCEUS_CONTEXT>`. When a Superconductor workspace is detected, Caduceus also adopts the Superconductor workflow protocol before any code modification is proposed. Caduceus model defaults are overridden by Superconductor's `agent-config.md` tier mappings when available.

3. **Component Staging Registry Bridge** — Implement a decoupled, asynchronous component publication pipeline: Superconductor's Phase Completion workflow writes a staged component manifest to `~/.caduceus/staging/`, and Caduceus's MCP server picks it up asynchronously when healthy.

4. **Real-Time Event Bus & Automatic Model Routing** — Implement an `AgentTurnCompleted` event bus between Superconductor and Caduceus, and build history-driven automatic model routing where Caduceus suggests optimal models based on past task performance.

**Shared Schema:** Shared TypeScript type definitions (`Track`, `AgentMessage`, `RegistryComponent`, `ComponentStagingManifest`, `ModelTierConfig`, `IModelRouter`, `SuperconductorContext`, `AgentTurnEvent`) are extracted to a neutral `src/shared-schema/` location, consumed by both repos via path aliases.

**Matching Caduceus Track:** A parallel track is created in the Caduceus repo (`superconductor/tracks/symbiosis_superconductor_20260722/`) covering all Caduceus-side implementation work.

---

## 2. Research Notes

- **Plugin Detection (2025–2026):** The SOTA pattern is filesystem probing (`isAvailable()` checking for `superconductor/index.md`) combined with an adapter/router fallback pattern (primary → fallback chain). Module resolution probing (`import.meta.resolve`) is valid for installed npm packages.
- **Cross-Repo Registries:** Git-backed registries using a standardized `registry.json` schema (à la shadcn/ui) allow component distribution without tight coupling. Source files are staged and consumed via CLI, not runtime imports.
- **Model Routing:** The 4-tier cascade (Deterministic → Triage → Standard → Frontier) is the 2026 SOTA. Shell-for-execution avoids LLM token costs on deterministic tasks. AGY `PreInvocation` hooks can dynamically route inference.
- **Lazy Loading:** Singleton caching and atomic write patterns keep CLI startup under 50ms and prevent cache corruption under concurrent writes.

---

## 3. Architecture Committee Report

### Dreamer's Vision
- Model switcher as a middleware layer behind an `IModelRouter` interface — decouples the TUI/caching mechanics from the engine.
- Caduceus `WorkspaceContextSensor` (`SuperconductorSensor`) auto-detects Superconductor and maps tracks to Caduceus epics in the Knowledge Graph.
- Shared registry protocol: `design-os-kernel` MCP acts as producer, Caduceus MCP server at port 1691 acts as consumer/persistence layer.
- Event bus for `AgentTurnCompleted` events from Superconductor → Caduceus Knowledge Graph → future query + routing decisions.
- History-driven model routing: Caduceus's `AdaptiveRouter` queries past task outcomes to suggest optimal models to Superconductor's `SmartModelResolver`.

### Reviewer's Critical Findings (MUST address)
- **Race conditions:** Atomic file writes (write-then-rename) for `available_models.json` and all staging manifests.
- **Security:** Config-based absolute paths only (no env-var-influenced path traversal); symlink boundary validation before reading cross-repo files.
- **Performance:** Do NOT inject full `product.md`/`spec.md`/`plan.md` into every hook. Use on-demand structured digest (≤300 tokens budget).
- **Graceful degradation:** Superconductor must write to staging and continue even if Caduceus is down. All Caduceus calls wrapped in try/catch with silent fail.
- **Circular deps:** Strict unidirectional init order — Superconductor is source of truth; Caduceus is stateless reader. No synchronous cross-dependency at startup.

---

## 4. Functional Requirements

### 4.1 Model Switcher Integration (Superconductor)
- **FR1:** At the start of each `/superconductor:implement` session, the engine reads `agent-config.md` tier mappings and resolves the active models via `CacheManager` (from `model_selector_20260721`).
- **FR2:** The TUI model selector prompt fires ONLY if: (a) the resolved model differs from the last session's committed model, OR (b) the user passes `--switch-model` flag.
- **FR3:** The resolved model selection is persisted to `~/.gemini/active_model.json` with `0600` permissions for the current session and readable by Caduceus.
- **FR4:** The `CacheManager` MUST use atomic write (write to `.tmp` then `rename`) to prevent cache corruption under concurrent access.
- **FR5:** Model selection is exposed via an `IModelRouter` interface so the TUI implementation remains swappable.

### 4.2 Caduceus Superconductor-Awareness
- **FR6:** Caduceus `pre_invoke` implements a `SuperconductorSensor` that probes for `superconductor/index.md` in the active workspace root (config-based absolute path, no env-var traversal).
- **FR7:** If detected, a structured digest (≤300 tokens) is appended to `<CADUCEUS_CONTEXT>` as a `<SUPERCONDUCTOR_CONTEXT>` sub-block: active track ID, current phase, top 5 incomplete tasks, workspace summary.
- **FR8:** The digest reads from `active_model.json` (written by FR3) to advertise which model tier is active.
- **FR9:** Caduceus `ConfigManager.readConfig()` checks for `${workspaceRoot}/superconductor/agent-config.md`; if present, its tier → model mappings override Caduceus's `defaultModels` for the session.
- **FR10:** When Superconductor is detected, Caduceus `pre_invoke` includes a protocol hint instructing the agent to follow the Superconductor workflow before modifying code.
- **FR11:** Caduceus's static task routing in `index.ts` is extended via `AdaptiveRouter` to use the active Superconductor tier: if Tier 4 is active, default routing escalates to `caduceus-oracle`.

### 4.3 Component Staging Registry Bridge
- **FR12:** Superconductor's Phase Completion protocol writes a `ComponentStagingManifest` JSON to `~/.caduceus/staging/<component-id>.json` when a reusable component is identified and approved.
- **FR13:** The manifest schema: `{ componentId, trackId, files[]: {path, content}[], metadata: {type, description, tags, dependencies}, timestamp }`.
- **FR14:** Caduceus MCP server watches `~/.caduceus/staging/` on startup and on a 60-second polling interval; it ingests staged manifests into its Knowledge Graph and moves them to `~/.caduceus/staging/processed/` after successful ingestion.
- **FR15:** Superconductor does NOT await Caduceus acknowledgement — fire-and-forget to staging; phase completion is never blocked.

### 4.4 Real-Time Event Bus
- **FR16:** Superconductor emits `AgentTurnEvent` (type: `task_completed | phase_completed | track_completed`) via `POST /api/events` on Caduceus MCP server (port 1691) after each task completion.
- **FR17:** Events are fire-and-forget (500ms timeout); Caduceus persists them in a new `events` SQLite table indexed by `trackId` and `sessionId`.
- **FR18:** Caduceus's `AdaptiveRouter` queries the `events` table to calculate historical model performance per task type.

### 4.5 Automatic Caduceus Model Routing
- **FR19:** `AdaptiveRouter.suggestModel(taskType, context)` queries the `events` table for past outcomes, calculates success rate per model, and returns the historically best-performing model string.
- **FR20:** Superconductor's `SmartModelResolver` optionally queries Caduceus `AdaptiveRouter` suggestion (via `GET /api/suggest-model`) as an override source — if Caduceus is available and has >5 historical data points for the task type.

### 4.6 Shared Schema & Caduceus Track
- **FR21:** Shared TypeScript types are defined in `src/shared-schema/` (Superconductor repo) and referenced via path aliases.
- **FR22:** A matching Caduceus-side track (`symbiosis_superconductor_20260722`) is created with spec, plan, metadata, and index files in the Caduceus repo.

---

## 5. Non-Functional Requirements

- **Security:** Config-based absolute path resolution only; symlink boundary check before reading cross-repo files; staging manifests validated against JSON schema before ingestion.
- **Performance:** `pre_invoke` Superconductor context digest adds ≤300 tokens; `CacheManager` uses in-memory singleton to avoid repeated disk I/O; all Caduceus calls from Superconductor have ≤500ms timeout.
- **Resilience:** All Caduceus-facing calls are wrapped in try/catch with silent fail + log. Staging bridge is fire-and-forget.
- **Compatibility:** Both repos work independently when the other is absent (graceful degradation verified by unit tests with mocked absence).
- **Token Economics:** `agy models` is called at most once per 24 hours via `CacheManager`. Model suggestion queries are lightweight SQLite aggregations.

---

## 6. Acceptance Criteria

- [ ] Superconductor implement session reads and resolves model from `agent-config.md` without showing TUI if model unchanged.
- [ ] TUI prompt appears correctly when model has changed or `--switch-model` is passed.
- [ ] `available_models.json` written atomically (write + rename); verified by concurrent write stress test.
- [ ] Caduceus `pre_invoke` correctly detects a Superconductor workspace and appends `<SUPERCONDUCTOR_CONTEXT>` to injected context.
- [ ] Caduceus context digest is ≤300 tokens (verified by token count unit test).
- [ ] Caduceus model defaults are overridden by `superconductor/agent-config.md` when present.
- [ ] Caduceus routing escalates to `caduceus-oracle` when Superconductor Tier 4 is active.
- [ ] Superconductor writes `ComponentStagingManifest` to staging dir asynchronously; does NOT block phase completion.
- [ ] Caduceus ingests staging manifests correctly and moves them to `processed/` after ingestion.
- [ ] `AgentTurnEvent` is emitted after each Superconductor task completion; persisted in Caduceus `events` table.
- [ ] `AdaptiveRouter` returns valid model suggestion when ≥5 historical events exist for a task type.
- [ ] Shared schema types compile cleanly and are referenced correctly from both repos.
- [ ] Both systems operate correctly when the other is absent (graceful degradation verified by unit tests).
- [ ] Matching Caduceus track created and registered in Caduceus `superconductor/tracks.md`.

---

## 7. Out of Scope

- Visual dashboard for component registry (separate future track).
- Any changes to Caduceus cloud/Cloudflare sync path.
- Caduceus-initiated writes back to Superconductor `plan.md` (read-only relationship for now).
