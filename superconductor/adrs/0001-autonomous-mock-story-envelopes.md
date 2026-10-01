# 1. Autonomous Mock Story Envelopes & Multi-Source Mock Adapters

Date: 2026-10-01  
Status: Accepted  

## Context
When inspecting brownfield codebases, Superconductor needs a way to render live visual previews of components and screens in a browser so that the user can attach spatial feedback notes, converse with the agent, test animations, and hot-inject in-DOM proposals.

Two extreme approaches were evaluated:
1. **Flat Image-Based Wireframes (Screenshots / Stitched PNGs)**: Avoids runtime crashes, but produces dead pixels where CSS, hover states, DOM nodes, responsive breakpoints, and animations cannot be tested. In-DOM live drafting and React Fiber source tracking are impossible.
2. **Traditional Manual Storybook**: Provides live components, but requires extensive manual authoring of `.stories.tsx` files and brings a heavy, slow dependency footprint that developers resist maintaining.

## Decision
We adopt **Autonomous Mock Story Envelopes (`MockStoryEnvelope`)** driven by **Multi-Source Mock Adapters (`MockScenarioAdapter`)**:
1. Components are discovered on-the-fly via AST analysis (`ts-morph`) and wrapped in an ephemeral in-memory envelope supplying standard providers (`MockRouterProvider`, `MockThemeProvider`, `MockQueryProvider`).
2. The mock harness uses a `MockScenarioAdapter` capable of switching between:
   - Synthetic TypeScript interface fixtures (zero setup).
   - Local JSON seeds / fixtures.
   - Predefined edge cases: *Loading*, *Empty / Zero State*, *Network Error*, *Overflow / Extreme Text*.
   - Read-only live snapshots.
3. Mutations inside the preview are isolated to an in-memory event bus/state store and strictly prohibited from performing outbound external network calls or modifying real disk files.
4. Static image snapshots (`sharp`) are relegated strictly to read-only archival/export artifacts and non-web terminal captures.

## Consequences
### Positive
- True live interactive DOM rendering with sub-50ms cold starts.
- Exact React Fiber introspection (`fiber._debugSource`) mapping pins to source file lines.
- Enables hot in-DOM proposal drafting and frame-by-frame animation scrubbing.
- Zero repository file pollution or manual `.stories.tsx` authoring requirements.

### Negative
- Highly complex bespoke third-party libraries (e.g. specialized WebGL or proprietary SDKs) may require custom stubbing if they fail inside an in-memory mock envelope.
