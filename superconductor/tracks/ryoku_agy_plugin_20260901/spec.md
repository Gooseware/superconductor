# Specification — ryoku_agy_plugin_20260901

| Field | Value |
|---|---|
| **Track ID** | `ryoku_agy_plugin_20260901` |
| **Title** | Ryoku Desktop Widget — AGY CLI Integration |
| **Type** | Feature |
| **Status** | Planned |
| **Created** | 2026-09-01 |
| **Repo** | `git@gitlab.com:gooseware/ryoku-agy.git` |
| **Local Path** | `~/repos/ryoku/antigravity/` |

---

## Overview & Problem Statement

The Antigravity (AGY) CLI is the user's primary AI coding agent. When AGY is running — executing tools, writing code, making decisions — the user has no ambient awareness of what it's doing unless they're staring at the terminal. This creates a disconnection between the "AI layer" and the "desktop layer" of the Ryoku workflow.

**OpenCode already solved this for its TUI** with a quota display and model switcher embedded in the header. The goal of this track is to solve the same problem at the **desktop shell level**, integrating AGY's lifecycle into the Ryoku Wayland shell as a first-class desktop widget — visible at all times, on any workspace, without switching focus.

The integration pattern mirrors what opencode-antigravity-auth/quota does for OpenCode, but adapted for:
- A **Ryoku QML plugin** (not a terminal TUI)
- **Quickshell.Io Process spawning** (not an in-process AI SDK provider)
- A **shared state file IPC bridge** (not a custom `fetch` interceptor)
- **AGY lifecycle hook scripts** (bash, reading/writing JSON)

---

## Architecture (Synthesised from Research)

```
┌─────────────────────────────────────────┐
│           AGY CLI Session               │
│                                         │
│  PreToolUse  ──► hooks/pre-tool-use.sh  │
│  PostToolUse ──► hooks/post-tool-use.sh │
│  Stop        ──► hooks/on-stop.sh       │
└──────────────────┬──────────────────────┘
                   │  writes (atomic, flock)
                   ▼
         ~/.local/share/ryoku-agy/state.json
         {status, lastTool, model, conversationId, activity, updatedAt}
                   │
                   │  polls every N seconds (Timer + Process)
                   ▼
┌─────────────────────────────────────────┐
│      Ryoku Shell (Quickshell)           │
│                                         │
│  service/Main.qml  (QtObject, resident) │
│    ├─ polls state.json                  │
│    ├─ polls quota-cache.json (60s)      │
│    └─ can fire `agy --print` prompts    │
│                                         │
│  content/Widget.qml  (Card, renders)   │
│    ├─ Status + GlyphIcon                │
│    ├─ WaveMeter (activity)              │
│    ├─ Last tool name                    │
│    ├─ Quota bar (green/amber/red)       │
│    └─ Optional quick-prompt SearchField │
└─────────────────────────────────────────┘
```

**Quota cache** is shared with the OpenCode AGY integration — the same `~/.config/opencode/quota-cache.json` file written by the autopilot quota service. The Ryoku plugin reads it; it does not need to implement its own quota polling (Phase 1).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Plugin runtime | QML 6 + Quickshell |
| UI components | `Ryoku.PluginKit` (Card, GlyphIcon, WaveMeter, MicroLabel, CornerTicks, SearchField) |
| Process IPC | `Quickshell.Io` (Process + SplitParser / StdioCollector) |
| Hook scripts | bash + jq (atomic writes via flock + mktemp) |
| AGY extension | `gemini-extension.json` (hooks: PostToolUse, PreToolUse, Stop) |
| State format | JSON (single flat file, atomic writes) |
| Git remote | `git@gitlab.com:gooseware/ryoku-agy.git` |

---

## Functional Requirements

**FR1** — The widget MUST render in `desktopWidget` mode as a `Card` displaying: session status text, activity WaveMeter, last-executed tool name (when available), and quota bar.

**FR2** — The widget MUST support `framePopout` mode (edge: `top`, align: `end`) with the same content adapted to `density: "full"`.

