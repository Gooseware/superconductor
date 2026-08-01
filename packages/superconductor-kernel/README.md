# Design OS Kernel (MCP Server)

The "Brain" of the Design OS. This Model Context Protocol (MCP) server provides the intelligence and automation required to discover, install, and publish components, as well as managing generative design themes.

## Features

- **Registry Sync**: Automatically clone and index remote component repositories.
- **Smart Recommendation**: Semantic search based on design context and intent.
- **Automated Installation**: Dependency-aware component ejection into your project.
- **Dogma Verification**: Programmatic AST analysis (Tailwind 4, Type safety) to ensure code quality.
- **Generative Theming**: Persistent HSL-based theme management with context overrides and dark mode support.

## Prerequisites

- **Node.js**: v18 or higher.
- **Git**: Configured with SSH for GitLab access (`git@gitlab.com:socialhippos/...`).
- **SQLite**: Local state is stored in `local.db`.

## Installation

1.  **Clone the repository** (if using standalone):
    ```bash
    git clone git@gitlab.com:socialhippos/design-os-kernel.git
    cd design-os-kernel
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Build the server**:
    ```bash
    npm run build
    ```

## Configuration

The server expects the following environment/structure:
- **Cache**: Repositories are cached in `~/.design_os/cache`.
- **Database**: Local SQLite DB created on first run.

## Usage in Claude Desktop / OpenCode

Add the following to your MCP settings file:

```json
{
  "mcpServers": {
    "design-os-kernel": {
      "command": "node",
      "args": ["/path/to/design-os-kernel/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/your/app/path"
      }
    }
  }
}
```

## Tools

- `registry_sync`: Sync components from GitLab.
- `registry_recommend`: Get AI-powered component suggestions.
- `registry_install`: Eject a component into your `app/components`.
- `registry_propose_publish`: Validate and prep a component for the registry.
- `set_theme`: Dynamically update the design system tokens.
