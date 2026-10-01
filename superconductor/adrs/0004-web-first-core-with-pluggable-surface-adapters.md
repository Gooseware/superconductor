# 4. Web-First Core with Pluggable Surface Adapters

Date: 2026-10-01  
Status: Accepted  

## Context
Initial brainstorming considered supporting Web components, CLI terminal outputs (via VT100/ANSI emulators), and native desktop interfaces simultaneously. 

However, multi-runtime support introduces severe complexity:
- Heavy native C++ dependencies (`node-pty`, `xterm-addon-serialize`, `libvips` / `sharp`).
- Divergent hit-testing models: Web has real DOM nodes and React Fiber introspection (`fiber._debugSource`), whereas CLI output is linear text streams, and native apps require raster screenshot OCR.
- Attempting all three in a single track dilutes the core value of live in-DOM proposal injection, HMR virtual patching, and spring physics tuning.

## Decision
We adopt a **Web-First Core with a Pluggable Surface Architecture (`SurfaceAdapter`)**:
1. **Phase 1 Scope**: Strictly focus on Web-based projects (React, Next.js, Vite, Vue, Svelte, modern Web SPAs).
   - This delivers maximum functionality: instant sub-50ms HMR, React Fiber file/line introspection, live in-DOM proposal drafting, spring animations, and `@floating-ui` spatial pinning with zero binary dependencies.
2. **Pluggable Contract**:
   - Define a clean `SurfaceAdapter` contract in `@superconductor/core`:
     ```typescript
     export interface SurfaceAdapter {
       readonly name: string;
       detect(projectRoot: string): Promise<boolean>;
       discoverViews(projectRoot: string): Promise<ViewSnapshot[]>;
       mountPreview(viewId: string, container: HTMLElement): Promise<PreviewInstance>;
     }
     ```
   - Deliver `WebComponentSurfaceAdapter` as the primary built-in implementation.
3. **Extension Documentation**:
   - Provide architectural documentation (`docs/surface-adapters.md`) defining how future tracks or plugins can implement `TerminalSurfaceAdapter` (CLI) and `ImageMontageSurfaceAdapter` (Desktop / Native).

## Consequences
### Positive
- Drastic reduction in initial track complexity and failure surface.
- Zero flaky native binary dependencies in `@superconductor/core`.
- 100% focus on perfecting live in-DOM drafting, React Fiber mapping, and animation scrubbing.
- Clean, open plugin architecture for future surfaces.

### Negative
- CLI-only applications must wait for the follow-up `TerminalSurfaceAdapter` plugin track for native terminal previewing.
