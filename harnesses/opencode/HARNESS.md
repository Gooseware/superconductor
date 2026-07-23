# OpenCode Harness Adapter

## Overview

OpenCode integrates with Superconductor via the universal MCP server protocol or CLI subprocess invocations.

## Integration

1. **MCP Mode:** Register `superconductor-mcp-server` in OpenCode's tool configuration settings.
2. **Subprocess Mode:** Invoke `npx superconductor context --json` to fetch the unified agent context bundle.
