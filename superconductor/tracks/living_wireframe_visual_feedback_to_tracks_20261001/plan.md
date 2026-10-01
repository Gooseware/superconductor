**Status:** [x]
**Phase:** visual-studio

## Phase 0: SurfaceAdapter Interface & Programmatic Vite Harness

- [x] Task: Define SurfaceAdapter Interface [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/surface-adapter.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "SurfaceAdapter MUST abstract rendering context away from the core engine."
    - [x] Create SurfaceAdapter contract
    - [x] Export types

- [x] Task: Implement Programmatic Vite Harness [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/vite-harness.ts
    PROTECTED: packages/core/src/surface-adapter.ts
    INVARIANT_AFTER: "Vite server MUST not pollute project files and inject virtual modules in-memory only."
    - [x] Create Vite server initialization script
    - [x] Add virtual module injection logic

- [x] Task: Intra-Track TaskWavePlanner & Antichain Batcher [TIER-2] [AGENT:superconductor-processor] [DOMAIN:orchestration]
    CREATES: packages/superconductor-core/src/orchestration/task-wave-planner.ts
    PROTECTED: packages/superconductor-core/src/orchestration/swarm-granularity.ts
    INVARIANT_AFTER: "TaskWavePlanner MUST partition tasks across phases into topological antichains based on file/dependency DAGs."
    - [x] Build TaskWavePlanner extracting CREATES/PROTECTED dependency edges
    - [x] Enforce antichain batching across phases without artificial phase sync barriers
    - [x] Add comprehensive unit tests

## Phase 1: AST Scanning (`ts-morph`) & Autonomous `MockStoryEnvelope` with `MockScenarioAdapter`

- [x] Task: AST Scanning Integration [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/ast-scanner.ts
    PROTECTED: packages/core/src/vite-harness.ts
    INVARIANT_AFTER: "Scanner MUST reliably identify component exports using ts-morph and fast-glob."
    - [x] Integrate ts-morph for component discovery
    - [x] Generate fixtures dynamically

- [x] Task: Autonomous MockStoryEnvelope [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/mock-story-envelope.ts, packages/core/src/mock-scenario-adapter.ts
    PROTECTED: packages/core/src/ast-scanner.ts
    INVARIANT_AFTER: "Components MUST be wrapped in mock providers for isolated rendering."
    - [x] Implement MockRouterProvider, MockThemeProvider, MockQueryProvider
    - [x] Implement MockScenarioAdapter for state switching

## Phase 2: Token Synthesis (`TokenSynthesizer`) & Localization Simulation (`LocaleMirrorHarness`)

- [x] Task: Token Synthesizer [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/token-synthesizer.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "TokenSynthesizer MUST enforce 4-tier semantic token structures."
    - [x] Implement token enforcement logic
    - [x] Output foundational design system track

- [x] Task: Locale Mirror Harness [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/locale-mirror-harness.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "Harness MUST correctly apply bidirectional LTR/RTL layout mirroring."
    - [x] Implement locale switcher
    - [x] Add LTR/RTL support logic

## Phase 3: Interactive Visual Studio UI, Spatial Pinning & Spring Physics Animation Studio

- [x] Task: Floating UI Overlay & Spatial Pinning [TIER-3] [AGENT:superconductor-processor] [DOMAIN:ui]
    CREATES: packages/ui/src/pinning-overlay.tsx
    PROTECTED: packages/ui/src/index.ts
    INVARIANT_AFTER: "Overlay MUST adhere to Hit-Testing Dogma (pointer-events: none on host)."
    - [x] Implement transparent SVG overlay
    - [x] Build multi-layer anchoring system (CSS, XPath, Viewport, Fiber)

- [x] Task: Animation Timeline & Physics Scrubber [TIER-3] [AGENT:superconductor-processor] [DOMAIN:ui]
    CREATES: packages/ui/src/animation-scrubber.tsx
    PROTECTED: packages/ui/src/index.ts
    INVARIANT_AFTER: "Scrubber MUST accurately modulate spring physics variables within 60fps budget."
    - [x] Implement animation timeline controls
    - [x] Add spring physics tuning

## Phase 4: Conversational Copilot Sidecar & Hot In-DOM Proposal Injector (with A/B Toggle)

- [x] Task: Conversational Copilot Sidecar & WebSocket Bridge [TIER-3] [AGENT:superconductor-processor] [DOMAIN:ui]
    CREATES: packages/ui/src/copilot-sidecar.tsx, packages/core/src/websocket-bridge.ts
    PROTECTED: packages/ui/src/index.ts
    INVARIANT_AFTER: "WebSocket bridge MUST reliably transmit Fiber context and receive proposal payloads without dropping frames."
    - [x] Implement sidecar conversational panel
    - [x] Build WebSocket bridge to agent session

- [x] Task: Hot In-DOM Proposal Injector [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/proposal-injector.ts
    PROTECTED: packages/core/src/vite-harness.ts
    INVARIANT_AFTER: "Live proposal injections MUST be ephemeral and togglable without disk writes."
    - [x] Implement ephemeral virtual module HMR
    - [x] Add CSS delta injection and A/B toggles

## Phase 5: Layered Assembly Engine & Automated Multi-Track Wave Compiler

- [x] Task: Layered Assembly Partitioning [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/layered-assembly.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "Assembly MUST organize feedback by editing hierarchy (Tokens -> Components -> Views)."
    - [x] Implement DAG dependency edge generation
    - [x] Implement ExecutionPlanner.planWaves

- [x] Task: Automated Track Compilation [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/track-compiler.ts
    PROTECTED: packages/core/src/layered-assembly.ts
    INVARIANT_AFTER: "Generated specs MUST include validated schema tags (CREATES, PROTECTED, INVARIANT_AFTER)."
    - [x] Generate spec.md and plan.md from clusters
    - [x] Validate schema tags in generated output

## Phase 6: Plugin Extension Documentation (`docs/surface-adapters.md`) & Integration Tests

- [x] Task: Extension Documentation [TIER-4] [AGENT:superconductor-processor] [DOMAIN:docs]
    CREATES: docs/surface-adapters.md
    PROTECTED: packages/core/src/surface-adapter.ts
    INVARIANT_AFTER: "Documentation MUST cover TerminalSurfaceAdapter and ImageMontageSurfaceAdapter future extensions."
    - [x] Write plugin extension guide
    - [x] Document SurfaceAdapter contract

- [x] Task: Integration Tests [TIER-2] [AGENT:superconductor-processor] [DOMAIN:tests]
    CREATES: tests/integration/assembly.test.ts, tests/integration/harness.test.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "Test coverage MUST validate DAG generation and virtual module injection."
    - [x] Write assembly DAG tests
    - [x] Write Harness Vite integration tests
