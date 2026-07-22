# Implementation Plan: Superconductor–Caduceus Symbiosis & Model Switcher Integration

> **Scope:** Both repos — Superconductor (`/home/gooseware/repos/gemini/extensions/superconductor`) and Caduceus (`/home/gooseware/repos/hippos/caduceus`).

---

## Proactive Planning (Oracle Suggestions)

- **`IModelRouter` interface**: Define once in `src/shared-schema/`, reused by both Superconductor's engine and Caduceus's model override logic.
- **`SuperconductorSensor` class**: Extract workspace detection as a standalone, testable class with `detect() → SuperconductorContext | null` contract.
- **`StagingWatcher` class**: Abstract the `~/.caduceus/staging/` watcher as a reusable file-system watcher pattern for future staging pipelines.
- **`RegistryClientRouter` utility**: Formalize as the routing abstraction (Caduceus-first, Design OS fallback).
- **`AdaptiveRouter` class**: Encapsulate all dynamic model routing logic (tier-based + history-based) in Caduceus.

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify if the `swarm-orchestrate` skill is installed and loaded. [TIER-2] [AGENT:caduceus-processor]
- [ ] Task: Confirm both repos are on clean branches; create `track/symbiosis_caduceus_20260722` in Superconductor repo and `track/symbiosis_superconductor_20260722` in Caduceus repo. [TIER-1] [AGENT:caduceus-processor]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Shared Schema Package

*(Work in Superconductor repo — types consumed by both repos via path aliases)*

- [ ] Task: Define shared TypeScript types in `src/shared-schema/` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write unit tests verifying all exported types compile and match expected shapes (compile-time tests with `tsd`).
    - [ ] Create `src/shared-schema/index.ts` with types: `Track`, `TrackStatus`, `AgentMessage`, `RegistryComponent`, `ComponentStagingManifest`, `ModelTierConfig`, `IModelRouter`, `SuperconductorContext`, `AgentTurnEvent`, `AdaptiveRouteSuggestion`.
    - [ ] Wire tsconfig path aliases in Superconductor: `@shared-schema → ./src/shared-schema`.
    - [ ] Document each type with JSDoc comments.
- [ ] Task: Configure Caduceus path alias for shared schema [TIER-2] [AGENT:caduceus-processor]
    - [ ] Add tsconfig path alias `@superconductor/shared-schema → [superconductor-path]/src/shared-schema` in Caduceus tsconfig.
    - [ ] Write a compile-time test importing from alias.
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Shared Schema Package' (Protocol in workflow.md)

---

## Phase 2: Model Switcher Integration (Superconductor Engine)

*(Wire `model_selector_20260721` into the live Superconductor plugin flow)*

