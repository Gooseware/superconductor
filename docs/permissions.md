# Adaptive Permission System

Superconductor uses an Adaptive Permission System to manage agent capabilities dynamically based on the current context (IDLE, TRACKED, or YOLO).

## Permission Modes

1. **IDLE Mode** (`🟢 IDLE MODE`):
   - Active when no track is currently being implemented.
   - Most restrictions are lifted to allow for general exploration, setup, and planning.
   - Modification of `superconductor/tracks.md` to spoof IDLE mode requires a prior grant.

2. **TRACKED Mode** (`🔒 TRACKED [track_id]`):
   - Active when implementing a specific track.
   - Tool execution is scoped strictly to the capabilities defined in the track's `permission-manifest.toml`.
   - Any blocked tool call triggers a 60-second inline override prompt for the user (Allow Once, Allow for Track, YOLO, or Deny).

3. **YOLO Mode** (`⚠️ YOLO MODE`):
   - Global override that bypasses all restrictions.
   - Activated via `/superconductor:yolo` command or the inline override prompt.
   - Can be session-scoped or persisted to `.superconductor/session-flags.json`.
   - Every tool call executed in YOLO mode is written to an append-only audit log at `superconductor/logs/yolo-audit.log`.

## Capability Reference

The following capabilities can be defined in a track's permission manifest:

| Capability Flag | Description | Keyword Heuristics |
| :--- | :--- | :--- |
| `usb_access` | Access to USB devices (e.g., `lsusb`, `udevadm`) | USB, lsusb, udevadm, /dev/bus |
| `network_unrestricted` | Unrestricted network access | curl, fetch, HTTP, API, network |
| `arbitrary_shell` | Ability to spawn arbitrary shell commands | shell, bash, exec, spawn, subprocess |
| `fs_outside_root` | File system access outside the project root | Absolute paths outside project |

## Manifest Schema (`permission-manifest.toml`)

When a new track is planned, the `KeywordPermissionInferrer` automatically generates a `permission-manifest.toml` based on the spec text.

```toml
[metadata]
track_id = "feature_x"
inferred_by = "auto" # or "manual"
created_at = "2026-08-01T00:00:00Z"

[capabilities]
usb_access = false
network_unrestricted = true
arbitrary_shell = false
fs_outside_root = false
```
