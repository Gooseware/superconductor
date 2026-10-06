# Implementation Plan: Remote Human Auth Web VNC & Profile Hydration in MCP Tools

## Swarm Blueprint & Proactive Planning
- DRY Context Hydration in `withPage` / `defaultPageProvider`
- Safe idempotent session cleanup on completion or timeout
- Harmonized `profileName` in DeepResearchRunner

## Phase 0: Swarm Preflight
- [ ] Task: Verify Swarm Preflight & Dependencies [TIER-1] [AGENT:superconductor-processor]

## Phase 1: Deep Research Runner Profile Support
- [ ] Task: Extend DeepResearchRunner with profileName parameter [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/runner/deepResearchRunner.ts
    PROTECTED: src/runner/pushDispatcher.ts, src/vault/vaultSync.ts
    INVARIANT_AFTER: "DeepResearchOptions accepts profileName and passes it to the page provider."
    - [ ] Update DeepResearchOptions interface to include profileName
    - [ ] Update defaultDeepResearchPageProvider to accept profileName and hydrate context
    - [ ] Forward profileName in DeepResearchRunner.run()

## Phase 2: Core MCP Tools & Context Hydration
- [ ] Task: Upgrade PageProvider and withPage with AuthManager hydration [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/mcp/tools.ts, src/mcp/server.ts
    PROTECTED: src/auth/authManager.ts, src/auth/remoteAuth.ts
    INVARIANT_AFTER: "When profileName is supplied, context is hydrated via AuthManager.hydrateContext."
    - [ ] Extend PageProvider options type with profileName and authManager
    - [ ] Update defaultPageProvider to hydrate browser context using AuthManager
    - [ ] Pass authManager in BrowserToolDependencies
- [ ] Task: Update existing browser tool schemas for universal profileName support [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/mcp/tools.ts
    PROTECTED: src/formula/executor.ts, src/scraper/scraper.ts
    INVARIANT_AFTER: "All 6 browser automation tools accept optional profileName."
    - [ ] Add optional profileName to browser_navigate schema
    - [ ] Add optional profileName to browser_goal schema
    - [ ] Add optional profileName to browser_scrape schema
    - [ ] Add optional profileName to browser_execute_formula schema
    - [ ] Add optional profileName to browser_inspect_state schema
    - [ ] Add optional profileName to browser_start_research_job schema

## Phase 3: Auth Management MCP Tools
- [ ] Task: Implement browser_start_auth_session MCP tool [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/mcp/tools.ts
    PROTECTED: src/auth/remoteAuth.ts
    INVARIANT_AFTER: "browser_start_auth_session starts Web VNC server, validates profileName, and persists profile on completion."
    - [ ] Define Zod schema for browser_start_auth_session with SEC-1 profileName validation
    - [ ] Start RemoteAuthBridge server and attach page
    - [ ] Handle async and sync completion modes
    - [ ] Hook finishPromise to save profile via AuthManager and execute graceful cleanup
- [ ] Task: Implement browser_list_auth_profiles MCP tool [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/mcp/tools.ts
    PROTECTED: src/auth/authManager.ts
    INVARIANT_AFTER: "browser_list_auth_profiles returns array of stored AuthProfile objects."
    - [ ] Register browser_list_auth_profiles tool on server
    - [ ] Query AuthManager.listProfiles and return JSON result

## Phase 4: Verification & Security Testing
- [ ] Task: Implement unit and integration tests in tests/mcp.test.ts [TIER-2] [AGENT:superconductor-processor]
    CREATES: tests/mcp.test.ts
    PROTECTED: tests/auth.test.ts
    INVARIANT_AFTER: "All MCP tests pass including SEC-1 path traversal rejection for profileName."
    - [ ] Update tool listing count assertion to 9 tools
    - [ ] Test browser_start_auth_session with mock bridge and path traversal validation
    - [ ] Test browser_list_auth_profiles with mock authManager
    - [ ] Test context hydration across existing tools when profileName is provided
- [ ] Task: Run full test suite verification [TIER-1] [AGENT:superconductor-processor]
    INVARIANT_AFTER: "npm test runs with zero failures."
    - [ ] Execute vitest test suite
    - [ ] Verify 20/20 test files pass

## Phase 5: Integration & Finalization
- [ ] Task: Integrate track 'remote_auth_mcp_profile_hydration_20261006' into main branch. [TIER-1] [AGENT:superconductor-processor]
    - [ ] Update tracks registry
    - [ ] Commit all changes
