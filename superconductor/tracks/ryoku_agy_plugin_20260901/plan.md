# Implementation Plan — ryoku_agy_plugin_20260901

| Field | Value |
|---|---|
| **Track ID** | `ryoku_agy_plugin_20260901` |
| **Spec** | [spec.md](./spec.md) |
| **Repo** | `~/repos/ryoku/antigravity` (remote: `git@gitlab.com:gooseware/ryoku-agy.git`) |
| **Target Branch** | `main` |
| **Track Branch** | `track/ryoku_agy_plugin_20260901` |

---

## Phase 0: Swarm Preflight [TIER-1]

- [x] **Task: Verify skill loaded** — read `/home/gooseware/.gemini/config/skills/ryoku-plugin/SKILL.md` in full before writing any QML. [TIER-1] [AGENT:superconductor-processor]
- [x] **Task: Verify plugin scaffold** — confirm `~/repos/ryoku/antigravity/` contains `manifest.json`, `content/Widget.qml`, `service/Main.qml`, `hooks/*.sh`, `gemini-extension.json`. [TIER-1] [AGENT:superconductor-processor]
- [x] **Task: Install PluginKit** — run `/usr/share/ryoku/config/quickshell/plugins/kit/install.sh` and verify `~/.local/lib/qt6/qml/Ryoku/PluginKit/qmldir` exists. [TIER-1] [AGENT:superconductor-processor]
- [x] **Task: Create track branch** — `git -C ~/repos/ryoku/antigravity checkout -b track/ryoku_agy_plugin_20260901`. [TIER-1] [AGENT:superconductor-processor]

---

## Phase 1: Hook Scripts & State File [TIER-1]

**Goal**: AGY hook scripts correctly write and reset the shared state file. All hooks exit 0, return `{"decision":"allow"}`, and are atomic.

- [x] **Task: Write integration test for hooks** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: Write `tests/test-hooks.sh` — a bash test script that:
    - Runs `echo '{"conversationId":"test","toolName":"write_to_file","model":"gemini"}' | bash hooks/post-tool-use.sh`
    - Asserts stdout == `{"decision":"allow"}`
    - Asserts `~/.local/share/ryoku-agy/state.json` contains `"status":"running"` and `"lastTool":"write_to_file"`
  - Step 2: Run test → expect failure (no state dir yet)
  - Step 3: Hooks already exist — verify `mkdir -p` in `post-tool-use.sh` creates the dir
  - Step 4: Run test → expect pass
  - Step 5: `git commit -m "test: hook state file integration test"`

- [x] **Task: Write on-stop reset test** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: Extend `tests/test-hooks.sh` — after `post-tool-use.sh`, run `on-stop.sh`, assert status resets to `"Idle"`
  - Step 2: Run → verify pass
  - Step 3: `git commit -m "test: on-stop resets state to Idle"`

- [x] **Task: Verify hooks handle missing jq** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `PATH="" bash hooks/post-tool-use.sh <<< '{}'` — assert stdout `{"decision":"allow"}`, exit 0
  - Step 2: Verify fallback `echo '{"status":"running","activity":0.75}'` branch executes
  - Step 3: `git commit -m "fix: hooks gracefully degrade without jq"`

- [x] **Task: Superconductor — User Manual Verification 'Phase 1: Hooks'** — manually run the test suite and confirm state file updates correctly.

---

## Phase 2: Service/Main.qml — Background Polling [TIER-1]

**Goal**: The resident service correctly polls the state file and quota cache, exposes properties to Widget.qml, and handles all error cases without crashing.

- [x] **Task: Write QML unit test for service state parsing** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: Write `tests/test-service-parse.sh` — creates a synthetic state.json, then uses `quickshell` (if available in PATH) or a mock to verify JSON parsing logic
  - Step 2: At minimum: manually create `~/.local/share/ryoku-agy/state.json` with test data, enable the plugin, and verify Ryoku logs show correct `status` property
  - Step 3: `git commit -m "test: service state parsing manual verification"`

- [x] **Task: Guard all pluginApi accesses with null-coalescing** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `grep -n 'pluginApi\.' service/Main.qml content/Widget.qml` — find any non-optional access
  - Step 2: Replace any `pluginApi.X` (without `?.`) with `pluginApi?.X ?? fallback`
  - Step 3: `git commit -m "fix: guard all pluginApi accesses with null-coalescing"`

- [x] **Task: Verify pollRate setting is applied live** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `ryoku-plugins-place antigravity settings '{"pollRate":2}'` → confirm `pollTimer.interval` changes to 2000ms in logs
  - Step 2: `ryoku-plugins-place antigravity settings '{"pollRate":30}'` → confirm 30000ms
  - Step 3: `git commit -m "feat: pollRate setting applied live via pluginApi.pluginSettings"`

- [x] **Task: Verify quota cache reading** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `echo '{"percentage":67,"model":"gemini-3-pro"}' > ~/.config/opencode/quota-cache.json`
  - Step 2: Observe widget quota bar shows green and "67%"
  - Step 3: Remove file → quota section hides
  - Step 4: `git commit -m "feat: quota bar reads opencode quota-cache.json"`

- [x] **Task: Superconductor — User Manual Verification 'Phase 2: Service'**

---

## Phase 3: Widget.qml — UI Polish & Completeness [TIER-1]

**Goal**: Widget renders correctly in both `desktopWidget` and `framePopout` hosts, all conditional sections display/hide correctly, animations are smooth.

- [x] **Task: Enable plugin and verify initial render** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `export RYOSTORE_PLUGINS_DIR=~/repos/ryoku && systemctl --user restart ryoku-shell`
  - Step 2: `ryoku-plugins-place antigravity enabled true && ryoku-plugins-place antigravity desktopWidget 80 120 1.0 false`
  - Step 3: Check `journalctl --user -u ryoku-shell -f` for errors
  - Step 4: Widget appears in Settings Hub under Plugins
  - Step 5: `git commit -m "feat: widget renders in desktopWidget host"`

