# Tech Stack

## Type
Gemini CLI Extension

## Commands Architecture
- **Language:** TOML-based command specification files.
- **Location:** `commands/superconductor/`.
- **Command Files:**
    - `setup.toml`: Project initialization and scaffolding.
    - `newTrack.toml`: Track creation and planning logic.
    - `implement.toml`: Task execution and status management.
    - `status.toml`: Project and track status reporting.
    - `revert.toml`: Git-aware logic for undoing changes.
    - `review.toml`: Standards and guideline compliance checking.

## Development Preferences
- **Target Branch:** `main`

## Supporting Templates
- **Location:** `templates/`.
- **Workflow:** `templates/workflow.md` for defining the development lifecycle.
- **Code Style Guides:** `templates/code_styleguides/` (various languages).

## Management Artifacts
- **Policy Enforcement:** `policies/superconductor.toml`.
- **Context Indexing:** `superconductor/index.md`.

## MCP Integrations
- **Core Kernel:** `design-os-kernel` (integrated as a Git submodule at `packages/design-os-kernel/`, compiled to `dist/index.js`).
- **Theming:** Architecture designed for **Design-OS Theming**, ensuring all UI components support dynamic token-based re-theming.
- **Bundled Skills Suite:** 14 bundled Design OS skills (orchestrator, vision, roadmap, data model, setup, theme manager, i18n, etc.) located in `skills/` for out-of-the-box workflow capabilities.

## Advanced Capabilities
- **Superpowers:** Integration with agent skills.
- **Skill Management:** Support for **symlinked superpower skills**, allowing for centralized skill management across multiple projects.
- **Git Context:** Direct utilization of Git metadata for track and history management.
- **Model Routing:** A structured 4-tier model routing system (Deterministic, Triage, Standard, Frontier) configured via global `~/.gemini/agent-config.md` with project overrides in `superconductor/agent-config.md`.
- **Design Heuristics:** A bundled superpower skill (`design-heuristics`) codifying ~25 core visual constraints (layout rhythm, color discipline, motion curves) with on-demand references, auto-activated during execution for UI-heavy development tracks.
