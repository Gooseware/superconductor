# Implementation Plan: Adaptive Permission System
# Track ID: adaptive_permissions_20260801

## Proactive Planning (Oracle Analysis)

### Reusable Abstractions Identified:
1. **`TrackStateManager`** — Singleton in `superconductor-core/src/permissions/` that watches
   `tracks.md` with `fs.watch` and maintains an in-memory boolean (`isIdle`) to avoid disk thrash.
2. **`PolicyEngine`** — Layered evaluation pipeline: Base TOML → Track Manifest → Session Flags → Inline Override.
3. **`PermissionManifestParser`** — Reads/writes `permission-manifest.toml` with Zod schema validation.
4. **`KeywordPermissionInferrer`** — Scans spec text for capability keywords; reusable across
   new-track and re-planning flows.
5. **`YoloAuditLogger`** — Append-only structured logger for bypass events; integrates with `TelemetryStore`.
6. **`InlineOverrideHandler`** — 4-option prompt with 60-second timeout, auto-deny on timeout.

### Recommended Module Structure:
```text
packages/superconductor-core/src/
└── permissions/
    ├── engine.ts          # Core PolicyEngine: layered allow/deny decisions
    ├── interceptor.ts     # Middleware wrapping tool executions
    ├── track-state.ts     # TrackStateManager: fs.watch on tracks.md
    ├── prompter.ts        # 4-option CLI prompt with timeout (FR-4)
    ├── schemas.ts         # Zod schemas for manifest and session-flags
    ├── audit.ts           # Append-only audit log writer
    ├── keyword-inferrer.ts # Keyword → capability flag mapper
    └── providers/
        ├── toml-provider.ts     # Parses superconductor.toml & manifest.toml
        └── session-provider.ts  # Manages .superconductor/session-flags.json (atomic writes)
```

### Architectural Risk Mitigations:
- **IDLE Mode Spoofing:** `tracks.md` modification permission is separately controlled; cannot be
  modified in IDLE mode without a prior permission grant.
- **Prompt Timeout:** 60-second timeout on inline override prompt, auto-defaults to `Deny`.
- **Concurrent Writes:** Atomic writes via temp file + rename pattern for `session-flags.json`.
- **I/O Overhead:** `fs.watch` on `tracks.md` + 200ms TTL in-memory cache keeps overhead <5ms.

---

## Phase 0: Swarm Preflight
- [x] Task: Verify `swarm-orchestrate` skill is installed and loaded. [checkpoint: verified]
  - [x] Check for skill at `~/.gemini/config/skills/swarm-orchestrate/`
  - [x] Confirm extension is at version >= 0.4.1
  - [x] Validate policies
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

## Phase 1: Permission State Machine Core [checkpoint: pending]

- [x] Task: Define permission types, schemas and module scaffold [checkpoint: bfe6884b]
    - [x] Create `packages/superconductor-core/src/permissions/` directory structure
    - [x] Create `packages/superconductor-core/src/permissions/schemas.ts` with Zod schemas for:
          `PermissionState`, `PermissionManifest`, `CapabilityFlags`, `SessionFlags`, `InlineOverrideChoice`
    - [x] Define `permission-manifest.toml` JSON Schema in `schemas/permission-manifest.schema.json`
    - [x] Write failing tests for type guards and schema validation
    - [x] Implement type guards and validators; confirm tests pass

- [x] Task: Implement `TrackStateManager` [checkpoint: 88459b1]
    - [x] Create `packages/superconductor-core/src/permissions/track-state.ts`
    - [x] Implement `fs.watch` on `superconductor/tracks.md` for `[~]` entry detection
    - [x] Implement 200ms TTL in-memory cache for `isIdle` boolean
    - [x] Implement `detectCurrentState()`: IDLE | TRACKED | YOLO
    - [x] Implement `getActiveTrackId()`: returns active track ID or null
    - [x] Write unit tests for all state transitions with mocked file system

- [x] Task: Implement `PolicyEngine` with layered evaluation [TIER-3] [AGENT:superconductor-processor] [checkpoint: d325b3c]
    - [x] Create `packages/superconductor-core/src/permissions/engine.ts`
    - [x] Implement 4-layer evaluation pipeline:
          1. Base: `policies/superconductor.toml`
          2. Track: `permission-manifest.toml` for active track
          3. Session: `.superconductor/session-flags.json`
          4. Immediate: In-memory "allow once" registry
    - [x] Implement `isToolCallPermitted(toolName, args): boolean`
    - [x] Implement `getActiveManifest(): PermissionManifest | null`
    - [x] Write unit tests for all 4 evaluation layers

