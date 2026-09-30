# Superconductor Context

If a user mentions a "plan" or asks about the plan, and they have used the superconductor extension in the current session, they are likely referring to the `superconductor/tracks.md` file or one of the track plans (`superconductor/tracks/<track_id>/plan.md`).

## Universal File Resolution Protocol

**PROTOCOL: How to locate files.**
To find a file (e.g., "**Product Definition**") within a specific context (Project Root or a specific Track):

1.  **Identify Index:** Determine the relevant index file:
    -   **Project Context:** `superconductor/index.md`
    -   **Track Context:**
        a. Resolve and read the **Tracks Registry** (via Project Context).
        b. Find the entry for the specific `<track_id>`.
        c. Follow the link provided in the registry to locate the track's folder. The index file is `<track_folder>/index.md`.
        d. **Fallback:** If the track is not yet registered (e.g., during creation) or the link is broken:
            1. Resolve the **Tracks Directory** (via Project Context).
            2. The index file is `<Tracks Directory>/<track_id>/index.md`.

2.  **Check Index:** Read the index file and look for a link with a matching or semantically similar label.

3.  **Resolve Path:** If a link is found, resolve its path **relative to the directory containing the `index.md` file**.
    -   *Example:* If `superconductor/index.md` links to `./workflow.md`, the full path is `superconductor/workflow.md`.

4.  **Fallback:** If the index file is missing or the link is absent, use the **Default Path** keys below.

5.  **Verify:** You MUST verify the resolved file actually exists on the disk.

**Standard Default Paths (Project):**
- **Product Definition**: `superconductor/product.md`
- **Tech Stack**: `superconductor/tech-stack.md`
- **Workflow**: `superconductor/workflow.md`
- **Product Guidelines**: `superconductor/product-guidelines.md`
- **Tracks Registry**: `superconductor/tracks.md`
- **Tracks Directory**: `superconductor/tracks/`
- **Agent Configuration**: `superconductor/agent-config.md`

**Standard Default Paths (Track):**
- **Specification**: `superconductor/tracks/<track_id>/spec.md`
- **Implementation Plan**: `superconductor/tracks/<track_id>/plan.md`
- **Metadata**: `superconductor/tracks/<track_id>/metadata.json`

## Design OS Integration & Agent Configuration

- **MCP Server**: The `superconductor-kernel` MCP server is configured in `mcp_config.json` at the extension root, and runs using node on the local compiled build (`packages/superconductor-kernel/dist/index.js`).
- **Skills**: When the superconductor plugin is installed, 14 companion Design OS skills (including orchestrator, vision, roadmap, theming, design-system, i18n, app-shell, component-adapter, etc.) are automatically registered and available for discovery.

## SWARM GUARDRAILS & PLANNING/DISPATCH DOGMA

- **Planning & Dispatch Dogma (Anti-Hero Protocol)**: The primary/root session operates strictly as **Planning & Dispatch Only**. Under NO circumstances—**even under YOLO mode**—may the root agent directly mutate application source code files (`src/**`, `app/**`, `packages/*/src/**`).
  - All code modifications, refactorings, feature implementations, and bug fixes must be delegated to a Processor subagent via `invoke_subagent` (or `send_message`).
  - If the root agent attempts to write directly to application source code files, the operation is blocked and it must emit the following exact error message:
    `"[Superconductor] Rogue write attempt detected. Aborting. I must dispatch a Processor subagent instead."`
- When Superconductor is active (any mode): root agent MUST NOT commit a track branch until Quorum loop is complete and green. Quorum FSM state is persisted to `.superconductor/quorum/` or `superconductor/logs/quorum-state.json`.
- **Kernel Tool Restriction**: When using `superconductor-kernel` tools (e.g., `kernel_graph_get_node`, `kernel_graph_get_neighbors`, `kernel_graph_shortest_path`, `kernel_intelligence_get_hotspots`, `kernel_intelligence_get_dependency_graph`, `kernel_policy_get_mode`, etc.), ensure appropriate permissions are granted according to the current mode.
- **Adaptive Permission Guardrails**:
  - **IDLE MODE bypass**: In IDLE mode, general exploration is permitted, but the root agent MUST NOT modify `superconductor/tracks.md` directly to spoof or bypass IDLE mode checks without prior authorization.
  - **TRACKED MODE**: Adhere to the capabilities granted in `permission-manifest.toml`. The Tool Call Interceptor will block unauthorized access and prompt the user.
  - **YOLO MODE**: All permission restrictions are bypassed for exploration, but activities are tracked in the append-only `yolo-audit.log`. **Note**: Planning & Dispatch Dogma remains strictly enforced even in YOLO mode — root session cannot directly mutate application source files and must delegate code edits to subagents.
