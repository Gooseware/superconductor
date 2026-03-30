# Tech Stack

## Type
Gemini CLI Extension

## Commands Architecture
- **Language:** TOML-based command specification files.
- **Location:** `commands/conductor/`.
- **Command Files:**
    - `setup.toml`: Project initialization and scaffolding.
    - `newTrack.toml`: Track creation and planning logic.
    - `implement.toml`: Task execution and status management.
    - `status.toml`: Project and track status reporting.
    - `revert.toml`: Git-aware logic for undoing changes.
    - `review.toml`: Standards and guideline compliance checking.

## Supporting Templates
- **Location:** `templates/`.
- **Workflow:** `templates/workflow.md` for defining the development lifecycle.
- **Code Style Guides:** `templates/code_styleguides/` (various languages).

## Management Artifacts
- **Policy Enforcement:** `policies/conductor.toml`.
- **Context Indexing:** `conductor/index.md`.

## MCP Integrations
- **Core Kernel:** `design-os-kernel` (for using vetted components).
- **Theming:** Architecture designed for **Design-OS Theming**, ensuring all UI components support dynamic token-based re-theming.

## Advanced Capabilities
- **Superpowers:** Integration with agent skills.
- **Skill Management:** Support for **symlinked superpower skills**, allowing for centralized skill management across multiple projects.
- **Git Context:** Direct utilization of Git metadata for track and history management.
