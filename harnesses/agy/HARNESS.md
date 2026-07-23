# AGY (Google Antigravity) Harness Adapter

## Overview

The AGY harness connects to `@superconductor/core` via:
1. **MCP Server Integration:** Registered in `gemini-extension.json` under `mcpServers.superconductor`.
2. **Skill Shims:** 28 skills in `skills/` whose companion scripts import from `@superconductor/core`.

## Configuration

In `gemini-extension.json`:
```json
"mcpServers": {
  "superconductor": {
    "command": "node",
    "args": [
      "${extensionPath}/packages/superconductor-mcp-server/dist/index.js"
    ]
  }
}
```
