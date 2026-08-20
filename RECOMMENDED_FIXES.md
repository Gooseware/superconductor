# Superconductor Architecture Recommendations & Fixes

**Document Version:** 3.0.0  
**Generated Date:** 2026-08-20  
**Repository:** `/home/gooseware/repos/gemini/extensions/superconductor`  
**Authors:** Multi-Agent Swarm Engineering Team & Oracle Review Panel  

---

## Executive Summary

Superconductor is a language-agnostic, framework-agnostic spec-driven autonomous multi-agent platform. Whether a project is built in **Rust, Go, Python, C#/.NET, C/C++, Swift, Kotlin, Zig, or TypeScript/JavaScript**, the orchestration lifecycle must enforce rigorous setup discovery, domain subagent delegation, automated design/contract compliance, and quorum review standards.

This document codifies stack-independent architectural improvements and runtime guardrails to be integrated directly into the **Superconductor Extension Repository**.

---

## 1. Setup Phase: Visual Language, Theme Architecture & Token Contract Lock-In

### The Problem
When projects with graphical or user-facing interfaces are initialized without an explicit, locked-down styling and token architecture, subagents inevitably introduce arbitrary hardcoded colors (hex literals, hardcoded RGB/RGBA tuples), inconsistent geometry (divergent corner radii, magic padding numbers), and divergent widget primitives. Retrofitting theme adaptability or visual consistency later causes immense codebase churn.

### Recommended Fix
In `skills/setup/SKILL.md` and `skills/grill/SKILL.md`, introduce a **Mandatory Visual & Design Token Discovery Gate**:
- **Token Contract Selection**: Lock down the visual token contract at project initialization regardless of tech stack:
  - *Web / CSS*: CSS Custom Properties, Tailwind tokens, CSS Modules, or Design Tokens JSON.
  - *Rust / Desktop (Slint, Iced, Tauri)*: Palette structs, theme resources, or design token constants.
  - *Go (Fyne, Templ, HTMX)*: Theme interfaces, canvas resource constants, or CSS token variables.
  - *Python (PyQt, Flet, NiceGUI, Django/FastAPI)*: QSS stylesheets, Theme palettes, or design token dictionaries.
  - *Mobile / Native (SwiftUI, Jetpack Compose, Flutter)*: Asset Catalogs, `ColorScheme`, or `ThemeData` tokens.
  - *C++ / Qt / ImGui*: Style sheets, palette definitions, or theme configuration files.
- **Universal Semantic Token Contract**:
  - *Surfaces & Backgrounds*: Base background, elevated surface, subtle container.
  - *Content & Typography*: Primary text/icons, secondary/muted text, inverted text.
  - *Brand & State*: Primary/Accent, borders/dividers, success, warning, error.
  - *Geometry & Spacing*: Container radius, element radius, standardized spacing scale.
- **Automated Token Compliance Linter / Auditor**:
  - Scaffold an automated static scanner or linter rule appropriate for the stack (e.g. regex/AST scanner for hardcoded hex/RGB values in UI files, or stylelint/custom test) to guarantee 0 un-tokenized style literals in production views.

---

## 2. Setup Phase: Multilingual & Localization (i18n / l10n) Upfront Discovery

### The Problem
Deciding whether an application needs to be multilingual halfway through development results in massive, error-prone code refactors. Extracting raw hardcoded text strings into translation catalogs across hundreds of UI components or service templates is costly and causes regressions.

### Recommended Fix
In `skills/setup/SKILL.md`, `skills/to-spec/SKILL.md`, and `skills/grill/SKILL.md`, add an explicit **Multilingual & Localization Discovery Gate**:
- **Upfront User Prompt**: During initial project interview/setup, explicitly ask:
  > *"Will this application need to support multiple languages, international locales, right-to-left (RTL) scripts, or localized formatting now or in the future?"*
- **If Yes (Multilingual from Day One)**:
  - Scaffold the stack-appropriate localization framework immediately:
    - *Rust*: `fluent-rs`, `gettext-rs`, or `i18n-embed`
    - *Go*: `golang.org/x/text`, `gotext`, or `go-i18n`
    - *Python*: `gettext`, `Babel`, or `django.utils.translation`
    - *C# / .NET*: `IStringLocalizer`, `Microsoft.Extensions.Localization`, `.resx`
    - *Swift / iOS*: `String(localized:)`, `.xcstrings` string catalogs
    - *Kotlin / Android*: `res/values-*/strings.xml` or Compose `stringResource`
    - *Flutter*: `flutter_localizations`, ARB files, `intl`
    - *Web / TS*: `@lingui/core`, `next-intl`, `react-i18next`, or `formatjs`
  - Configure catalog extraction and compilation tasks in the project's build pipeline.
  - Mandate that all user-facing strings use localization helpers/macros from the very first feature track.
- **If No (Monolingual)**:
  - Explicitly document the single-language assumption in `superconductor/project.md` and track specs to prevent unnecessary localization boilerplate.

---

## 3. Multi-Agent Delegation Hard Gate (Anti-Hero-Agent Protocol)

### The Problem
During `/superconductor:implement` or `/superconductor:review`, the root orchestrator model may occasionally fall back to performing direct file edits directly in the parent context instead of delegating to domain subagents. This defeats the Superconductor swarm architecture, clutters parent context windows, prevents domain-isolated execution, and bypasses independent verification checks.

### Recommended Fix
In `skills/implement/SKILL.md` and `skills/swarm-execute/SKILL.md`, introduce a **Mandatory Subagent Dispatch Gate**:
- **Domain Decomposition**: The root orchestrator MUST partition implementation tracks into domain-specific subagents (`superconductor-processor`) based on subsystem boundaries (e.g., Core Engine, Database / Storage, API / Protocols, UI Views, Integration / E2E).
- **Tool Restriction Policy**: The root orchestrator's system prompt must explicitly restrict direct file write tools during `implement` and `review` phases, enforcing delegation via `invoke_subagent`.
- **Remediation Loop**: When Quorum reviewers flag findings (`NEEDS_FIXES`), the orchestrator MUST spawn isolated `superconductor-processor` remediator subagents instead of directly patching files in the root session.