- [ ] Task: Implement `IModelRouter` interface and atomic cache writes [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write unit tests for `mtime` check, atomic write (write-then-rename), `0600` permissions, concurrent write stress test.
    - [ ] Refactor `CacheManager` from `model_selector_20260721` to implement `IModelRouter` from shared schema.
    - [ ] Replace direct write with atomic write: write to `.tmp` then `fs.renameSync` to final path.
    - [ ] Add in-memory singleton cache to avoid repeated disk I/O within same session.
- [ ] Task: Implement `SmartModelResolver` and integrate into Superconductor engine [TIER-3] [AGENT:caduceus-dreamer]
    - [ ] Write integration tests: session start resolves model from `agent-config.md`; TUI fires only on model change or `--switch-model` flag; `active_model.json` written with `0600` permissions.
    - [ ] Implement `SmartModelResolver`: reads `agent-config.md` tier mappings → queries `CacheManager` for available models → reads `~/.gemini/active_model.json` (last session) → compares; if changed, invoke TUI selector.
    - [ ] Persist resolved model to `~/.gemini/active_model.json` (0600) after selection.
    - [ ] Expose `--switch-model` flag that forces TUI regardless of cached selection.
    - [ ] Hook `SmartModelResolver` into the `implement` skill's session init flow.
- [ ] Task: Implement `SuperconductorEventEmitter` (fire-and-forget to Caduceus) [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write unit tests: event fires after task completion; silent fail with log when Caduceus unavailable; 500ms timeout respected.
    - [ ] Implement `SuperconductorEventEmitter.emit(event: AgentTurnEvent)`: POSTs to `http://localhost:1691/api/events` with 500ms `AbortSignal.timeout`; wraps in try/catch.
    - [ ] Add hook into Superconductor task completion flow (Step 8 of Standard Task Workflow).
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Model Switcher Integration' (Protocol in workflow.md)

---

## Phase 3: Caduceus Superconductor-Awareness

*(Work in Caduceus repo — `pre_invoke` hook extension, config extension, adaptive routing)*

- [ ] Task: Implement `SuperconductorSensor` class [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write unit tests: detects Superconductor workspace; returns null when absent; symlink boundary check rejects traversal; digest is ≤300 tokens.
    - [ ] Implement `SuperconductorSensor.detect(workspaceRoot: string): Promise<SuperconductorContext | null>` — probes for `superconductor/index.md`, resolves absolute path via config (no env-var influence), validates not a symlink traversal.
    - [ ] Implement `buildContextDigest(ctx: SuperconductorContext): string` — generates ≤300 token structured summary: active track ID, current phase, top-5 incomplete tasks, active model tier from `~/.gemini/active_model.json`.
- [ ] Task: Extend Caduceus `pre_invoke` with Superconductor context injection [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write integration tests: pre_invoke output contains `<SUPERCONDUCTOR_CONTEXT>` block when workspace detected; output unchanged when absent; no token bloat >300 tokens from new block.
    - [ ] Integrate `SuperconductorSensor` into `pre_invoke.ts`; append `<SUPERCONDUCTOR_CONTEXT>...</SUPERCONDUCTOR_CONTEXT>` to `injectSteps[0].trailingContext`.
    - [ ] Add protocol hint when Superconductor detected: "This workspace uses Superconductor. Follow the Superconductor workflow (plan.md task sequence) before modifying code."
- [ ] Task: Extend `ConfigManager` with Superconductor agent-config model overrides [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write unit tests: `readConfig()` with Superconductor `agent-config.md` present overrides `defaultModels`; absent → no change; partial config → selective merge.
    - [ ] Extend `ConfigManager.readConfig()` to check `${workspaceRoot}/superconductor/agent-config.md`; parse tier → model mappings; merge into `defaultModels` (Superconductor values take precedence).
- [ ] Task: Implement `AdaptiveRouter` with tier-based routing [TIER-4] [AGENT:caduceus-oracle]
    - [ ] Write unit tests: routes to `caduceus-oracle` when Superconductor Tier 4 active; falls back to original static routing when no Superconductor context.
    - [ ] Implement `AdaptiveRouter` class encapsulating all routing logic: static type-based routing (existing) + Superconductor tier override (new) + history-based suggestion (Phase 6).
    - [ ] Replace inline routing in `index.ts` with `AdaptiveRouter.route(taskData, superconductorContext)`.
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Caduceus Superconductor-Awareness' (Protocol in workflow.md)

---

## Phase 4: Component Staging Registry Bridge

*(Cross-repo: Superconductor writes, Caduceus reads)*

- [ ] Task: Implement `ComponentStagingWriter` in Superconductor [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write unit tests: manifest written to `~/.caduceus/staging/`; write is atomic (write-then-rename); fire-and-forget (does not block caller); validates against `ComponentStagingManifest` schema before write.
    - [ ] Implement `ComponentStagingWriter.write(payload: ComponentStagingManifest): Promise<void>` — creates `~/.caduceus/staging/` if missing (with `0700` perms); writes JSON atomically.
    - [ ] Integrate into Superconductor workflow's Registry Inclusion Analysis (Step 2.1 of Phase Completion Protocol) as the primary `RegistryClientRouter` route, falling back to `design-os-kernel` MCP if `~/.caduceus/staging/` not accessible.
- [ ] Task: Implement `StagingWatcher` in Caduceus MCP server [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write unit tests: watcher ingests new `.json` files; validates schema (rejects corrupt JSON); on success moves to `processed/`; on failure moves to `failed/` with error annotation; 60s poll interval correct.
    - [ ] Implement `StagingWatcher` class: polls `~/.caduceus/staging/` on startup and every 60 seconds; validates `ComponentStagingManifest` schema; ingests via Knowledge Graph API (new component node + edges to track and session); moves to `~/.caduceus/staging/processed/` on success, `~/.caduceus/staging/failed/` on error.
    - [ ] Wire `StagingWatcher` into Caduceus MCP server `index.ts` initialization.
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Component Staging Registry Bridge' (Protocol in workflow.md)

---

## Phase 5: Real-Time Event Bus

*(Superconductor emits → Caduceus persists)*

- [ ] Task: Implement `/api/events` endpoint in Caduceus MCP server [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write unit tests: `POST /api/events` with valid `AgentTurnEvent` returns 202; rejects malformed with 400; event persisted in SQLite `events` table.
    - [ ] Create Drizzle ORM schema for `events` table: `(id, eventType, sessionId, trackId, phase, modelUsed, taskType, success, timestamp, payload_json)`.
    - [ ] Run Drizzle migration for new `events` table.
    - [ ] Implement `POST /api/events` route in Caduceus `index.ts`; validate payload against `AgentTurnEvent` schema; insert to DB; return 202.
    - [ ] Add `GET /api/suggest-model?taskType=<type>` endpoint that queries `events` table for historical model performance and returns `AdaptiveRouteSuggestion`.
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Real-Time Event Bus' (Protocol in workflow.md)

---

## Phase 6: Automatic Caduceus Model Routing

*(History-driven model suggestions from Caduceus → Superconductor)*

- [ ] Task: Implement history-based model suggestion in `AdaptiveRouter` [TIER-4] [AGENT:caduceus-oracle]
    - [ ] Write unit tests: `suggestModel` returns correct model when ≥5 events exist; returns null when insufficient history; handles DB query errors gracefully.
    - [ ] Implement `AdaptiveRouter.suggestModel(taskType: string, context: SuperconductorContext): Promise<string | null>`: queries `events` table grouped by `modelUsed`, calculates success rate (`success=true` count / total), returns top performer if ≥5 data points.
    - [ ] Wire the `GET /api/suggest-model` endpoint to call `AdaptiveRouter.suggestModel`.
- [ ] Task: Integrate model suggestion into Superconductor's `SmartModelResolver` [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write unit tests: `SmartModelResolver` uses Caduceus suggestion when available and >5 data points; falls back to `agent-config.md` mapping when Caduceus unavailable or insufficient data.
    - [ ] Extend `SmartModelResolver` to call `GET http://localhost:1691/api/suggest-model?taskType=<type>` (200ms timeout, silent fail); if suggestion returned, use as override for that task type.
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: Automatic Caduceus Model Routing' (Protocol in workflow.md)

---

## Phase 7: Caduceus-Side Track Creation

*(Create matching tracks in the Caduceus Superconductor directory)*

- [ ] Task: Create Caduceus-side track files [TIER-2] [AGENT:caduceus-organizer]
    - [ ] Create directory `superconductor/tracks/symbiosis_superconductor_20260722/` in Caduceus repo.
    - [ ] Write `spec.md` (Caduceus-perspective: Phases 3, 4, 5, 6 Caduceus-side work).
    - [ ] Write `plan.md` (Caduceus-perspective tasks only, with Superconductor workflow task markers).
    - [ ] Write `metadata.json` with `{ trackId, title, status, created, repo }`.
    - [ ] Write `index.md` linking spec and plan.
    - [ ] Update Caduceus `superconductor/tracks.md` registry with new entry.
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Caduceus-Side Track Creation' (Protocol in workflow.md)

---

## Phase 8: Integration & Finalization

- [ ] Task: End-to-end integration test across both repos [TIER-4] [AGENT:caduceus-oracle]
    - [ ] Write E2E test sequence: start Superconductor implement session → model resolved via `SmartModelResolver` → `AgentTurnEvent` emitted → Caduceus `pre_invoke` detects workspace + injects `<SUPERCONDUCTOR_CONTEXT>` → task completes → staging manifest written → Caduceus `StagingWatcher` ingests → `AdaptiveRouter` suggests model based on history.
    - [ ] Verify all acceptance criteria from `spec.md` pass.
    - [ ] Run graceful degradation tests: Superconductor works when Caduceus MCP is down; Caduceus works when Superconductor workspace absent.
- [ ] Task: Documentation updates [TIER-2] [AGENT:caduceus-processor]
    - [ ] Update Superconductor `UPDATES.md` and `README.md` with new capabilities (model switcher, event bus, staging bridge).
    - [ ] Update Caduceus `README.md` with Superconductor detection, model overrides, staging watcher, and adaptive routing.
    - [ ] Update Superconductor `superconductor/agent-config.md` with notes on Caduceus integration.
- [ ] Task: Integrate track 'symbiosis_caduceus_20260722' into main branch. [TIER-2] [AGENT:caduceus-reviewer]
