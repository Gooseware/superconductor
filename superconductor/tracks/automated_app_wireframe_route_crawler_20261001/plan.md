# Implementation Plan: Automated App Wireframe & Route Flow Crawler

## Phase 0: Swarm Preflight & Environment Detection
- [ ] Task: Setup Track Scaffold [TIER-1] [AGENT:superconductor-processor]
    CREATES: src/crawler/types.ts, src/crawler/config.ts
    PROTECTED: package.json
    INVARIANT_AFTER: "Base config and types for the crawler are established."
    - [ ] Create base interfaces for RouteManifest, Config, and RouteMarker.
- [ ] Task: Superconductor - User Manual Verification 'Phase 0' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies phase 0 setup is correct."
    - [ ] Await user verification.

## Phase 1: Multi-Framework Route Manifest Ingestion (`ts-morph`)
- [ ] Task: Implement Route AST Parser [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/crawler/parser.ts, src/crawler/frameworks/*.ts
    PROTECTED: src/crawler/types.ts
    INVARIANT_AFTER: "ts-morph accurately extracts route arrays into canonical RouteManifest."
    - [ ] Install/configure `ts-morph`.
    - [ ] Implement strategy pattern for React Router, Next.js, Remix, and Vite route extraction.
    - [ ] Write unit tests verifying AST parsing for sample route files.
- [ ] Task: Superconductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 1 parsing works."
    - [ ] Await user verification.

## Phase 2: Dev Server Prober & Lifecycle Spawner
- [ ] Task: Dev Server Lifecycle Manager [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/crawler/serverManager.ts
    PROTECTED: src/crawler/config.ts
    INVARIANT_AFTER: "Dev server can be spawned and reliably torn down on exit."
    - [ ] Implement port probing using standard `net` module.
    - [ ] Spawn dev server via `child_process.spawn` if inactive.
    - [ ] Listen for specific `stdout` patterns to confirm server is ready.
- [ ] Task: Superconductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 2 lifecycle management."
    - [ ] Await user verification.

## Phase 3: Headless Triple-Viewport Runner & Hydration Barrier
- [ ] Task: Playwright Setup and Hydration Barrier [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/crawler/runner.ts, src/crawler/hydration.ts
    PROTECTED: src/crawler/types.ts
    INVARIANT_AFTER: "Playwright captures screenshots only after the hydration barrier is cleared."
    - [ ] Initialize `playwright-core` bound to local chromium binary.
    - [ ] Implement context generation for Desktop, Tablet, and Mobile.
    - [ ] Inject Hydration Barrier scripts (MutationObserver quiet window, React Fiber checks, font checks).
    - [ ] Setup WebP CDP capture logic.
- [ ] Task: Superconductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 3 viewports and captures."
    - [ ] Await user verification.

## Phase 4: Continuous Journey Video Recording & Route Marker Manifest
- [ ] Task: Video Recorder and Manifest Builder [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/crawler/video.ts, src/crawler/manifest.ts
    PROTECTED: src/crawler/runner.ts
    INVARIANT_AFTER: "A continuous video is captured with a millisecond-aligned manifest of routes."
    - [ ] Enable Playwright video recording context.
    - [ ] Tap into page navigation and DOM events to track route markers.
    - [ ] Output millisecond timestamp manifest tying `screenId` and `action` to video time boundaries.
- [ ] Task: Superconductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 4 video recording."
    - [ ] Await user verification.

## Phase 5: Read-Only Affordance Probing & User Flow Graph
- [ ] Task: Implement Safeguraded Affordance Prober [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/crawler/prober.ts, src/crawler/graph.ts
    PROTECTED: src/crawler/runner.ts
    INVARIANT_AFTER: "Mutative forms are blocked, and interactable modala/drawers are mapped."
    - [ ] Inject Network/Fetch interceptors rejecting POST/PUT/DELETE.
    - [ ] Traverse DOM for interactable buttons (exclude `type="submit"`).
    - [ ] Simulate clicks, track state changes, and use `Escape` to backtrack.
    - [ ] Construct the directed User Flow Graph ($V, E$) connecting screens/states.
- [ ] Task: Superconductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 5 safe probing."
    - [ ] Await user verification.

## Phase 6: Standalone Wireframe Board & Looping Video Snippets
- [ ] Task: HTML Artifact Generator [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/crawler/renderer.ts, src/crawler/assets/board.html
    PROTECTED: src/crawler/graph.ts
    INVARIANT_AFTER: "Standalone HTML artifact successfully renders Sugiyama-layout graph."
    - [ ] Implement Node.js Sugiyama layout calculations for graph topology.
    - [ ] Generate SVG components representing transitions (bezier splines, arrowheads).
    - [ ] Inject `<3KB` vanilla JS logic for pan/zoom and IDE deep link routing (`vscode://file/...`).
    - [ ] Integrate HTML5 video player elements bound to `#t=start,end` hash markers.
- [ ] Task: Superconductor - User Manual Verification 'Phase 6' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 6 artifact board."
    - [ ] Await user verification.

## Phase 7: End-to-End Integration Tests & CLI / MCP Interface
- [ ] Task: CLI and MCP Tool Integration [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/cli/crawl.ts, src/mcp/crawlTool.ts
    PROTECTED: src/crawler/config.ts
    INVARIANT_AFTER: "System can be triggered by CLI and MCP, completing full test cycle."
    - [ ] Build `superconductor crawl` CLI command.
    - [ ] Build `wireframe_crawl_project` MCP tool handler.
    - [ ] Write integration test validating crawler initialization from both endpoints.
- [ ] Task: Superconductor - User Manual Verification 'Phase 7' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 7 interfaces."
    - [ ] Await user verification.

## Phase 8: Integration & Finalization
- [ ] Task: Final System Polish and Documentation [TIER-1] [AGENT:superconductor-processor]
    CREATES: docs/crawler.md
    PROTECTED: src/cli/crawl.ts
    INVARIANT_AFTER: "Documentation is updated and integration ensures clean exits."
    - [ ] Check entire system telemetry for any dangling zombie Chromium processes.
    - [ ] Document usage examples.
- [ ] Task: Superconductor - User Manual Verification 'Phase 8' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies overall completeness."
    - [ ] Await user verification.
