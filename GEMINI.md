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

- **MCP Server**: The `design-os-kernel` MCP server is configured in `mcp_config.json` at the extension root, and runs using node on the local compiled build (`packages/design-os-kernel/dist/index.js`).
- **Skills**: When the superconductor plugin is installed, 14 companion Design OS skills (including orchestrator, vision, roadmap, theming, design-system, i18n, app-shell, component-adapter, etc.) are automatically registered and available for discovery.

## SWARM GUARDRAILS

- When Superconductor is active + swarm mode: root agent MUST NOT write to `packages/*/src/**` directly. Must use `invoke_subagent` → Processor.
- When Superconductor is active (any mode): root agent MUST NOT commit a track branch until Quorum loop is complete and green.
- If the root agent catches itself violating this rule, it must emit the following exact error message:
  "[Superconductor] Rogue write attempt detected. Aborting. I must dispatch a Processor subagent instead."
- **Adaptive Permission Guardrails**:
  - **IDLE MODE bypass**: In IDLE mode, general exploration is permitted, but the root agent MUST NOT modify `superconductor/tracks.md` directly to spoof or bypass IDLE mode checks without prior authorization.
  - **TRACKED MODE**: Adhere to the capabilities granted in `permission-manifest.toml`. The Tool Call Interceptor will block unauthorized access and prompt the user.
  - **YOLO MODE**: All restrictions are bypassed, but activities are tracked in the append-only `yolo-audit.log`. Use YOLO only when explicitly authorized or persistently required.
