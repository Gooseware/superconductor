# Track Specification: Remote Human Auth Web VNC & Profile Hydration in MCP Tools

## Overview
`@superconductor/browser` contains a robust implementation of `RemoteAuthBridge` (Screencast Web VNC streaming via CDP with bidirectional mouse/keyboard events, token authentication, and CSWSH protection) and `AuthManager` (session state persistence under `.superconductor/auth-profiles/` with POSIX 0600 mode and cookie hydration). However, these capabilities were previously restricted to the CLI and Studio UI, leaving AI agents operating through MCP unable to trigger remote human logins or reuse authenticated profiles.

This track bridges this gap by exposing first-class auth management tools (`browser_start_auth_session` and `browser_list_auth_profiles`) over the MCP interface and adding universal `profileName` context hydration across all browser automation tools (`browser_navigate`, `browser_goal`, `browser_scrape`, `browser_execute_formula`, `browser_inspect_state`, and `browser_start_research_job`).

## Project Constraints (from Notebook)
- ℹ️ `browser_formulas_async_deep_research_google_ai_20261003`: Dual push notification (Hermes webhook & Herdr/AGY), hybrid formulas (bundled golden + auto-heal), and dynamic vault/git repo preference detection.
- ℹ️ `invariant_first_remediation_and_execution_quorum_20261005`: Invariant-first remediation, execution quorum, headless hardening & knock-on upgrade analysis.

## Ecosystem Alignment & Prior Art (Anti-Reinvention)
- **Model Context Protocol (MCP)**: Follows standard `@modelcontextprotocol/sdk` tool registration with strict Zod parameter validation schemas and JSON-formatted text content responses.
- **Chrome DevTools Protocol (CDP)**: Reuses existing `RemoteAuthBridge` integration using `Page.startScreencast`, `Page.screencastFrameAck`, and `Input.dispatch*` events.
- **Playwright Context Hydration**: Leverages native Playwright `BrowserContext.addCookies()` via `AuthManager.hydrateContext()` without modifying global browser defaults or persisting secrets to git.

## Architecture Committee Recommendations
- **Decoupled Tool Layer**: Keep tool registrations in `src/mcp/tools.ts` thin by delegating auth operations to `RemoteAuthBridge` and `AuthManager`.
- **Dependency Injection**: Add `authManager?: AuthManager` and `authBridgeFactory?: (options: AuthServerOptions) => RemoteAuthBridge` to `BrowserToolDependencies` to ensure deterministic, isolated unit testing without spawning live network servers or browsers.
- **Dual Execution Mode**: Support `async: true` (default) for immediate return of the VNC access URL to prevent MCP client timeouts, while also supporting `async: false` when synchronous completion is preferred.
- **Security Invariants**:
  - SEC-1: Validate `profileName` with `/^[a-zA-Z0-9_-]+$/` to prevent path traversal into the filesystem.
  - SEC-2: Ensure client-supplied VNC payload data cannot direct arbitrary filesystem write paths.
  - SEC-4: Validate `targetUrl` against `SafeUrlSchema` (`http://`, `https://`, `data:`).
  - SEC-5: Restrict Web VNC port to valid ephemeral/custom TCP ports (1-65535, defaulting to 4455).

## Impacted Downstream & Upgrade Opportunities
- `PROTECTED: packages/superconductor-browser/src/auth/remoteAuth.ts`: Core Web VNC streaming logic and protocol relays must remain intact.
- `PROTECTED: packages/superconductor-browser/src/auth/authManager.ts`: Profile storage and security validations must remain intact.
- `UPGRADES: packages/superconductor-browser/src/mcp/tools.ts`: Add `browser_start_auth_session` and `browser_list_auth_profiles`; update `defaultPageProvider`, `withPage`, and existing tools for `profileName` parameter.
- `UPGRADES: packages/superconductor-browser/src/mcp/server.ts`: Accept and pass `authManager` and `authBridgeFactory` options.
- `UPGRADES: packages/superconductor-browser/src/runner/deepResearchRunner.ts`: Add `profileName` to `DeepResearchOptions` and propagate to page provider.

