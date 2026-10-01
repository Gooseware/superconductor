# Living Application Wireframes & Visual Feedback-to-Tracks Assembly Engine

## Background, Problem & Architectural Rationale
The user needs a system to create wireframes/visual previews for an application "as is". This system will allow them to browse the application in a browser, attach spatial/DOM-anchored notes for improvements, and automatically assemble those visual feedback notes into multiple Superconductor tracks (`spec.md` + `plan.md`).

## Ecosystem Alignment & Package Evaluation
- **Programmatic Vite dev server**: (`vite.createServer`) with in-memory virtual module injection (`virtual:superconductor-preview`). Zero project file pollution, zero cold-start delay, 100% zero-config on brownfield projects.
- **AST Scanning**: via `ts-morph` and `fast-glob` (native in `@superconductor/core`) for automated component discovery.
- **Floating UI**: `@floating-ui/react` popover engine with custom transparent SVG overlay adhering to Design OS Hit-Testing Dogma.
- **Terminal Parsing**: `ansi-to-html` rendering inside an Astryx macOS terminal chrome frame.
- **Terminal Interaction**: Interactive VT100 terminal mode via `@xterm/xterm` + `@xterm/addon-serialize`.
- **Image Processing**: Headless image montage & stitching via `sharp` and client-side CSS Grid montage in `react-zoom-pan-pinch`.

## Functional Requirements
- **FR-1**: Live Web Component Extraction & Sandboxing (Web Mode) using Programmatic Vite.
- **FR-2**: React Fiber Debug Source Introspection to capture exact JSX component source file and line numbers.
- **FR-3**: Non-Web & Terminal Visual Fallback (CLI / Backend Mode) using `ansi-to-html`.
- **FR-4**: Interactive Visual Studio & Spatial Pinning with multi-layer anchoring.
- **FR-5**: Note-to-Track Assembly Engine with 4-level clustering.
- **FR-6**: Automated compilation into Superconductor Track specifications.

## Non-Functional Requirements
- **Zero-Config**: Seamless integration into existing brownfield projects.
- **Performance**: Sub-50ms Preview Startup time.
- **Confinement**: Zero project file pollution.
- **Hit-Testing Dogma**: Strict adherence for UI overlays.

## Acceptance Criteria
- **AC-1**: Vite server spins up and injects virtual modules successfully.
- **AC-2**: Components are automatically discovered via AST scanning.
- **AC-3**: Terminal output renders accurately in HTML with pin support.
- **AC-4**: Spatial pinning captures precise anchors (CSS, XPath, Viewport, Fiber).
- **AC-5**: The Assembly engine clusters notes into 4 distinct levels.
- **AC-6**: Track specifications are generated with validated schema tags (`CREATES`, `PROTECTED`, `INVARIANT_AFTER`).

## Out of Scope
- Full end-to-end integration testing of generated tracks.
