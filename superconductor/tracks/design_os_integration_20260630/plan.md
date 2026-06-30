# Implementation Plan: Design OS Integration

## Phase 0: Submodule Setup & Local Kernel Build

- [x] Task: Add design-os-kernel as a git submodule [TIER-1] (e50e564)
    - [x] Sub-task: Run `git submodule add git@gitlab.com:socialhippos/design-os-kernel packages/design-os-kernel` in the superconductor repo root
    - [x] Sub-task: Verify `.gitmodules` file is created correctly
    - [x] Sub-task: Verify `packages/design-os-kernel/` directory is populated
    - [x] Sub-task: Commit `.gitmodules` and the submodule pointer with message `chore(packages): add design-os-kernel as git submodule`
- [x] Task: Build the kernel locally [TIER-1] (566a474)
    - [x] Sub-task: Run `npm install` inside `packages/design-os-kernel/`
    - [x] Sub-task: Run `npm run build` inside `packages/design-os-kernel/`
    - [x] Sub-task: Verify `packages/design-os-kernel/dist/index.js` exists
    - [x] Sub-task: Add `packages/design-os-kernel/dist/` and `packages/design-os-kernel/node_modules/` to `.gitignore`
- [x] Task: Create `packages/README.md` [TIER-3] (ed3017f)
    - [x] Sub-task: Document purpose of the `packages/` directory
    - [x] Sub-task: Document one-time submodule init command: `git submodule update --init --recursive`
    - [x] Sub-task: Document kernel build steps: `cd packages/design-os-kernel && npm install && npm run build`
    - [x] Sub-task: Document how to update the kernel: `git submodule update --remote packages/design-os-kernel`
- [~] Task: User Manual Verification 'Phase 0: Submodule Setup & Local Kernel Build' (Protocol in workflow.md)

## Phase 1: MCP Server Wiring

- [ ] Task: Update `gemini-extension.json` to add mcpServers section [TIER-3]
    - [ ] Sub-task: Add `mcpServers` key with `design-os-kernel` entry
    - [ ] Sub-task: Set command to `node` and args to `["${extensionPath}/packages/design-os-kernel/dist/index.js"]`
    - [ ] Sub-task: Confirm the full updated JSON is valid
- [ ] Task: Validate extension with updated manifest [TIER-1]
    - [ ] Sub-task: Run `gemini extensions validate /home/gooseware/repos/gemini/extensions/superconductor`
    - [ ] Sub-task: Confirm output: `Extension ... has been successfully validated.`
- [ ] Task: Reload extension to verify MCP server is surfaced [TIER-1]
    - [ ] Sub-task: Run `gemini extensions list` and confirm `design-os-kernel` appears as an MCP server under superconductor
- [ ] Task: User Manual Verification 'Phase 1: MCP Server Wiring' (Protocol in workflow.md)

## Phase 2: Bundle Design OS Skills

- [ ] Task: Copy Design OS core workflow skills into `skills/` [TIER-1]
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-orchestrator/` → `skills/design-os-orchestrator/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-vision/` → `skills/design-os-vision/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-roadmap/` → `skills/design-os-roadmap/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-data-model/` → `skills/design-os-data-model/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-design-system/` → `skills/design-os-design-system/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-kernel-setup/` → `skills/design-os-kernel-setup/`
- [ ] Task: Copy theming skills into `skills/` [TIER-1]
    - [ ] Sub-task: Copy `~/.gemini/config/skills/theme-manager-flow/` → `skills/theme-manager-flow/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-inspiration/` → `skills/design-os-inspiration/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-enhance/` → `skills/design-os-enhance/`
- [ ] Task: Copy i18n skill into `skills/` [TIER-1]
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-i18n/` → `skills/design-os-i18n/`
- [ ] Task: Copy UI construction skills into `skills/` [TIER-1]
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-app-shell/` → `skills/design-os-app-shell/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-spec-ingest/` → `skills/design-os-spec-ingest/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/component-adapter/` → `skills/component-adapter/`
    - [ ] Sub-task: Copy `~/.gemini/config/skills/design-os-extractor/` → `skills/design-os-extractor/`
- [ ] Task: Verify all 14 skills exist under `skills/` [TIER-1]
    - [ ] Sub-task: Run `ls skills/` and confirm all 14 new skill directories are present alongside the existing 2
- [ ] Task: User Manual Verification 'Phase 2: Bundle Design OS Skills' (Protocol in workflow.md)

## Phase 3: Catalog & Documentation Updates

- [ ] Task: Update `skills/catalog.md` with Design OS skills section [TIER-3]
    - [ ] Sub-task: Add `## Design OS Skills` section heading
    - [ ] Sub-task: Add entry for `design-os-orchestrator` (detection: `What's next, status check, Design OS`)
    - [ ] Sub-task: Add entry for `design-os-vision` (detection: `new project, product vision, what are we building`)
    - [ ] Sub-task: Add entry for `design-os-roadmap` (detection: `roadmap, milestones, development sections`)
    - [ ] Sub-task: Add entry for `design-os-data-model` (detection: `data model, entities, relationships, schema`)
    - [ ] Sub-task: Add entry for `design-os-design-system` (detection: `colors, typography, tokens, design system`)
    - [ ] Sub-task: Add entry for `design-os-kernel-setup` (detection: `MCP server, kernel setup, kernel not connected`)
    - [ ] Sub-task: Add entry for `theme-manager-flow` (detection: `dark mode, theme, brand colors`)
    - [ ] Sub-task: Add entry for `design-os-inspiration` (detection: `inspiration, moodboard, visual reference`)
    - [ ] Sub-task: Add entry for `design-os-enhance` (detection: `refactor UI, upgrade design, brownfield`)
    - [ ] Sub-task: Add entry for `design-os-i18n` (detection: `i18n, internationalization, localization, multiple languages, currency`)
    - [ ] Sub-task: Add entry for `design-os-app-shell` (detection: `navigation, sidebar, app layout, chrome`)
    - [ ] Sub-task: Add entry for `design-os-spec-ingest` (detection: `import spec, external document, PDF spec`)
    - [ ] Sub-task: Add entry for `component-adapter` (detection: `import component, third-party registry, adapt component`)
    - [ ] Sub-task: Add entry for `design-os-extractor` (detection: `extract component, Opinion Block, reusable component`)
- [ ] Task: Update `README.md` with Design OS section [TIER-3]
    - [ ] Sub-task: Add `## Design OS` section after Features section
    - [ ] Sub-task: Describe what Design OS is (Kernel MCP + skill suite for product planning and component generation)
    - [ ] Sub-task: List the bundled Design OS skills with one-line descriptions
    - [ ] Sub-task: Document the one-time submodule init step
    - [ ] Sub-task: Document the one-time kernel build step
- [ ] Task: Update `GEMINI.md` Universal File Resolution Protocol [TIER-3]
    - [ ] Sub-task: Add `design-os-kernel` MCP server to the Agent Configuration section
    - [ ] Sub-task: Note that Design OS skills are auto-available when the extension is installed
- [ ] Task: User Manual Verification 'Phase 3: Catalog & Documentation Updates' (Protocol in workflow.md)

## Phase 4: Commit & Push

- [ ] Task: Stage and commit all track changes [TIER-1]
    - [ ] Sub-task: `git add -A && git commit -m "feat(design-os): bundle kernel submodule, MCP wiring, and Design OS skills suite"`
    - [ ] Sub-task: `git push origin main`
- [ ] Task: User Manual Verification 'Phase 4: Commit & Push' (Protocol in workflow.md)