**FR3** — The background `service/Main.qml` MUST poll `~/.local/share/ryoku-agy/state.json` at a user-configurable interval (2–30s, default 5s).

**FR4** — The AGY `PostToolUse` hook MUST write `{status, lastTool, model, conversationId, activity, updatedAt}` to the state file atomically (flock + tmp rename).

**FR5** — The AGY `Stop` hook MUST reset state to `{status:"Idle", activity:0.05}` when a session ends.

**FR6** — The quota bar MUST read `~/.config/opencode/quota-cache.json` and render green (≥50%), amber (≥20%), red (<20%). It MUST gracefully hide when the file is absent.

**FR7** — Settings (`pollRate`, `showQuota`, `showLastTool`, `promptOnClick`, `agyCli`, `stateFile`) MUST be read from `pluginApi.pluginSettings` and applied live without a shell restart.

**FR8** — The `gemini-extension.json` MUST register the three hook scripts so `agy plugin install ~/repos/ryoku/antigravity` installs them automatically.

**FR9** — The plugin MUST install cleanly via `RYOSTORE_PLUGINS_DIR=~/repos/ryoku` without any build step (pure QML + bash).

**FR10** — The plugin MUST NOT crash or produce QML errors when AGY is not running (all `svc?.property` accesses guarded with null-coalescing).

---

## Non-Functional Requirements

**NFR1 — Performance**: State file poll MUST complete in <50ms. Process spawning must not block the QML UI thread — `Process` is async by nature.

**NFR2 — Resilience**: If `state.json` is absent, malformed, or locked, the widget MUST display "Offline" — never crash.

**NFR3 — Atomicity**: Hook scripts MUST use `flock + mktemp + mv` to prevent partial-write corruption read by the widget.

**NFR4 — Zero build**: Phase 1 is pure QML + bash. No npm, no compile step. `agy plugin install` must work immediately after `git clone`.

**NFR5 — Compatibility**: Plugin must work with Ryoku v0.40+ (currently `v0.40.2`) and Quickshell's `Quickshell.Io` API.

---

## Acceptance Criteria

- **AC1**: `RYOSTORE_PLUGINS_DIR=~/repos/ryoku systemctl --user restart ryoku-shell` → widget appears in Ryoku Settings Hub under "Plugins".
- **AC2**: `ryoku-plugins-place antigravity enabled true && ryoku-plugins-place antigravity desktopWidget 80 120 1.0 false` → widget renders on desktop with no console errors.
- **AC3**: When `agy --print "hello"` is running, the status shows "running", the WaveMeter pulses at ~0.75 frac, and lastTool updates to the first tool called.
- **AC4**: When AGY session ends, status resets to "Idle" and WaveMeter settles to 0.05 within one poll cycle.
- **AC5**: When `~/.config/opencode/quota-cache.json` contains `{"percentage":30}`, the quota bar renders amber.
- **AC6**: When `~/.config/opencode/quota-cache.json` is absent, the quota bar section is hidden (not errored).
- **AC7**: Changing `pollRate` in Ryoku Settings → the poll interval updates live without restarting the shell.
- **AC8**: `promptOnClick: true` → tapping the widget reveals a `SearchField`; submitting it fires `agy --print <text>` and the output is readable in the widget's `promptOutput`.
- **AC9**: `agy plugin validate ~/repos/ryoku/antigravity` exits 0 (valid `gemini-extension.json` + `plugin.json`).
- **AC10**: All three hook scripts (`post-tool-use.sh`, `pre-tool-use.sh`, `on-stop.sh`) are executable (`chmod +x`), handle missing `jq` gracefully, and always exit 0 with `{"decision":"allow"}` on stdout.

---

## Out of Scope (Phase 1)

- Interactive desktop approval dialogs for `PreToolUse` (Phase 2)
- Conversation history viewer in `framePopout` (Phase 3)
- Multi-account quota rotation indicator (Phase 4)
- Publishing to the official Ryostore
- Native quota polling (reuses OpenCode's quota cache)
- Any Node.js / MCP bridge (future enhancement)
