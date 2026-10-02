# The Ultimate Agent-Driven Browser: Specification

## Overview
This specification outlines the architecture and requirements for "The Ultimate Agent-Driven Browser," an advanced web automation, scraping, and testing platform. The user has decided to spin off the browser functionality into a dedicated Git submodule: `packages/superconductor-browser` (`@superconductor/browser`), tracked at `git@gitlab.com:goosewares/superconductor-browser.git`. The system introduces a native TypeScript Jev Autonomous Goal Runner, a Remote Human Auth Bridge with CDP Screencast VNC, a Dual Data Scraper for Markdown and Schema-driven JSON extraction, a Design Cue Cloner & Theme Distiller, and a dedicated React Router 7 based Superconductor Studio.

## Architecture Committee Recommendations
- **Submodule Architecture**: The browser code must be isolated in `packages/superconductor-browser` and registered in `.gitmodules`.
- **Zero-Dependency Core**: The Remote Human Auth bridge must be a zero-dependency Node.js HTTP/WebSocket server.
- **Native Implementation**: The autonomous goal runner should be purely implemented in TypeScript within `@superconductor/browser`, minimizing reliance on external orchestrators.
- **Security & Integrity**: Prevent Cross-Site WebSocket Hijacking (CSWSH) and ensure strict one-time cryptographic tokens for auth. Use SHA-256 fingerprinting for loop detection in the autonomous runner.

## Research & Prior Art Notes
- **agent-browser CDP Mappings**: Reviewed mappings to ensure consistent translation between agent actions and Chrome DevTools Protocol commands.
- **jev-ultrafast**: Inspired the fast action-space snapshotting. `takeJevSnapshot(page)` will use WAI-ARIA accessible naming combined with a WeakMap DOM identity cache for robust element targeting.

## Functional Requirements
- **FR-1: Remote Human Auth Bridge**: Implement a Node.js HTTP/WebSocket server (port 4455) streaming CDP screencast to an HTML5 canvas client in `src/auth/`.
- **FR-2: Bi-directional Input Dispatch**: Support `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`, and `Input.insertText`.
- **FR-3: Auth State Management**: Save `context.storageState()` to `.superconductor/auth-profiles/<name>.json` securely (mode 0600).
- **FR-4: Native Jev Autonomous Goal Runner**: Implement a pure TS autonomous goal execution loop with LLM integration in `src/runner/`.
- **FR-5: State Snapshotting**: `takeJevSnapshot(page)` must accurately capture actionable DOM elements with ARIA naming.
- **FR-6: Continuous Video Recording**: Runner must synchronize continuous video recording with millisecond route & step markers.
- **FR-7: Dual Data Scraper**: Implement Markdown reader mode (stripping boilerplate) and Schema-driven JSON table extractor (`scrape` mode) in `src/scraper/`.
- **FR-8: Design Cue Cloner & Theme Distiller**: Extract CSS color palettes, typography scales, spacing scales, and design tokens, saving them to Superconductor Design OS formats in `src/theme/`.
- **FR-9: Superconductor Studio**: Build a React Router 7 + Astryx web application in `studio/` featuring Live Takeover Viewport, DAG Explorer, Auth Vault, Scenario Goal Studio, Theme Distiller Studio, and Data Scraper Table Studio.
- **FR-10: CLI Commands & MCP Tools**: Provide CLI wrappers in `src/cli/` and MCP Server Tools in `@superconductor/mcp-server` delegating to `@superconductor/browser`.
- **FR-11: Monorepo Integration**: `@superconductor/core` depends on `@superconductor/browser: "workspace:*"` and delegates browser commands.

## Non-Functional Requirements
- **Performance**: Screencast streaming must maintain low latency (under 100ms) over WebSocket.
- **Security**: Strict origin checks on WebSockets; Auth profiles stored with mode 0600.
- **Stability**: SHA-256 fingerprinting must accurately detect and halt runner loops.

## Acceptance Criteria
- **AC-1**: User can log in manually via the Remote Auth Bridge on port 4455 and save their session.
- **AC-2**: CDP screencast accurately reflects the browser state on the HTML5 canvas client.
- **AC-3**: Input events (clicks, typing) from the canvas are correctly dispatched to the headless browser.
- **AC-4**: Jev Runner can parse a user goal, interact with the snapshot, and complete the goal autonomously.
- **AC-5**: Runner successfully halts upon detecting a loop via SHA-256 state fingerprinting.
- **AC-6**: Scraper successfully transforms a target page into clean Markdown and structured JSON based on a provided schema.
- **AC-7**: Theme Distiller correctly identifies WCAG-compliant color palettes and extracts tokens into `theme.json` and `tailwind.extend.json`.
- **AC-8**: Superconductor Studio launches successfully and can preview live distillations and data scrapes.
- **AC-9**: CLI commands correctly execute the core features from the terminal via the submodule.
- **AC-10**: MCP Tools register successfully and delegate successfully to the browser submodule.

## Out of Scope
- Distributed cloud clustering for browser instances.
- Support for browsers other than Chromium (e.g., Firefox/WebKit are out of scope for the CDP-specific screencast).
