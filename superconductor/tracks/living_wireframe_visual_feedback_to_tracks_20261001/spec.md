# Living Application Wireframes & Visual Feedback-to-Tracks Assembly Engine

## Background, Problem & Architectural Rationale
The user needs a system to create wireframes/visual previews for an application "as is". This system will allow them to browse the application in a browser, attach spatial/DOM-anchored notes for improvements, and automatically assemble those visual feedback notes into multiple Superconductor tracks (`spec.md` + `plan.md`).

## Grilling Report & Architectural Decisions
The Grill Session for this track has completed with 4 major architectural decisions and ADRs:
1. **ADR 0001: Autonomous Mock Story Envelopes (`MockStoryEnvelope`)**:
   - In-memory auto-synthesized test harness wrapping UI components in mock providers (`MockRouterProvider`, `MockThemeProvider`, `MockQueryProvider`).
   - `MockScenarioAdapter` switching between synthetic TS fixtures, local seeds, edge-case states (empty, loading, error, overflow), and read-only snapshots.
2. **ADR 0002: Token Synthesis (`TokenSynthesizer`) & Upfront Localization (`LocaleMirrorHarness`)**:
   - 4-tier semantic token enforcement (Surfaces, Typography, State, Geometry).
   - Auto-synthesizes tokens if absent, outputting a foundational design system track.
   - Interactive studio locale switcher with bidirectional LTR/RTL layout mirroring.
3. **ADR 0003: Layered Assembly Partitioning (`LayeredAssemblyPartitioning`)**:
   - Organizes visual feedback by editing hierarchy (Layer 0 Foundation Tokens -> Layer 1 Shared Components -> Layer 2 Downstream Feature Views).
   - Declares DAG dependency edges for parallel multi-track wave execution in `ExecutionPlanner.planWaves`.
4. **ADR 0004: Web-First Core with Pluggable Surface Architecture (`SurfaceAdapter`)**:
   - Phase 1 scope strictly focused on Web components (React/Vite/Next.js/SPAs) to maximize functionality (live HMR, React Fiber introspection, in-DOM drafting, spring physics) with zero binary dependencies.
   - Defines `SurfaceAdapter` contract and documents extension path for future `TerminalSurfaceAdapter` and `ImageMontageSurfaceAdapter`.

## Ecosystem Alignment & Package Evaluation
- **Programmatic Vite dev server**: (`vite.createServer`) with in-memory virtual module injection (`virtual:superconductor-preview`). Zero project file pollution.
- **AST Scanning**: via `ts-morph` and `fast-glob` (native in `@superconductor/core`) for automated component discovery.
- **Floating UI**: `@floating-ui/react` popover engine with custom transparent SVG overlay adhering to Design OS Hit-Testing Dogma.

## Web-First Core & Pluggable Architecture
- Strict focus on Web components (React/Vite/Next.js/SPAs) to maximize functionality (live HMR, Fiber introspection, in-DOM drafting).
- Extensible via `SurfaceAdapter` plugin interface for future integrations (e.g., Terminal, Image Montage).

## Interactive Conversational Copilot & Hot In-DOM Prototyping Engine
- **Direct Bi-Directional Bridge**: Direct interactive conversations with the agent inside the browser tool interface.
- **Context-aware copilot**: The agent receives the active screen, selected DOM element, CSS path, React Fiber `_debugSource`, bounding box, and attached user notes.
- **Hot In-DOM Prototyping / Live Drafting**: The agent can draft a live proposal and inject it directly into the DOM / iframe preview via in-memory Vite virtual module HMR or live CSS/DOM overlay without writing to disk yet.
- **Instant A/B preview toggle**: "Current" vs "Proposal" for live testing.

## Motion Design, Animations & Visual Finesse Studio
- **Prototyping live animations**: Micro-interactions, and visual finesse using `motion/react` (Framer Motion), Tailwind transitions, and View Transitions API.
- **Micro-interaction controls**: Spring physics, hover/press states, staggered list reveals, skeleton-to-content morphs, drawer/modal transitions.
- **Interactive Studio Animation Controller / Scrubber**: Scrub animations at 10% speed, pause mid-spring, and tune easing curves.

## Functional Requirements
- **FR-1**: Web-First Core with `SurfaceAdapter` Interface for extensibility.
- **FR-2**: Autonomous `MockStoryEnvelope` synthesis and `MockScenarioAdapter` integration (ADR 0001).
- **FR-3**: `TokenSynthesizer` for 4-tier semantic token enforcement and `LocaleMirrorHarness` for LTR/RTL (ADR 0002).
- **FR-4**: Layered Assembly Partitioning (`LayeredAssemblyPartitioning`) for structured visual feedback DAGs (ADR 0003).
- **FR-5**: Live Web Component Extraction & Sandboxing (Web Mode) using Programmatic Vite.
- **FR-6**: React Fiber Debug Source Introspection to capture exact JSX component source file and line numbers.
- **FR-7**: Interactive Visual Studio & Spatial Pinning with multi-layer anchoring.
- **FR-8**: Conversational Agent Bridge & Context Injection via WebSocket/SSE.
- **FR-9**: Hot In-DOM Proposal Injection & Live A/B Toggle.
- **FR-10**: Motion Design & Animation Prototyping Engine.

## Non-Functional Requirements
- **Zero-Config**: Seamless integration into existing brownfield projects.
- **Performance**: Sub-50ms Preview Startup time.
- **Confinement**: Zero project file pollution.
- **Hit-Testing Dogma**: Strict adherence for UI overlays.

## Acceptance Criteria
- **AC-1**: `SurfaceAdapter` interface is defined and implemented for Web Core (Vite) successfully (ADR 0004).
- **AC-2**: Components are automatically wrapped in `MockStoryEnvelope` and driven by `MockScenarioAdapter` (ADR 0001).
- **AC-3**: Token gaps trigger foundational design system track output; layout correctly mirrors in RTL modes (ADR 0002).
- **AC-4**: Assembly engine generates multi-track waves structured by DAG dependency edges (ADR 0003).
- **AC-5**: Track specifications are generated with validated schema tags (`CREATES`, `PROTECTED`, `INVARIANT_AFTER`).
- **AC-6**: The agent receives live Fiber context and screen states.
- **AC-7**: In-DOM patches apply instantly without disk writes, supporting A/B toggles.
- **AC-8**: Animation scrubber accurately controls spring physics and adheres to 60fps fluidity constraints.

## Out of Scope
- Full end-to-end integration testing of generated tracks.
- Native implementations of `TerminalSurfaceAdapter` and `ImageMontageSurfaceAdapter` (Phase 1 defers to Web-first core).
