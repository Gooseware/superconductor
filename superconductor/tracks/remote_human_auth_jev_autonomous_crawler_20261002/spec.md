# Specification: Remote Human Auth Profile Setup & Native TypeScript Jev Autonomous Goal Runner

## Overview
This track implements a seamless bridge for human interactive authentication on headless/remote environments (such as cloud runners or SSH port-forwarded sessions) via a zero-dependency CDP screencast WebSocket server. It captures authenticated session state (`context.storageState()`) into securely stored auth profiles. Furthermore, it introduces a native TypeScript implementation of the Jev autonomous goal runner directly into `@superconductor/core`, allowing structured, LLM-driven multi-step scenario execution over authenticated applications, complete with continuous synchronized video recording and milestone tracking in the visual wireframe board.

## Architecture Committee Recommendations
- **Zero-Dependency Auth Server**: Do not require X11, VNC, or external libraries. Rely purely on Playwright's Chrome DevTools Protocol (CDP) `Page.startScreencast` and `screencastFrameAck`.
- **Security First**: Implement cryptographically secure one-time tokens, loopback origin checks, and CSWSH prevention for the remote auth web client. Auth profiles must be stored with `0600` permissions and be added to `.gitignore`.
- **Native Jev Runner**: Port the Python Jev autonomous loop to pure TypeScript. Use the WAI-ARIA accessible DOM snapshotting (`takeJevSnapshot`) with WeakMap identity caching to prevent stale references.
- **Unified Visual Output**: The existing wireframe visual board should render the autonomous goals as milestone cards, with video snippets playable via `#t=start,end` URL fragments.

## Research Notes
- Playwright CDP sessions allow direct DOM event dispatch (`Input.dispatchMouseEvent`, etc.) which bypasses OS-level input requirements, making it perfect for headless remote control.
- Gemini and OpenRouter JSON schema tools can accurately emit discrete actions (`click`, `fill`, `press`, `scroll`, `wait`, `done`, `fail`) based on a minimized accessibility tree snapshot.
- SHA-256 fingerprinting of the accessible tree state provides a robust mechanism to detect infinite loops in the LLM execution planner.

## Functional Requirements
- **FR-1**: Expose a local HTTP/WS server (port 4455) delivering a lightweight HTML5 canvas client for remote VNC-like control of a Playwright page.
- **FR-2**: Translate HTML canvas mouse/keyboard events into CDP `Input.*` commands.
- **FR-3**: Save and load Playwright `storageState` to/from `.superconductor/auth-profiles/`.
- **FR-4**: Implement `jevRunner.ts` in `@superconductor/core` using a loop of `takeJevSnapshot(page)` -> LLM Planning -> CDP Action Execution.
- **FR-5**: Orchestrate dual crawl pipelines: static AST route crawl + dynamic Jev scenario runner using `scenarios.json`.
- **FR-6**: Record continuous video during crawls and emit milestone events with start/end timestamps.
- **FR-7**: Update the Visual Board renderer (`renderer.ts`) to display scenario milestone cards with violet glowing borders, LLM thought callouts, and video snippet integration.

## Non-Functional Requirements
- **Security**: WebSocket endpoints must validate one-time tokens. Profiles must be `0600`.
- **Performance**: The screencast client must maintain at least 15 FPS with low latency. DOM snapshotting should take < 50ms.
- **Resilience**: The Jev runner must detect loops and self-correct or abort with a clear error trace.

## Acceptance Criteria
- **AC-1**: Running `superconductor auth login --profile dev` opens a terminal URL, which when visited locally, shows the browser screen and allows clicking/typing to log in.
- **AC-2**: The logged-in state is saved to `.superconductor/auth-profiles/dev.json`.
- **AC-3**: Running `superconductor crawl --profile dev --scenarios scenarios.json` successfully hydrates the session and executes the multi-step goals.
- **AC-4**: The visual board (`index.html`) renders the executed scenarios as milestone cards.
- **AC-5**: Video playbacks on the milestone cards correctly seek to the start of the relevant action.
- **AC-6**: MCP tools `auth_create_profile` and `auth_list_profiles` function as specified.
- **AC-7**: All newly introduced code achieves >85% test coverage.

## Out of Scope
- Supporting browsers other than Chromium via CDP for the screencast feature.
- Multi-user concurrent auth sessions on a single agent instance.
- Fully autonomous CAPTCHA solving (human-in-the-loop auth solves this).