## Functional Requirements
1. **`browser_start_auth_session` Tool**:
   - Accepts parameters:
     - `profileName`: Validated string (`/^[a-zA-Z0-9_-]+$/`) representing the profile identifier.
     - `targetUrl`: Safe URL to navigate to for authentication (default: `https://accounts.google.com`).
     - `port`: Port number to bind the Web VNC server (default: `4455`).
     - `timeoutMs`: Idle timeout in milliseconds before session auto-terminates (default: `300000`, 5 minutes).
     - `async`: Boolean flag indicating whether to return immediately or block until completion (default: `true`).
   - Launches a stealth Chromium page and attaches `RemoteAuthBridge`.
   - In `async: true` mode, immediately returns `{ status: 'started', url, token, port, profileName, targetUrl, message }`.
   - On completion (`finishPromise`), automatically calls `authManager.saveProfile(profileName, storageState)` and executes clean teardown of the page, context, browser, and VNC server.
2. **`browser_list_auth_profiles` Tool**:
   - Queries `authManager.listProfiles()` and returns a JSON list of all stored profiles including name, createdAt, cookie count, origins, and storage state path.
3. **Universal Profile Hydration**:
   - All browser execution MCP tools (`browser_navigate`, `browser_goal`, `browser_scrape`, `browser_execute_formula`, `browser_inspect_state`, `browser_start_research_job`) accept an optional `profileName` parameter.
   - When `profileName` is supplied, `defaultPageProvider` and `withPage` invoke `await authManager.hydrateContext(context, profileName)` before executing the tool handler.
4. **Deep Research Authenticated Execution**:
   - `DeepResearchRunner` accepts `profileName` in `DeepResearchOptions` and forwards it to the page provider so headless research runs can leverage authenticated Google sessions.

## Non-Functional Requirements
- **Security**: Maintain 0600 POSIX permissions on saved profile files, adhere to `.gitignore` rules for `.superconductor/`, enforce path traversal validation on profile names, and validate all navigation URLs.
- **Reliability & Resource Hygiene**: Automatically clean up browser processes, CDP sessions, and HTTP/WebSocket servers upon session completion, error, or idle timeout.
- **Backward Compatibility**: All existing 7 MCP tools remain 100% backward compatible; existing callers omitting `profileName` observe identical behavior.

## Acceptance Criteria
- **AC-1**: `createBrowserMcpServer` registers 9 tools (including `browser_start_auth_session` and `browser_list_auth_profiles`).
- **AC-2**: `browser_start_auth_session` validates `profileName` against path traversal attempts (`../`, `foo/bar`, etc.) and returns a schema validation error.
- **AC-3**: `browser_start_auth_session` starts `RemoteAuthBridge`, navigates page to `targetUrl`, and returns the access URL with authentication token in `async: true` mode.
- **AC-4**: When an auth session finishes via `finishPromise`, the resulting cookies and storage state are saved to disk via `AuthManager.saveProfile`.
- **AC-5**: `browser_list_auth_profiles` returns all saved profiles formatted as JSON text.
- **AC-6**: `browser_navigate`, `browser_goal`, `browser_scrape`, `browser_execute_formula`, `browser_inspect_state`, and `browser_start_research_job` accept optional `profileName`.
- **AC-7**: When `profileName` is passed, `hydrateContext` is invoked on the Playwright `BrowserContext`.
- **AC-8**: `DeepResearchRunner` passes `profileName` to its page provider during research execution.
- **AC-9**: All existing and new unit/integration tests in `tests/mcp.test.ts` pass with 100% green status.

## Out of Scope
- Direct modifications to the Studio frontend (`AuthVault.tsx`).
- Remote auth proxy tunneling over public Internet (Tailscale/cloudflared integration remains handled via existing CLI flags).
