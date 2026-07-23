# Claude Desktop Harness Adapter

## Overview

Claude Desktop connects to Superconductor using the Standard Model Context Protocol (MCP) server exposed by `@superconductor/mcp-server`.

## Setup Instructions

Add the following block to your `claude_desktop_config.json` (located at `~/.config/Claude/claude_desktop_config.json` or `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "superconductor": {
      "command": "node",
      "args": [
        "/absolute/path/to/superconductor/packages/superconductor-mcp-server/dist/index.js"
      ]
    }
  }
}
```

## Available MCP Tools

- `superconductor_get_agent_context`
- `superconductor_run_intelligence`
- `superconductor_get_track_status`
- `superconductor_run_review`
- `superconductor_check_plan_gap`
- `superconductor_run_abi_retrospective`
