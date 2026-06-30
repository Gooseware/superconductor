# Specification: Design OS Integration

## Overview
Bring the complete Design OS system — Kernel MCP server and the full suite of companion agent skills — into the Superconductor extension as a first-class, bundled experience. The Kernel is added as a **git submodule** (sourced from `git@gitlab.com:socialhippos/design-os-kernel`) at `packages/design-os-kernel/`. All Design OS skills currently living in the user's global `~/.gemini/config/skills/` are copied into Superconductor's `skills/` directory so they ship with the extension for any user who installs it. The `gemini-extension.json` is updated to wire the local Kernel build as an MCP server.

## Motivation
Currently a new Superconductor user gets the `design-heuristics` visual rules skill and the `design-os-kernel-dogma` authoring guidelines skill, but **not** the live Design OS Kernel (MCP server) or the workflow-level skills (theming, i18n, design system, orchestrator, etc.). This means the full Design OS workflow — the structured product planning and component generation system — is unavailable out of the box. This track closes that gap.

## Scope: Skills to Bundle

The following skills from `~/.gemini/config/skills/` are in scope for bundling:

### Design OS Core Workflow Skills (HIGH PRIORITY)
- `design-os-orchestrator` — Central status check and step sequencer
- `design-os-vision` — Product vision definition
- `design-os-roadmap` — Breaking vision into development sections
- `design-os-data-model` — Core entities and relationships
- `design-os-design-system` — Colors, typography, semantic token selection
- `design-os-kernel-setup` — Kernel initialization, build verification, MCP wiring

### Theming Skills (HIGH PRIORITY — explicitly requested)
- `theme-manager-flow` — Dark mode, brand themes, contextual overrides
- `design-os-inspiration` — Visual inspiration extraction to design tokens
- `design-os-enhance` — Brownfield design enhancement

### i18n Skills (HIGH PRIORITY — explicitly requested)
- `design-os-i18n` — Internationalization, localization, currency strategy

### UI Construction Skills (MEDIUM PRIORITY)
- `design-os-app-shell` — App chrome, navigation, persistent layout
- `design-os-spec-ingest` — External specification ingestion
- `component-adapter` — Tier-1 to Tier-2 registry promotion pipeline
- `design-os-extractor` — Extract features to reusable Opinion Blocks

### Already Bundled (DO NOT duplicate)
- `design-heuristics` — Already in `skills/` ✅
- `design-os-kernel-dogma` — Already in `skills/` ✅

## Functional Requirements

### FR-1: Git Submodule for the Kernel
- Add `git@gitlab.com:socialhippos/design-os-kernel` as a submodule at `packages/design-os-kernel/`.
- Pin to the current HEAD of the `main` branch.
- The submodule must be initialized with `git submodule update --init --recursive`.
- The `.gitmodules` file must be committed to the Superconductor repo.

### FR-2: Local Kernel Build
- After submodule init, run `npm install && npm run build` inside `packages/design-os-kernel/`.
- Verify that `packages/design-os-kernel/dist/` exists after the build.
- Document these build steps in a new `packages/README.md`.

### FR-3: MCP Server Wiring in `gemini-extension.json`
- Add a `mcpServers` section to `gemini-extension.json`.
- The MCP server entry must use `${extensionPath}` as the root prefix so the path works whether installed via `link` or `install`.
- Server name: `design-os-kernel`
- Command: `node`
- Args: `["${extensionPath}/packages/design-os-kernel/dist/index.js"]`

### FR-4: Bundle All In-Scope Design OS Skills
- Copy all skills listed in "Scope: Skills to Bundle" into `skills/` within the Superconductor repo.
- Each skill must be copied as a directory: `skills/<skill-name>/SKILL.md` (preserving any `references/`, `scripts/`, or `resources/` subdirectories).
- Skills must not be modified — copy verbatim so they remain compatible with the global config originals.

### FR-5: Update `skills/catalog.md`
- Add catalog entries for every newly bundled skill.
- Group under an existing or new `## Design OS` section.
- Each entry needs: description, party (`1p`), detection signals (keywords).

### FR-6: Update `gemini-extension.json` Validate
- Run `gemini extensions validate` after all changes; it must pass.

### FR-7: Update README.md
- Add a `## Design OS` section to the README explaining:
  - What Design OS is
  - That the Kernel MCP server is bundled
  - How to init the submodule (`git submodule update --init --recursive`)
  - That the kernel must be built once (`cd packages/design-os-kernel && npm install && npm run build`)
  - The list of bundled Design OS skills

### FR-8: Update `GEMINI.md` Universal File Resolution Protocol
- Register `design-os-kernel` MCP server in the GEMINI.md context file so the agent knows it is available.
- Add a note that Design OS skills are available when the extension is installed.

### FR-9: Create `packages/README.md`
- Document the `packages/` directory purpose.
- Document submodule init steps.
- Document kernel build steps.
- Document how to update the kernel submodule.

## Non-Functional Requirements
- The submodule approach means end-users must run `git submodule update --init` once — document this clearly.
- The kernel build is a one-time step (`npm install && npm run build`) — document in README.
- Skills are copied verbatim; any future updates to the originals require a manual sync (acceptable for MVP).
- `gemini extensions validate` must pass after all changes.

## Acceptance Criteria
- `packages/design-os-kernel/dist/index.js` exists after `npm install && npm run build`.
- `gemini-extension.json` `mcpServers` section is present and `gemini extensions validate` passes.
- All 12 in-scope Design OS skills exist as directories under `skills/`.
- `skills/catalog.md` has entries for all newly bundled skills.
- README.md explains the Design OS integration and build steps.
- `gemini extensions list` shows `design-os-kernel` as an MCP server for the superconductor extension.

## Out of Scope
- Automatic kernel build on extension install (AGY does not support post-install hooks).
- Syncing bundled skills automatically with the global config originals.
- Publishing the Kernel to npm or a public registry.
- Modifying any Design OS skill content.
