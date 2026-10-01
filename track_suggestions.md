# Superconductor Feature & Track Suggestions: App-Level Flow & Visual Wireframing

*Proposed tracks for Superconductor to provide rapid, app-level understanding, visual wireframe reconstruction, and architecture flow visualization.*

---

## 1. Automated App Wireframe & Route Flow Crawler (`wireframe_generator`)
- **Category:** Architecture Understanding & Visual Documentation
- **Core Concept:** A headless browser crawler (leveraging Chrome DevTools Protocol / Playwright) that automatically reconstructs the full visual sitemap and user journey wireframes directly from the application's route definitions.
- **Workflow:**
  1. **Route Manifest Ingestion:** Parses framework route trees (e.g. `app/routes.ts`, `@react-router/dev`, Next.js, or Vite pages).
  2. **Automated Multi-Viewport Capture:** Launches headless Chrome with session injection (Guest vs Authenticated Creator mode) and snapshots each screen across Mobile (390×844) and Desktop (1280×800).
  3. **DOM Transition & Link Extraction:** Scans rendered DOM nodes for buttons, links, and modal triggers to infer user journey transitions.
  4. **Interactive Wireframe Board Emission:** Generates an interactive, standalone HTML board (`superconductor/wireframes/index.html`) displaying the visual flow of all pages, modal overlays, drawers, and layouts side-by-side with live component links.
- **Key Deliverables:** `scripts/generate-app-wireframe.ts`, `superconductor/wireframes/`, `WireframeViewerModal`.

---

## 2. React-Scan Live Component & Render Visualizer (`react_scan_integration`)
- **Category:** Developer Experience & Runtime Inspection
- **Core Concept:** Embed `react-scan` into the development runtime and `DevFloatingBar` / `DevThemeManager` for zero-overhead, real-time component hierarchy inspection.
- **Workflow:**
  1. **Zero-Config Dev Injection:** Conditionally loads `react-scan` during `import.meta.env.DEV` without polluting production builds.
  2. **Visual Component Boundaries:** Draws real-time visual outlines around rendered React components, highlighting re-render hotspots, prop drift, and shallow wrapper overhead.
  3. **Dev Manager Toggle:** Adds a 1-click toggle in the Dev Floating Bar to enable/disable component inspection on demand.
- **Key Deliverables:** `react-scan` integration in `entry.client.tsx` and `DevFloatingBar.tsx`.

---

## 3. Dependency-Cruiser Visual Architecture & Boundary Enforcer (`dependency_cruiser_architecture`)
- **Category:** Code Health & Architecture Enforcement
- **Core Concept:** Automate static architecture analysis and visual module dependency graphing using `dependency-cruiser`.
- **Workflow:**
  1. **Architecture Rules Matrix:** Defines strict domain boundaries in `.dependency-cruiser.cjs` (e.g., UI components cannot bypass `ServiceProvider` to directly invoke raw S3 storage adapters; dev tabs cannot leak into production bundles).
  2. **Interactive SVG/HTML Graph Generation:** Generates an interactive visual dependency map (`superconductor/architecture-graph.html`) highlighting circular dependencies, orphaned modules, and leaky seams.
  3. **CI / Headless Gate Integration:** Adds a preflight validation check in Superconductor tracks preventing unintended coupling spikes.
- **Key Deliverables:** `.dependency-cruiser.cjs`, `scripts/audit-architecture-graph.ts`, SVG/HTML report outputs.
