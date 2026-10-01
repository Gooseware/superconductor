**Status:** [ ]
**Phase:** visual-studio

## Phase 0: Infrastructure & Core Engine Setup

- [ ] Task: Implement Programmatic Vite Harness [TIER-2] [AGENT:superconductor-processor]
    CREATES: packages/core/src/vite-harness.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "Vite server MUST not pollute project files and inject virtual modules in-memory only."
    - [ ] Create Vite server initialization script
    - [ ] Add virtual module injection logic
- [ ] Task: AST Scanning Integration [TIER-2] [AGENT:superconductor-processor]
    CREATES: packages/core/src/ast-scanner.ts
    PROTECTED: packages/core/src/vite-harness.ts
    INVARIANT_AFTER: "Scanner MUST reliably identify component exports using ts-morph and fast-glob."
    - [ ] Integrate ts-morph for component discovery
    - [ ] Generate fixtures dynamically

## Phase 1: Visual Rendering & Introspection

- [ ] Task: React Fiber Introspection [TIER-3] [AGENT:superconductor-processor]
    CREATES: packages/core/src/fiber-introspection.ts
    PROTECTED: packages/core/src/ast-scanner.ts
    INVARIANT_AFTER: "Introspection MUST extract exact source file and line numbers from Fiber nodes."
    - [ ] Hook into React Fiber _debugSource
    - [ ] Map DOM nodes to source locations
- [ ] Task: Terminal Visual Fallback Engine [TIER-2] [AGENT:superconductor-processor]
    CREATES: packages/core/src/terminal-renderer.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "ANSI to HTML rendering MUST preserve layout and support DOM anchors for pinning."
    - [ ] Implement ansi-to-html wrapper
    - [ ] Setup xterm VT100 interactive mode

## Phase 2: Interactive Studio & Pinning

- [ ] Task: Floating UI Overlay & Spatial Pinning [TIER-3] [AGENT:superconductor-processor]
    CREATES: packages/ui/src/pinning-overlay.tsx
    PROTECTED: packages/ui/src/index.ts
    INVARIANT_AFTER: "Overlay MUST adhere to Hit-Testing Dogma (pointer-events: none on host)."
    - [ ] Implement transparent SVG overlay
    - [ ] Build multi-layer anchoring system (CSS, XPath, Viewport, Fiber)

## Phase 3: Assembly Engine & Track Generation

- [ ] Task: 4-Level Clustering Engine [TIER-3] [AGENT:superconductor-processor]
    CREATES: packages/core/src/assembly-engine.ts
    PROTECTED: packages/core/src/index.ts
    INVARIANT_AFTER: "Clustering MUST accurately partition notes into View, AST Proximity, Spatial IoU, and Semantic Tags."
    - [ ] Implement Level 1-4 clustering algorithms
    - [ ] Integrate with 04_coupling.json
- [ ] Task: Automated Track Compilation [TIER-2] [AGENT:superconductor-processor]
    CREATES: packages/core/src/track-compiler.ts
    PROTECTED: packages/core/src/assembly-engine.ts
    INVARIANT_AFTER: "Generated specs MUST include validated schema tags (CREATES, PROTECTED, INVARIANT_AFTER)."
    - [ ] Generate spec.md and plan.md from clusters
    - [ ] Validate schema tags in generated output
