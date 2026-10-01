**Status:** [ ]
**Phase:** visual-studio

## Phase 0: SurfaceAdapter Interface & Programmatic Vite Harness

- [ ] Task: Define SurfaceAdapter Interface [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/surface-adapter.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "SurfaceAdapter MUST abstract rendering context away from the core engine."
    - [ ] Create SurfaceAdapter contract
    - [ ] Export types

- [ ] Task: Implement Programmatic Vite Harness [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/vite-harness.ts
    PROTECTED: packages/core/src/surface-adapter.ts
    INVARIANT_AFTER: "Vite server MUST not pollute project files and inject virtual modules in-memory only."
    - [ ] Create Vite server initialization script
    - [ ] Add virtual module injection logic

## Phase 1: AST Scanning (`ts-morph`) & Autonomous `MockStoryEnvelope` with `MockScenarioAdapter`

- [ ] Task: AST Scanning Integration [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/ast-scanner.ts
    PROTECTED: packages/core/src/vite-harness.ts
    INVARIANT_AFTER: "Scanner MUST reliably identify component exports using ts-morph and fast-glob."
    - [ ] Integrate ts-morph for component discovery
    - [ ] Generate fixtures dynamically

- [ ] Task: Autonomous MockStoryEnvelope [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/mock-story-envelope.ts, packages/core/src/mock-scenario-adapter.ts
    PROTECTED: packages/core/src/ast-scanner.ts
    INVARIANT_AFTER: "Components MUST be wrapped in mock providers for isolated rendering."
    - [ ] Implement MockRouterProvider, MockThemeProvider, MockQueryProvider
    - [ ] Implement MockScenarioAdapter for state switching

## Phase 2: Token Synthesis (`TokenSynthesizer`) & Localization Simulation (`LocaleMirrorHarness`)

- [ ] Task: Token Synthesizer [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/token-synthesizer.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "TokenSynthesizer MUST enforce 4-tier semantic token structures."
    - [ ] Implement token enforcement logic
    - [ ] Output foundational design system track

- [ ] Task: Locale Mirror Harness [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/locale-mirror-harness.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "Harness MUST correctly apply bidirectional LTR/RTL layout mirroring."
    - [ ] Implement locale switcher
    - [ ] Add LTR/RTL support logic

## Phase 3: Interactive Visual Studio UI, Spatial Pinning & Spring Physics Animation Studio

- [ ] Task: Floating UI Overlay & Spatial Pinning [TIER-3] [AGENT:superconductor-processor] [DOMAIN:ui]
    CREATES: packages/ui/src/pinning-overlay.tsx
    PROTECTED: packages/ui/src/index.ts
    INVARIANT_AFTER: "Overlay MUST adhere to Hit-Testing Dogma (pointer-events: none on host)."
    - [ ] Implement transparent SVG overlay
    - [ ] Build multi-layer anchoring system (CSS, XPath, Viewport, Fiber)

- [ ] Task: Animation Timeline & Physics Scrubber [TIER-3] [AGENT:superconductor-processor] [DOMAIN:ui]
    CREATES: packages/ui/src/animation-scrubber.tsx
    PROTECTED: packages/ui/src/index.ts
    INVARIANT_AFTER: "Scrubber MUST accurately modulate spring physics variables within 60fps budget."
    - [ ] Implement animation timeline controls
    - [ ] Add spring physics tuning

## Phase 4: Conversational Copilot Sidecar & Hot In-DOM Proposal Injector (with A/B Toggle)

- [ ] Task: Conversational Copilot Sidecar & WebSocket Bridge [TIER-3] [AGENT:superconductor-processor] [DOMAIN:ui]
    CREATES: packages/ui/src/copilot-sidecar.tsx, packages/core/src/websocket-bridge.ts
    PROTECTED: packages/ui/src/index.ts
    INVARIANT_AFTER: "WebSocket bridge MUST reliably transmit Fiber context and receive proposal payloads without dropping frames."
    - [ ] Implement sidecar conversational panel
    - [ ] Build WebSocket bridge to agent session

- [ ] Task: Hot In-DOM Proposal Injector [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/proposal-injector.ts
    PROTECTED: packages/core/src/vite-harness.ts
    INVARIANT_AFTER: "Live proposal injections MUST be ephemeral and togglable without disk writes."
    - [ ] Implement ephemeral virtual module HMR
    - [ ] Add CSS delta injection and A/B toggles

## Phase 5: Layered Assembly Engine & Automated Multi-Track Wave Compiler

- [ ] Task: Layered Assembly Partitioning [TIER-3] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/layered-assembly.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "Assembly MUST organize feedback by editing hierarchy (Tokens -> Components -> Views)."
    - [ ] Implement DAG dependency edge generation
    - [ ] Implement ExecutionPlanner.planWaves

- [ ] Task: Automated Track Compilation [TIER-2] [AGENT:superconductor-processor] [DOMAIN:core]
    CREATES: packages/core/src/track-compiler.ts
    PROTECTED: packages/core/src/layered-assembly.ts
    INVARIANT_AFTER: "Generated specs MUST include validated schema tags (CREATES, PROTECTED, INVARIANT_AFTER)."
    - [ ] Generate spec.md and plan.md from clusters
    - [ ] Validate schema tags in generated output

## Phase 6: Plugin Extension Documentation (`docs/surface-adapters.md`) & Integration Tests

- [ ] Task: Extension Documentation [TIER-4] [AGENT:superconductor-processor] [DOMAIN:docs]
    CREATES: docs/surface-adapters.md
    PROTECTED: packages/core/src/surface-adapter.ts
    INVARIANT_AFTER: "Documentation MUST cover TerminalSurfaceAdapter and ImageMontageSurfaceAdapter future extensions."
    - [ ] Write plugin extension guide
    - [ ] Document SurfaceAdapter contract

- [ ] Task: Integration Tests [TIER-2] [AGENT:superconductor-processor] [DOMAIN:tests]
    CREATES: tests/integration/assembly.test.ts, tests/integration/harness.test.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "Test coverage MUST validate DAG generation and virtual module injection."
    - [ ] Write assembly DAG tests
    - [ ] Write Harness Vite integration tests