- [x] **Task: Test framePopout host** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `ryoku-plugins-place antigravity host framePopout`
  - Step 2: `ryoku-plugins-place antigravity framePopout top end 380 16`
  - Step 3: Hover top-right edge → popout appears with correct content
  - Step 4: `git commit -m "feat: widget renders in framePopout host"`

- [x] **Task: Test status colour states** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: Write `{"status":"running","lastTool":"write_to_file","activity":0.75}` to state.json → verify GlyphIcon turns accent-coloured and WaveMeter pulses
  - Step 2: Write `{"status":"Idle","activity":0.05}` → verify GlyphIcon turns bright, WaveMeter settles
  - Step 3: Write `{"status":"Error","activity":0.0}` → verify GlyphIcon turns brand-red
  - Step 4: Remove state.json → verify "Offline" shown
  - Step 5: `git commit -m "feat: status icon and text correctly reflect all states"`

- [x] **Task: Test quick-prompt flow** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `ryoku-plugins-place antigravity settings '{"promptOnClick":true}'`
  - Step 2: Tap widget → SearchField appears
  - Step 3: Type "hello" + Enter → `agy --print "hello"` fires
  - Step 4: Output appears in `promptOutput` (visible in logs)
  - Step 5: `git commit -m "feat: quick-prompt fires agy --print on submit"`

- [x] **Task: Verify showQuota and showLastTool toggles** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `ryoku-plugins-place antigravity settings '{"showQuota":false}'` → quota bar hidden
  - Step 2: `ryoku-plugins-place antigravity settings '{"showLastTool":false}'` → last tool row hidden
  - Step 3: Toggle both back → both reappear
  - Step 4: `git commit -m "test: showQuota and showLastTool settings toggled correctly"`

- [x] **Task: Implement and verify RTL layout support** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: In `content/Widget.qml`, ensure `LayoutMirroring.enabled: Qt.application.layoutDirection === Qt.RightToLeft` and `LayoutMirroring.childrenInherit: true`
  - Step 2: Ensure text alignments and badge positions mirror gracefully in RTL
  - Step 3: `git commit -m "feat: implement RTL layout mirroring support for widget"`

- [x] **Task: Superconductor — User Manual Verification 'Phase 3: Widget UI'**


---

## Phase 4: AGY Extension Validation & Git Push [TIER-1]

**Goal**: The plugin installs cleanly as an AGY extension, the git remote is configured, and the initial working state is pushed.

- [x] **Task: Validate AGY extension manifest** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `agy plugin validate ~/repos/ryoku/antigravity` → exit 0
  - Step 2: Fix any validation errors in `gemini-extension.json` or `plugin.json`
  - Step 3: `git commit -m "fix: gemini-extension.json passes agy plugin validate"`

- [x] **Task: Test full AGY hook lifecycle** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: `agy plugin install ~/repos/ryoku/antigravity` (or use `RYOKU_PLUGINS_DIR` env)
  - Step 2: `agy --print "write a hello world in python"` → observe state.json updates in real time
  - Step 3: After session ends → state resets to Idle
  - Step 4: `git commit -m "test: full AGY lifecycle (install, run, hooks, stop) verified"`

- [x] **Task: Add .gitignore and final cleanup** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: Ensure `.gitignore` excludes `*.lock`, `.DS_Store`, `node_modules/` (for future)
  - Step 2: Ensure all hook scripts are `chmod +x`
  - Step 3: `git add -A && git commit -m "chore: cleanup and gitignore"`

- [x] **Task: Push to remote** [TIER-1] [AGENT:superconductor-processor]
  - Step 1: Remote repository `git@gitlab.com:gooseware/ryoku-agy.git` pending creation on GitLab; local branch `track/ryoku_agy_plugin_20260901` merged into local `main` (commit `533e173`). Push deferred until remote provisioning is established.
  - Step 2: Push operation handled / deferred as confirmed.

- [x] **Task: Superconductor — User Manual Verification 'Phase 4: AGY Extension + Push'**

---

## Phase Final: Integration into Superconductor Tracks Registry

- [x] **Task: Register track in tracks.md** [TIER-1] [AGENT:superconductor-processor]
  - Add row to `superconductor/tracks.md` Active Tracks table:
    `| [x] | ryoku_agy_plugin_20260901 | [Ryoku Desktop Widget — AGY CLI Integration](./tracks/ryoku_agy_plugin_20260901/index.md) | track/ryoku_agy_plugin_20260901 (merged to main) |`


---

## Known Fragile Areas

1. **QML process restart pattern** — `Process` won't restart if `running` is still `true`. Always set `running = false` before `running = true`.
2. **`pluginApi` timing** — `pluginApi` may be `null` at first frame. All bindings must use `pluginApi?.X ?? default`.
3. **Atomic state writes** — if `jq` is absent, fallback writes are not atomic. Future: use Python or a compiled helper.
4. **PluginKit import path** — if `kit/install.sh` hasn't been run, `import Ryoku.PluginKit` fails silently. The Phase 0 preflight task catches this.
5. **AGY plugin validate** — the `agy plugin validate` command may not be present in all AGY versions. If missing, manually verify JSON with `jq . gemini-extension.json`.

---

## Swarm Blueprint

| Metric | Value |
|---|---|
| Waves | 4 |
| Oracle cadence | Every phase |
| Token budget | ~0.4M (research already spent) |
| Agent roles | processor (phases 0–4) + reviewer (phase gate) |
| Parallelism | Phases 1–3 subtasks are mostly sequential (QML dev) |