- [x] Task: Implement `PermissionManifestParser` and `SessionProvider` [checkpoint: 14d0a13]
    - [x] Create `packages/superconductor-core/src/permissions/providers/toml-provider.ts`
    - [x] Create `packages/superconductor-core/src/permissions/providers/session-provider.ts`
    - [x] Implement TOML read/write for `permission-manifest.toml` with Zod validation
    - [x] Implement atomic writes for `session-flags.json` (temp file + rename)
    - [x] Implement `updateCapability(key, value)` for dynamic `Allow for Track` updates
    - [x] Write unit tests with fixture manifests and session files

- [x] Task: Superconductor - User Manual Verification 'Phase 1: Permission State Machine Core' (Protocol in workflow.md)

## Phase 2: IDLE Mode — Remove Restrictions When Inactive [checkpoint: pending]

- [x] Task: Write failing tests for IDLE mode behavior [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: No active track → `isToolCallPermitted()` returns `true` for any tool
    - [ ] Test: `write_file`, `run_shell_command`, MCP calls all pass without prompt in IDLE state
    - [ ] Test: State machine correctly identifies IDLE when `tracks.md` has no `[~]` entries
    - [ ] Test: State machine correctly identifies TRACKED when `tracks.md` has a `[~]` entry

- [x] Task: Implement Tool Call Interceptor middleware [TIER-3] [AGENT:superconductor-processor]
    - [ ] Create `packages/superconductor-core/src/permissions/interceptor.ts`
    - [ ] Implement single `ToolCallInterceptor` hook in the agent execution loop
    - [ ] Hook invokes `PolicyEngine.isToolCallPermitted()` before delegating to actual tool logic
    - [ ] In IDLE state: interceptor short-circuits and permits all calls immediately
    - [ ] In TRACKED state: interceptor evaluates against active manifest
    - [ ] In YOLO state: interceptor permits but logs to audit trail

- [x] Task: Add permission mode status banner [TIER-2] [AGENT:superconductor-processor]
    - [ ] Emit current permission mode banner when superconductor commands run
    - [ ] Format: `🟢 IDLE MODE: No restrictions active`
    - [ ] Format: `🔒 TRACKED [track_id]: Scoped permissions active (manifest: X capabilities)`
    - [ ] Format: `⚠️ YOLO MODE: All restrictions bypassed — audit logging active`
    - [ ] Update `superconductor/agent-config.md` to document the mode indicator

- [ ] Task: Superconductor - User Manual Verification 'Phase 2: IDLE Mode' (Protocol in workflow.md)

## Phase 3: YOLO Mode — Global Override with Audit Trail [checkpoint: pending]

- [x] Task: Write failing tests for YOLO mode [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: `--yolo` flag activates YOLO state
    - [ ] Test: Every tool call in YOLO mode writes to audit log with correct schema
    - [ ] Test: `--persist` writes `session-flags.json` after double-confirmation
    - [ ] Test: Session-scoped YOLO (no `--persist`) does NOT write `session-flags.json`
    - [ ] Test: Audit log entries have correct schema (timestamp, tool, argsHash, bypass marker)
    - [ ] Test: Concurrent writes to `session-flags.json` are atomic (no corruption)

- [x] Task: Implement `YoloAuditLogger` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Create `packages/superconductor-core/src/permissions/audit.ts`
    - [ ] Implement append-only logging to `superconductor/logs/yolo-audit.log`
    - [ ] Log schema: `{ timestamp, mode: 'YOLO', tool, argsHash, sessionId, bypass: true }`
    - [ ] Integrate with `TelemetryStore` for token tracking

- [ ] Task: Implement YOLO mode activation, persistence, and `/superconductor:yolo` command [TIER-3] [AGENT:superconductor-processor]
    - [ ] Add `--yolo [--persist]` flag handling to `PermissionStateManager`
    - [ ] Create `commands/superconductor/yolo.toml` command shortcut
    - [ ] Add double-confirmation prompt for `--persist` flag
    - [ ] Implement atomic read/write for `.superconductor/session-flags.json`
    - [ ] Schema: `{ yolo: boolean, activatedAt: string, sessionId: string, persistent: boolean }`

- [ ] Task: Superconductor - User Manual Verification 'Phase 3: YOLO Mode' (Protocol in workflow.md)

## Phase 4: Planner Permission Inference [checkpoint: pending]

- [ ] Task: Write failing tests for keyword inference [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: "USB", "lsusb", "udevadm", "/dev/bus" keywords → `usb_access = true`
    - [ ] Test: "curl", "fetch", "HTTP", "API", "network" keywords → `network_unrestricted = true`
    - [ ] Test: "shell", "bash", "exec", "spawn", "subprocess" keywords → `arbitrary_shell = true`
    - [ ] Test: Paths outside project root mentioned → `fs_outside_root = true`
    - [ ] Test: Output manifest matches defined Zod schema

- [ ] Task: Implement `KeywordPermissionInferrer` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Create `packages/superconductor-core/src/permissions/keyword-inferrer.ts`
    - [ ] Implement keyword dictionary for each capability flag (case-insensitive matching)
    - [ ] Implement `inferFromText(specText: string): PermissionManifest` function
    - [ ] Return manifest with `inferred_by = "auto"` metadata

- [ ] Task: Integrate inference into new-track planning flow [TIER-3] [AGENT:superconductor-dreamer]
    - [ ] Hook `KeywordPermissionInferrer` into the post-spec phase of `new-track` skill
    - [ ] Emit `permission-manifest.toml` to track directory alongside `plan.md`
    - [ ] Add manifest review to plan confirmation UI (show inferred capabilities to user)
    - [ ] Allow user to edit/override manifest capabilities before approving plan
    - [ ] Update `skills/new-track/SKILL.md` to document manifest emission step

- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Planner Permission Inference' (Protocol in workflow.md)

## Phase 5: Per-Blocker Inline Override [checkpoint: pending]

- [ ] Task: Write failing tests for inline override prompt [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: Policy block triggers override prompt with 4 options
    - [ ] Test: "Allow Once" → call proceeds, policy re-applies on next same call
    - [ ] Test: "Allow for Track" → manifest updated, subsequent same calls pass without prompt
    - [ ] Test: "YOLO (Session)" → activates YOLO state for entire session
    - [ ] Test: "Deny" → call blocked, deny event logged
    - [ ] Test: Prompt auto-denies after 60-second timeout

- [ ] Task: Implement `InlineOverrideHandler` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Create `packages/superconductor-core/src/permissions/prompter.ts`
    - [ ] Implement `handleBlockedCall(toolName, args): Promise<InlineOverrideChoice>`
    - [ ] Show `ask_user` prompt with 4 options on policy block
    - [ ] Implement 60-second timeout using `Promise.race`; auto-resolve to `Deny`
    - [ ] Route result to: ephemeral allow registry | manifest update | YOLO activation | deny log

- [ ] Task: Wire `InlineOverrideHandler` into `PolicyEngine` and `ToolCallInterceptor` [TIER-3] [AGENT:superconductor-processor]
    - [ ] Update `interceptor.ts` to call `handleBlockedCall()` when `isToolCallPermitted()` returns false
    - [ ] Ensure "Allow Once" state is ephemeral — cleared after single use via in-memory registry
    - [ ] Log all override decisions (allow/deny) to audit trail

- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Per-Blocker Inline Override' (Protocol in workflow.md)

## Phase 6: Integration & Finalization [checkpoint: pending]

- [ ] Task: End-to-end integration testing [TIER-4] [AGENT:superconductor-oracle]
    - [ ] Test full flow: IDLE mode → start track → TRACKED mode (manifest loaded) → per-blocker override → YOLO override → audit log verified
    - [ ] Test: New-track flow emits permission manifest and user can review/edit it
    - [ ] Test: `Allow for Track` updates manifest and persists across same-session calls
    - [ ] Test: Performance benchmark — state detection overhead <5ms per tool call
    - [ ] Run full test suite: `CI=true pnpm test`

- [ ] Task: Update documentation [TIER-2] [AGENT:superconductor-processor]
    - [ ] Update `README.md` with Adaptive Permission System section
    - [ ] Update `GEMINI.md` SWARM GUARDRAILS with new mode documentation
    - [ ] Create `docs/permissions.md` with full capability reference and manifest schema
    - [ ] Update `superconductor/agent-config.md` to document permission modes

- [ ] Task: Security review of YOLO audit trail and session persistence [TIER-4] [AGENT:superconductor-reviewer]
    - [ ] Verify audit log is append-only and cannot be silently tampered
    - [ ] Verify `session-flags.json` double-confirmation is enforced for `--persist`
    - [ ] Verify IDLE mode bypass does not affect plan-mode security (write_file to superconductor/)
    - [ ] Verify IDLE mode spoofing protection: `tracks.md` modification requires prior grant
    - [ ] Verify atomic write pattern prevents session flag corruption

- [ ] Task: Integrate track 'adaptive_permissions_20260801' into main branch. [TIER-2] [AGENT:superconductor-processor]

---

## Swarm Blueprint

> Generated: 2026-08-01T05:18:00+04:00
> Source: keyword heuristics (intelligence snapshot not available)
> Estimated track cost: ~6 phases · ~28 tasks · Oracle every 5 tasks
> Waves: Phase 1-2 parallel → Phase 3-4 parallel → Phase 5 sequential → Phase 6 review

| Wave | Phases | Agent Roles | Notes |
|------|--------|-------------|-------|
| 1 | 0, 1 | Dreamer + Processor | Core types + state machine scaffold |
| 2 | 2, 3 | Processor (parallel) | IDLE bypass + YOLO mode |
| 3 | 4 | Dreamer + Processor | Inference + new-track integration |
| 4 | 5 | Processor | Inline override handler |
| 5 | 6 | Oracle + Reviewer | Integration tests + security review |
