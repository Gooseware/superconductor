# Track Specification: Adaptive Permission System

## Overview

Superconductor currently applies a single, always-on permission policy (via `policies/superconductor.toml`)
that restricts tool calls regardless of context. This creates friction for developers who want to operate
freely outside of tracked work — and lacks intelligence when inside a track (permissions should match what
the track actually needs).

This track implements an **Adaptive Permission State Machine** with three modes:
- **IDLE mode**: No active track — fully open, zero friction, any tool call permitted
- **TRACKED mode**: Active track — planner auto-infers required permissions and enforces only what's scoped
- **YOLO mode**: Explicit override — removes all restrictions, adds audit trail, session-scoped by default

## Research Notes

From best practices research (August 2026):
- Context-aware ABAC/PBAC is now preferred over static TOML rules for AI agents
- "Safety Dials" (Plan / Default / Developer / YOLO modes) are the emerging standard in tools like Claude Code
- JIT permission injection at task-boundary is superior to blanket policies
- Even in unrestricted modes, logging with a "bypass" marker is the industry standard for auditability
- Ephemeral/session-scoped elevations (not persistent) reduce the blast radius of accidental grants
- Runtime authorization (checking at moment of execution) far outperforms static RBAC for agent workflows

## Architecture Committee Recommendations

1. **Permission State Machine**: System transitions through `IDLE → PLANNING → EXECUTING → YOLO` states.
   Permissions are resolved per-state, never cached across state transitions (except with fs.watch).
2. **Declarative Permission Manifest**: The planner auto-infers a `permission-manifest.toml` alongside
   `plan.md` by scanning spec content for USB, network, FS, shell op keywords.
3. **YOLO Audit Trail**: Even when YOLO mode is active, every tool call is logged with a `[YOLO-BYPASS]`
   marker in `superconductor/logs/yolo-audit.log`.
4. **Session Scope for Persistence**: Persistent YOLO is implemented as a `.superconductor/session-flags.json`
   file that survives restarts (since user explicitly selected "persistent across restarts").
5. **Per-Blocker Inline Overrides**: When a restriction fires mid-track, present:
   `Allow Once | Allow for Track | YOLO (Session) | Deny`.
6. **IDLE Mode Spoofing Mitigation**: Permission to modify `tracks.md` is strictly isolated to prevent
   a rogue agent from tricking the system into IDLE mode by removing `[~]` tags.

## Oracle Proactive Planning Notes

- **`TrackStateManager`**: Centralized utility with `fs.watch` or 200ms TTL cache to avoid disk thrash on every tool call.
- **`PolicyEngine`**: Layered evaluation hierarchy: Base TOML → Track Manifest → Session Flags → Inline Override.
- **`StateProvider` pattern**: Unified TOML/JSON read/write with Zod schema validation for all config files.
- **Tool Call Interceptor/Middleware**: Single intercept hook in the agent execution loop — no permission checks scattered across individual tools.
- **Inline Prompt Timeout**: 60-second timeout on the 4-option override prompt, auto-defaults to `Deny`.
- **Atomic Writes**: Session flags file must use atomic write operations to prevent concurrent corruption.

## Functional Requirements

### FR-1: IDLE Mode (No Active Track)
- When no track is active (checked via `superconductor/tracks.md` status — no `[~]` entries), the
  `policies/superconductor.toml` policy rules SHALL be disabled or bypassed.
- All tool calls (`write_file`, `run_shell_command`, MCP tools) shall be permitted without prompting.
- A lightweight status banner shall show the current permission mode.

### FR-2: Planner Permission Inference
- During `/superconductor:new-track` planning phase, the Dreamer agent SHALL scan the spec description
  for hardware/capability keywords.
- Detected capabilities (USB, network, arbitrary shell, FS outside root) are emitted to
  `superconductor/tracks/<track_id>/permission-manifest.toml`.
- The permission manifest is presented to the user alongside the plan for review/approval.
- Upon plan approval, the manifest becomes the active policy for that track's execution.

