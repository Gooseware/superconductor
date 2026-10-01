# Implementation Plan: Automated App Wireframe & Route Flow Crawler

**Status:** [x]

## Phase 0: Swarm Preflight & Environment Detection
- [x] Task: Setup Track Scaffold [TIER-1] [AGENT:superconductor-processor]
    CREATES: src/crawler/types.ts, src/crawler/config.ts
    PROTECTED: package.json
    INVARIANT_AFTER: "Base config and types for the crawler are established."
    - [x] Create base interfaces for RouteManifest, Config, and RouteMarker.
- [x] Task: Superconductor - User Manual Verification 'Phase 0' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies phase 0 setup is correct."
    - [x] Await user verification.

## Phase 1: Multi-Framework Route Manifest Ingestion (`ts-morph`)
- [x] Task: Implement Route AST Parser [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/crawler/parser.ts, src/crawler/frameworks/*.ts
    PROTECTED: src/crawler/types.ts
    INVARIANT_AFTER: "ts-morph accurately extracts route arrays into canonical RouteManifest."
    - [x] Install/configure `ts-morph`.
    - [x] Implement strategy pattern for React Router, Next.js, Remix, and Vite route extraction.
    - [x] Write unit tests verifying AST parsing for sample route files.
- [x] Task: Superconductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 1 parsing works."
    - [x] Await user verification.

## Phase 2: Dev Server Prober & Lifecycle Spawner
- [x] Task: Dev Server Lifecycle Manager [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/crawler/serverManager.ts
    PROTECTED: src/crawler/config.ts
    INVARIANT_AFTER: "Dev server can be spawned and reliably torn down on exit."
    - [x] Implement port probing using standard `net` module.
    - [x] Spawn dev server via `child_process.spawn` if inactive.
    - [x] Listen for specific `stdout` patterns to confirm server is ready.
- [x] Task: Superconductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 2 lifecycle management."
    - [x] Await user verification.

## Phase 3: Headless Triple-Viewport Runner & Hydration Barrier
- [x] Task: Playwright Setup and Hydration Barrier [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/crawler/runner.ts, src/crawler/hydration.ts
    PROTECTED: src/crawler/types.ts
    INVARIANT_AFTER: "Playwright captures screenshots only after the hydration barrier is cleared."
    - [x] Initialize `playwright-core` bound to local chromium binary.
    - [x] Implement context generation for Desktop, Tablet, and Mobile.
    - [x] Inject Hydration Barrier scripts (MutationObserver quiet window, React Fiber checks, font checks).
    - [x] Setup WebP CDP capture logic.
- [x] Task: Superconductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 3 viewports and captures."
    - [x] Await user verification.

## Phase 4: Continuous Journey Video Recording & Route Marker Manifest
- [x] Task: Video Recorder and Manifest Builder [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/crawler/video.ts, src/crawler/manifest.ts
    PROTECTED: src/crawler/runner.ts
    INVARIANT_AFTER: "A continuous video is captured with a millisecond-aligned manifest of routes."
    - [x] Enable Playwright video recording context.
    - [x] Tap into page navigation and DOM events to track route markers.
    - [x] Output millisecond timestamp manifest tying `screenId` and `action` to video time boundaries.
- [x] Task: Superconductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 4 video recording."
    - [x] Await user verification.

## Phase 5: Read-Only Affordance Probing & User Flow Graph
- [x] Task: Implement Safeguraded Affordance Prober [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/crawler/prober.ts, src/crawler/graph.ts
    PROTECTED: src/crawler/runner.ts
    INVARIANT_AFTER: "Mutative forms are blocked, and interactable modala/drawers are mapped."
    - [x] Inject Network/Fetch interceptors rejecting POST/PUT/DELETE.
    - [x] Traverse DOM for interactable buttons (exclude `type="submit"`).
    - [x] Simulate clicks, track state changes, and use `Escape` to backtrack.
    - [x] Construct the directed User Flow Graph ($V, E$) connecting screens/states.
- [x] Task: Superconductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 5 safe probing."
    - [x] Await user verification.

## Phase 6: Standalone Wireframe Board & Looping Video Snippets
- [x] Task: HTML Artifact Generator [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/crawler/renderer.ts, src/crawler/assets/board.html
    PROTECTED: src/crawler/graph.ts
    INVARIANT_AFTER: "Standalone HTML artifact successfully renders Sugiyama-layout graph."
    - [x] Implement Node.js Sugiyama layout calculations for graph topology.
    - [x] Generate SVG components representing transitions (bezier splines, arrowheads).
    - [x] Inject `<3KB` vanilla JS logic for pan/zoom and IDE deep link routing (`vscode://file/...`).
    - [x] Integrate HTML5 video player elements bound to `#t=start,end` hash markers.
- [x] Task: Superconductor - User Manual Verification 'Phase 6' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 6 artifact board."
    - [x] Await user verification.

## Phase 7: End-to-End Integration Tests & CLI / MCP Interface
- [x] Task: CLI and MCP Tool Integration [TIER-2] [AGENT:superconductor-processor]
    CREATES: src/cli/crawl.ts, src/mcp/crawlTool.ts
    PROTECTED: src/crawler/config.ts
    INVARIANT_AFTER: "System can be triggered by CLI and MCP, completing full test cycle."
    - [x] Build `superconductor crawl` CLI command.
    - [x] Build `wireframe_crawl_project` MCP tool handler.
    - [x] Write integration test validating crawler initialization from both endpoints.
- [x] Task: Superconductor - User Manual Verification 'Phase 7' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies Phase 7 interfaces."
    - [x] Await user verification.

## Phase 8: Integration & Finalization
- [x] Task: Final System Polish and Documentation [TIER-1] [AGENT:superconductor-processor]
    CREATES: docs/crawler.md
    PROTECTED: src/cli/crawl.ts
    INVARIANT_AFTER: "Documentation is updated and integration ensures clean exits."
    - [x] Check entire system telemetry for any dangling zombie Chromium processes.
    - [x] Document usage examples.
- [x] Task: Superconductor - User Manual Verification 'Phase 8' (Protocol in workflow.md)
    CREATES: none
    PROTECTED: none
    INVARIANT_AFTER: "User verifies overall completeness."
    - [x] Await user verification.