```markdown
<!-- Proposed addition to skills/implement/SKILL.md -->
### Root Orchestration Dogma
1. The Root Agent is an **Orchestrator and Conductor**, not an individual contributor.
2. Direct edits on product code files by the Root Agent are **PROHIBITED** during Swarm Execution.
3. Every plan phase MUST be delegated to one or more specialized `superconductor-processor` subagents.
4. Quorum reviews MUST be conducted by parallel `superconductor-reviewer` subagents.
```

---

## 4. Universal 4-Reviewer Quorum & Oracle Tier 4 Sign-Off

### The Problem
Single-agent reviews suffer from confirmation bias and blind spots across different technical layers (e.g., passing unit tests while overlooking memory safety, SQL injection, event capture regressions, or mock test theatre).

### Recommended Fix
Standardize the **Universal 4-Reviewer Quorum + Oracle Protocol** in `skills/standalone-review/SKILL.md` and `skills/review/SKILL.md` across all programming languages:
1. 🛡️ **Security Reviewer**: Stack-specific security audit (memory safety, buffer boundaries, sanitization of user inputs, SQL/command injection prevention, crypto correctness, authentication & authorization).
2. 🎯 **Correctness Reviewer**: Spec acceptance criteria verification, full test suite pass rate (e.g. `cargo test`, `go test ./...`, `pytest`, `dotnet test`, `npm test`, `ctest`), zero hardcoded literals/contract violations.
3. 🕵️ **Adversarial Reviewer**: 8-point Shenanigan checklist:
   - *Phantom Implementation* (stubbed functions/empty structs passed as complete)
   - *Test Theatre* (tautological tests, `assert True`, bypassed mocks)
   - *Silent Degradation* (error paths swallowing exceptions without logging or handling)
   - *Coverage Map Gaming* (marking spec items complete without substantive code changes)
   - *Confidence Washing* & *Hardcoded Results*
4. 🔄 **Regression Reviewer**: Interaction layer verification, backward compatibility, performance benchmarks, and end-to-end / UI automation suites.
5. 🏛️ **Oracle Sign-off**: Tier 4 architectural synthesis and issue of the cryptographic seal before merge.

---

## 5. UI Layering & Event Hit-Testing Dogma

### The Problem
In applications with layered rendering (HUDs, story carousels, video overlays, floating action buttons, modals, game UI viewports), parent layers frequently disable interaction to allow background gestures or rendering to pass through. Subcomponents (buttons, headers, inputs) frequently fail to explicitly re-enable event handling / hit testing. This leads to subtle click/tap interception bugs where controls look active but are unreachable.

### Recommended Fix
In `skills/design-heuristics/SKILL.md` and `skills/superconductor-kernel-dogma/SKILL.md`, add the universal **UI Layer Hit-Testing Standard**:
- Any interactive component rendered inside a floating layer or pass-through overlay container MUST explicitly configure event handling:
  - *Web / CSS*: `pointer-events: auto;`
  - *Flutter*: `HitTestBehavior.opaque` / `IgnorePointer(ignoring: false)`
  - *SwiftUI*: `.allowsHitTesting(true)` / `.contentShape(Rectangle())`
  - *Jetpack Compose*: `Modifier.pointerInput(...)` / clickable surfaces
  - *Qt / QML*: `MouseArea { enabled: true }` / `acceptedMouseButtons`
  - *Godot / Game Engines*: `mouse_filter = MOUSE_FILTER_STOP`
- Automation / E2E test suites MUST test genuine pointer / touch interaction on all overlay subcomponents.

---

## 6. User Notification & Terminal Focus Protocol

### The Problem
During long-running multi-agent runs (which can take 5-15 minutes across multiple subagent swarms and test suites), the user frequently shifts focus to other workspaces, IDEs, or browser windows.

### Recommended Fix
In `skills/swarm-execute/SKILL.md` and `skills/implement/SKILL.md`, enforce the **Terminal Focus Notification Gate**:
- Before pausing for user input, awaiting subagent milestones, or concluding a track, verify terminal window focus using the platform focus detection script (`~/.local/bin/check_focus_notify.sh`).
- If the terminal is not focused, trigger desktop notifications (`notify-send`, system alerts) to notify the user of track completion or required interaction.

---

## Summary of Implementation Actions for Superconductor Repository

| Area | Target File / Skill | Action |
|---|---|---|
| **Setup & Scaffolding** | `skills/setup/SKILL.md` | Add ecosystem-agnostic Visual Identity & Token Contract lock-in |
| **Requirements Discovery** | `skills/setup/SKILL.md`, `skills/grill/SKILL.md` | Add upfront Multilingual (i18n/l10n) discovery question and catalog setup |
| **Swarm Orchestrator** | `skills/implement/SKILL.md` | Add Anti-Hero hard gate preventing direct parent edits across all tech stacks |
| **Quorum Review** | `skills/review/SKILL.md` | Universal 4-Reviewer Quorum (Security, Correctness, Adversarial, Regression) + Oracle |
| **UI Dogma** | `skills/design-heuristics/SKILL.md` | Add Layer Hit-Testing / Event Handling rule for floating & overlay components |
| **User Interaction** | `skills/swarm-execute/SKILL.md` | Mandate terminal focus check before yielding turn |

---
*Signed by Superconductor Multi-Agent Swarm Panel (Security, Correctness, Adversarial, Regression, Oracle)*