- **No Polling Loops (PROHIBITED)**: After spawning subagents or background tasks, the root agent MUST stop calling tools and yield. Maximum 1 status check per turn. Polling `manage_subagents list` in a loop BLOCKS incoming messages and is PROHIBITED. Violation causes stalls — subagent completions cannot be delivered while the agent is actively calling tools.
- **No Hero-Agenting in Remediation (PROHIBITED)**: When quorum returns `NEEDS_FIXES`, the root agent MUST NOT self-fix using `write_to_file`, `multi_replace_file_content`, `replace_file_content`, or `run_command`. MUST dispatch `DomainSplitRemediationDispatcher` with domain-split parallel agents. If the root agent catches itself self-fixing during remediation, it must emit: `"[Superconductor] Hero-agenting detected in remediation. Aborting. I must dispatch domain-split remediators instead."`

## AD-HOC TRIAGE PROTOCOL

**This rule is always active** unless `triage-mode: off` is set in `superconductor/agent-config.md`.

### Detection Signals (MUST trigger triage routing)

The following signals in a user message MUST activate triage routing:
- Stack traces (any multi-line error output with file paths and line numbers)
- `TypeError`, `Exception`, `Error:` (any variant)
- The phrases: `"not working"`, `"broken"`, `"failing"`, `"unexpected"`, `"unexpected behaviour"`, `"assertion failed"`, `"test failure"`

### False-Positive Guard (explicit — do NOT trigger triage for these)

The following inputs MUST NOT trigger triage routing — treat them as normal agent interactions:
- General questions about how code works (e.g., "How does X work?", "What does Y do?")
- `/superconductor:review` invocations — these follow the standalone review protocol, not triage
- Planning discussions, architecture questions, or feature brainstorming
- General refactoring requests that do not describe an error or failure
- Code questions without error language (e.g., "Can you explain this function?", "What's the best way to do X?")

### Scope Heuristics

Once triage is triggered, assess scope and classify as exactly one of:

| Signal | Small | Medium | Large |
|--------|-------|--------|-------|
| Files affected | 1 | 2–4 | 5+ or cross-package |
| Root cause clarity | Obvious, isolated | Probable, contained | Unknown, systemic |
| New API needed? | No | Maybe | Yes |
| Stack trace present? | Points to single fn | Spans ≤2 modules | Spans many modules |
| User language | "typo", "off-by-one" | "inconsistent", "regression" | "broken everywhere", "TypeError in X cascades into Y" |
| Estimated fix size | < 20 lines, 1 file | < 50 lines, 2–4 files | > 50 lines across files |

### Routing Outcomes

- **SMALL** → invoke `correctness-reviewer` standalone → standalone remediation loop (no track created)
- **MEDIUM** → invoke 2-reviewer quorum (`correctness-reviewer` + `adversarial-reviewer`) → standalone remediation loop (no track created)
- **LARGE** → announce shift to Track Planning Mode → invoke Dreamer subagent to write `spec.md` + `plan.md` → auto-execute via `swarm-execute --headless --triage-source` → full 5-reviewer quorum → Oracle gate → merge

### Anti-Hero-Agenting Rule

The agent MUST NOT write any inline fix before completing the triage assessment. Doing so is a protocol violation equivalent to hero-agenting in remediation.

### `triage-mode` Setting

Read `triage-mode` from `superconductor/agent-config.md` before routing:
- `auto` (default) — detect and route silently; announce the routing decision before dispatching
- `ask` — detect, then call `ask_question` (NOT `ask_user`) to confirm routing before dispatching
- `off` — disable the entire protocol; behave as if this section does not exist

See `skills/triage/SKILL.md` for full orchestration protocol, decision tree, and forced-invocation handling.

