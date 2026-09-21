# Specification: Track Phase System & Dynamic Sliding-Window Progression

## 1. Overview
Superconductor currently manages tracks as a flat, unsegmented list under `## Active Tracks` in `superconductor/tracks.md`. When running unattended batch execution (`/superconductor:batch-execute`), the orchestrator executes all pending tracks sequentially regardless of logical milestone separation, prerequisite readiness, or delivery staging.

This track introduces a first-class **Track Phase System** to Superconductor:
- **Phase-Structured Registry**: Organizes `tracks.md` into distinct milestone sections (e.g. `## Phase 1: Core Foundation (Active)`, `## Phase 2: Multi-Language & UX (Pending)`), each with its own markdown track table.
- **Dynamic Sliding-Window Progression**: When all tracks in Phase 1 reach `[x]` (Complete), Phase 1 transitions to `(Complete)` and Phase 2 automatically becomes the new active Phase 1 across all views, CLI tools, and batch runners.
- **Decoupled Symbolic Phase IDs**: Track `metadata.json` stores permanent, sanitized symbolic IDs (`"phase_id": "core-foundation"`), insulating Architecture Decision Records (ADRs), git commit history, and immutable references from shifting runtime display ordinals.
- **Interactive Phase Switcher (`/superconductor:phase`)**: Enables users to list phases, inspect completion progress, and interactively switch between active phases.
- **Phase-Aware Batch Execution with Interactive Continuation**: Enhances `batch-execute` to target the active phase by default (or `--phase=<n>`), defaulting to interactive continue mode when tracks fail (morning presents) rather than deadlocking the batch queue.
- **Robust Multi-Table AST Parser**: Replaces brittle regexes in `track-reader.ts` and `migrate-tracks.ts` to prevent silent truncation of multi-phase tables, with seamless backward compatibility for unphased tracks.

---

## 2. Architectural Committee Recommendations & Research Synthesis

1. **Decouple Identity from Runtime Numbers**:
   Markdown headers and metadata use symbolic IDs (`foundation`, `ui-polish`); runtime ordinals ("Phase 1", "Phase 2") are dynamically derived by counting uncompleted phases.
2. **Explicit Phase State Machine**:
   Phases progress through formal states: `PLANNED`, `ACTIVE`, `BLOCKED` (contains morning presents), `COMPLETED`.
3. **Morning Present Policy**:
   Failed tracks revert to `[ ]` as morning presents. Batch execution defaults to interactive continuation (`--phase-policy=continue`), reporting presents in the morning briefing without stalling independent downstream tracks or looping infinitely.
4. **AST / Block Parsing**:
   Fixes the multi-table truncation vulnerability in `migrate-tracks.ts` and unifies track parsing in `packages/superconductor-core`.
5. **Zod & Path Traversal Guards**:
   Strict validation on `phase_id` (`/^[a-z0-9_-]{1,64}$/`) preventing directory traversal and shell metacharacter injection.
6. **Concurrency & File Locking**:
   All read/write operations on `tracks.md` and track metadata use `proper-lockfile` guards with retry/backoff.

---

## 3. Acceptance Criteria

- **AC-1: Phase-Aware Tracks Registry Structure (`tracks.md`)**
  `superconductor/tracks.md` supports section headings formatted as `## Phase <N>: <Name> (<Status>)`, each containing an independent markdown track table. Legacy tracks outside phase headings are automatically grouped under a default virtual phase.

- **AC-2: Symbolic Phase IDs in Track Metadata (`metadata.json`)**
  Track `metadata.json` includes `"phase_id": "<symbolic_id>"`, strictly validated against `/^[a-z0-9_-]{1,64}$/`.

- **AC-3: Core PhaseManager & Domain Models**
  Implement `PhaseManager`, `PhaseManifest`, and `PhaseStateStore` in `packages/superconductor-core` providing:
  - `parsePhases(projectRoot)`: Extracts all phases and their member tracks from `tracks.md`.
  - `getActivePhase(projectRoot)`: Resolves current Phase 1 and its completion percentage.
  - `switchPhase(projectRoot, phaseIdentifier)`: Sets the target active phase.
  - `advance(projectRoot)`: Automatically advances the sliding window when Phase 1 is 100% complete.

- **AC-4: Automatic Sliding-Window Renumbering**
  When all tracks in Phase 1 reach `[x]`, Phase 1 transitions to `(Complete)`. `PhaseManager` renumbers the next uncompleted phase to Phase 1 in runtime views, CLI banners, and status reports.

- **AC-5: Interactive Phase Command (`/superconductor:phase`)**
  Add `/superconductor:phase` command and CLI entrypoints (`superconductor phase [list|switch|status|next]`), featuring an interactive picker to inspect and switch active phases.

- **AC-6: Phase-Targeted Batch Execution (`/superconductor:batch-execute`)**
  Update `skills/batch-execute/SKILL.md` to execute only pending tracks within the active phase by default, or accept `--phase=<num|id>` to target a specific phase.

- **AC-7: Interactive Continue-on-Failure Policy**
  In `batch-execute`, when a track fails and reverts to `[ ]` (morning present), default to interactive continue mode (`--phase-policy=continue`). Record the present in the morning briefing, prevent infinite retry loops, and allow downstream independent tracks to proceed.

- **AC-8: Multi-Section AST Parser & Backward Compatibility**
  Upgrade `track-reader.ts` and `migrate-tracks.ts` to parse all phase sections without truncating subsequent tables.

- **AC-9: Cross-Phase Dependency & Security Validation**
  Prevent Phase N tracks from declaring circular or forward dependencies on Phase N+1 tracks. Sanitize all phase identifiers against path traversal.

- **AC-10: Track Creation Integration (`/superconductor:new-track`)**
  Update `/superconductor:new-track` to support phase assignment, writing `phase_id` to `metadata.json` and placing the track into the appropriate phase table in `tracks.md`.

- **AC-11: Full Test Coverage & 500-Line Limit**
  Deliver comprehensive unit/integration test suites for `PhaseManager`, CLI commands, and batch runners. Verify all modified `SKILL.md` files comply with the <= 500 lines rule.

---

## 4. Out of Scope
- Cross-project phase synchronization across multiple git repositories.
- Automated generation of milestone burn-down charts or Jira/GitHub Projects sync.