### FR-3: Global YOLO Mode Flag
- User can invoke `--yolo` flag or a `/superconductor:yolo` command to remove all restrictions.
- YOLO mode is session-scoped by default; with explicit `--persist` it writes to
  `.superconductor/session-flags.json`.
- A visible warning banner is shown when YOLO mode is active.
- Every tool call in YOLO mode appends a line to `superconductor/logs/yolo-audit.log`.
- `--persist` requires a double-confirmation prompt from the user.

### FR-4: Per-Blocker Inline Override
- When a policy restriction fires during track execution, instead of a hard block, show an interactive
  prompt with four options:
  - **Allow Once**: grants this specific call, then re-applies policy
  - **Allow for Track**: adds this tool/command to the track's `permission-manifest.toml` dynamically
  - **YOLO (Session)**: activates global YOLO for the remainder of the session
  - **Deny**: blocks the call and logs it
- Prompt has a 60-second timeout; auto-defaults to `Deny` on timeout.

### FR-5: Capability Allowlist
The following capabilities SHALL be grantable through the permission system:
- USB device enumeration / hardware access (`lsusb`, `udevadm`, `/dev/bus/usb`, etc.)
- Arbitrary shell commands (removes `commandPrefix` allowlist restriction)
- Network egress to any domain (removes domain restrictions)
- File system access outside project root
- Persistent elevated permissions across CLI restarts (via `session-flags.json`)

### FR-6: Permission Manifest Schema
`permission-manifest.toml` shall have a defined schema:

```toml
[meta]
track_id = "..."
generated_at = "..."
inferred_by = "auto|manual"

[capabilities]
usb_access = false
arbitrary_shell = false
network_unrestricted = false
fs_outside_root = false
persistent = false

[allowlist]
shell_prefixes = []    # specific shell command prefixes allowed
domains = []           # specific network domains allowed
paths = []             # specific FS paths outside root allowed
```

### FR-7: State Detection
- Active track detection: check `tracks.md` for any entry with status `[~]` (in-progress).
- State is maintained via `fs.watch` on `tracks.md` with in-memory boolean cache.
- State is re-evaluated at minimum every 200ms; forced re-evaluation on manifest write.

## Non-Functional Requirements

- **NFR-1 Performance:** State detection must add <5ms overhead per tool call (achieved via fs.watch cache).
- **NFR-2 Auditability:** All YOLO-bypass events are append-only logged with timestamp, tool name, and args hash.
- **NFR-3 Transparency:** Current permission mode is always surfaced (idle / tracked:\<track_id\> / yolo).
- **NFR-4 Backward Compatibility:** Existing `policies/superconductor.toml` format is preserved; new manifest
  system extends it via layered evaluation, not replacement.
- **NFR-5 Security:** Persistent YOLO requires explicit double-confirmation. `tracks.md` modification is
  tracked separately to prevent IDLE-mode spoofing.
- **NFR-6 Concurrency:** Session flags writes are atomic to prevent corruption from concurrent agents.

## Acceptance Criteria

- [ ] AC-1: With no active track, running `write_file` or any shell command does NOT trigger a policy prompt.
- [ ] AC-2: Starting a track with USB-related keywords in the spec generates a `permission-manifest.toml`
       with `usb_access = true`.
- [ ] AC-3: Activating `--yolo` removes all policy restrictions AND creates an audit log entry for every
       subsequent tool call.
- [ ] AC-4: Per-blocker override prompt appears when a policy blocks a call during track execution, with
       all 4 options functional.
- [ ] AC-5: `Allow for Track` dynamically updates the active `permission-manifest.toml` without restarting.
- [ ] AC-6: YOLO mode with `--persist` writes to `session-flags.json` and survives CLI restart (after
       double-confirmation).
- [ ] AC-7: Current permission mode is visible/queryable at any time via banner.
- [ ] AC-8: Inline prompt auto-denies after 60-second timeout.
- [ ] AC-9: State detection adds <5ms overhead measured in benchmark tests.

## Out of Scope

- GUI/visual permission management UI (future track)
- Remote/team-shared permission manifests (future track)
- Audit log rotation/archival (future track)
- Per-tool granular rate limiting (separate concern)
- Permission system for non-Superconductor CLI contexts
