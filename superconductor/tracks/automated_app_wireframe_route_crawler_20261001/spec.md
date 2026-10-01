# Specification: Automated App Wireframe & Route Flow Crawler with Journey Video Recording

## 1. Overview
The Automated App Wireframe & Route Flow Crawler is an advanced, multi-framework orchestration system that maps frontend application routes. It uses headless browser traversal, dev-server orchestration, and interaction affordance probing to generate a complete visual directed graph (wireframe board) alongside millisecond-accurate journey videos for user flow analysis.

## 2. Architecture Committee Recommendations
- **Avoid Heavy Browser Binaries:** Ensure `playwright-core` connects to the local Chromium binary to prevent 500MB browser bloat on installation.
- **Deterministic Capture:** The crawler MUST implement a robust Hydration Barrier using React Fiber, `document.fonts.ready`, and MutationObservers to eliminate partially loaded UI snapshots.
- **Strict Read-Only Guarantee:** The crawler must NEVER mutate application state. It must block POST/PUT/DELETE fetch calls and disable form submissions (`<button type="submit">`).
- **Dependency Management:** The generated Wireframe Board should be 100% standalone, utilizing vanilla JS pan/zoom and SVG generation to avoid heavy JS framework runtime dependencies for viewing the artifact.

## 3. Research Notes
- **Framework Diversity:** Different frameworks store route maps differently (e.g., Remix uses flat-route conventions; Next.js uses App/Pages folder layout; Vite uses standard filesystem routing). `ts-morph` provides the required robust AST parsing to handle all these dynamically.
- **Graph Layout:** To produce readable wireframe graphs, a Sugiyama topological layout algorithm provides hierarchical layering with minimal edge crossings.
- **Video Sync:** By recording a continuous screen session and capturing millisecond timestamps on route changes, we can offer `#t=start,end` deep links to video snips per wireframe card.

## 4. Functional Requirements (FR)
- **FR-1:** Parse and ingest routing structures dynamically via `ts-morph` (supports React Router v7, Remix, Next.js, and Vite).
- **FR-2:** Probe the standard dev server ports (4355, 5173, 3000) and automatically spawn/teardown the dev server if it is inactive.
- **FR-3:** Render a headless session spanning 3 viewports (Desktop: 1280x800, Tablet: 768x1024, Mobile: 390x844).
- **FR-4:** Wait for a consistent UI state (Hydration Barrier) before capturing screens, avoiding loaders and blank pages.
- **FR-5:** Continuously record user journeys while generating a JSON Route Marker Manifest indexing millisecond start/end times per interaction or route.
- **FR-6:** Probe UI elements to trace read-only interactions (e.g., Modals, Drawers) and track dismissing via standard keyboard keys like `Escape`.
- **FR-7:** Generate a standalone HTML Wireframe Board utilizing SVG splines, vanilla JS pan/zoom, IDE deep linking (`vscode://file/...`), and embedded video snippet previews.

## 5. Non-Functional Requirements (NFR)
- **Zero Configuration Setup:** Must operate optimally right out of the box against major frameworks.
- **Artifact Isolation:** Output wireframe UI must be bundled as an independent HTML artifact.
- **Idempotency:** Re-running the tool must overwrite previous graphs predictably.
- **Performance:** Crawling must proceed aggressively, bounded by rendering hydration checks without arbitrary wait delays.

## 6. Acceptance Criteria (AC)
- **AC-1:** The `RouteManifest` accurately reflects application paths parsed by `ts-morph` regardless of supported framework.
- **AC-2:** The application dev server automatically starts up and successfully closes down on exit.
- **AC-3:** Zero blank screenshots or partial-load images are generated across all three viewport definitions.
- **AC-4:** The video recording plays smoothly with accurate `startTimeMs` and `endTimeMs` boundaries demarcating views in the manifest.
- **AC-5:** Destructive user interactions (`submit` buttons) are systematically blocked/intercepted, leaving backend states untouched.
- **AC-6:** The HTML artifact opens in a standard browser offering pan, zoom, IDE deep linking, and looping video snips without pulling down third-party JS packages.
- **AC-7:** The CLI interface `superconductor crawl` correctly triggers the flow, and an equivalent MCP tool `wireframe_crawl_project` is available.

## 7. Out of Scope
- Automated visual regression diffing between historical crawls.
- Authentication/login session synthesis (assumes running against an unlocked dev server or injected standard auth token).
- Custom native Android/iOS view capture (restricted to web viewport simulation).
