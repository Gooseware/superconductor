# Implementation Plan: Multi-Language Persona Skills Architecture, Setup Dogma & Swarm Guardrails

**Track ID:** `multi_language_persona_architecture_20260820`  
**Spec:** [spec.md](./spec.md)  
**Branch:** `track/multi_language_persona_architecture_20260820`  
**Target Branch:** `main`  
**Tier:** 4  

---

## Phase 0: Swarm Preflight & Scaffolding [TIER-1]

- [x] Task: Preflight verification of repository branch and permission manifest [TIER-1] [AGENT:superconductor-processor]
    - [x] Confirm active branch is `track/multi_language_persona_architecture_20260820`
    - [x] Verify `permission-manifest.toml`, `metadata.json`, `index.md`, and `spec.md` are correctly located in `superconductor/tracks/multi_language_persona_architecture_20260820/`
    - [x] Verify workspace build tooling (`pnpm test`, `npm test` in `packages/superconductor-core`)
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Setup Dogma, i18n Discovery Gate & Swarm Guardrails [TIER-3]

- [x] Task: Integrate Visual Language & Token Contract Gate into `skills/setup/SKILL.md` and `skills/grill/SKILL.md` (FR-1, AC-1) [TIER-3] [AGENT:superconductor-processor] (commit: `4a9ac079`)
    - [x] Add mandatory styling token discovery step during project initialization
    - [x] Add 4-tier semantic token taxonomy (Surfaces, Typography, State/Brand, Geometry/Spacing)
    - [x] Add static token compliance linting requirement (0 untokenized style literals)
- [x] Task: Integrate Upfront Multilingual / i18n Discovery Gate into `skills/setup/SKILL.md`, `skills/to-spec/SKILL.md`, and `skills/grill/SKILL.md` (FR-2, AC-2) [TIER-3] [AGENT:superconductor-processor] (commit: `4a9ac079`)
    - [x] Add mandatory prompt: *"Will this application need to support multiple languages, international locales, right-to-left (RTL) scripts, or localized formatting now or in the future?"*
    - [x] Add stack-specific localization scaffolding catalog for Rust, Go, Python, C#, Swift, Kotlin, Flutter, and Web/TS
    - [x] Enforce localization macro wrapping for all user-facing strings from Day 1 when i18n is enabled
    - [x] Document single-language invariant in `superconductor/project.md` when disabled
- [x] Task: Codify Anti-Hero-Agent Protocol in `skills/implement/SKILL.md` and `skills/swarm-execute/SKILL.md` (FR-3, AC-3) [TIER-3] [AGENT:superconductor-processor] (commit: `4a9ac079`)
    - [x] Add `### Root Orchestration Dogma` section
    - [x] Strictly forbid direct product code file edits by the Root Agent in Swarm Execution
    - [x] Mandate delegation of all implementation and remediation phases to `superconductor-processor` subagents
- [x] Task: Codify UI Layer Hit-Testing Dogma in `skills/design-heuristics/SKILL.md` and `skills/superconductor-kernel-dogma/SKILL.md` (FR-7, AC-7) [TIER-3] [AGENT:superconductor-processor] (commit: `4a9ac079`)
    - [x] Add explicit pointer event / hit testing rules for overlay/floating interactive components across Web, Flutter, SwiftUI, Compose, Qt, and Game Engines
    - [x] Add requirement for automated E2E pointer/tap testing on interactive overlay elements
- [x] Task: Integrate Terminal Focus Notification Protocol in `skills/swarm-execute/SKILL.md` and `skills/implement/SKILL.md` (FR-8, AC-8) [TIER-2] [AGENT:superconductor-processor] (commit: `4a9ac079`)
    - [x] Add focus detection check (`check_focus_notify.sh`) before waiting states or concluding a track
    - [x] Document desktop notification fallback behaviors (`notify-send` / system alert)
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Setup Dogma & Swarm Guardrails' (Protocol in workflow.md)

---

## Phase 2: Modular Language Persona Skills Architecture [TIER-4]

- [ ] Task: Create persona directories under `skills/personas/` [TIER-1] [AGENT:superconductor-processor]
    - [ ] Create `skills/personas/rust-reviewer/`
    - [ ] Create `skills/personas/go-reviewer/`
    - [ ] Create `skills/personas/python-reviewer/`
    - [ ] Create `skills/personas/swift-reviewer/`
    - [ ] Create `skills/personas/typescript-reviewer/`
    - [ ] Create `skills/personas/cpp-reviewer/`
    - [ ] Create `skills/personas/csharp-reviewer/`
    - [ ] Create `skills/personas/kotlin-reviewer/`
    - [ ] Create `skills/personas/zig-reviewer/`
    - [ ] Create `skills/personas/ui-layout-reviewer/`
- [ ] Task: Author `skills/personas/rust-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define memory safety invariants, borrow checker patterns, unsafe block audit, zero-cost abstractions, Cargo clippy/audit rules
- [ ] Task: Author `skills/personas/go-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define goroutine lifecycle/leak prevention, `context.Context` propagation, error wrapping (`%w`), race detector invariants, table-driven tests
- [ ] Task: Author `skills/personas/python-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define GIL/async event loop starvation, strict mypy typing, pytest fixtures/mock hygiene, mutable default arguments, packaging isolation
- [ ] Task: Author `skills/personas/swift-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define ARC retain cycles (`[weak self]`), Swift Concurrency (`Sendable`, Actor isolation), SwiftUI view body purity, String catalogs (`.xcstrings`)
- [ ] Task: Author `skills/personas/typescript-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define strict type soundness, nullability safety, async promise error handling, DOM/SSR hydration safety, bundle tree-shaking
- [ ] Task: Author `skills/personas/cpp-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define RAII resource management, pointer arithmetic safety, ASan/UBSan sanitizers, smart pointers (`unique_ptr`/`shared_ptr`), move semantics
- [ ] Task: Author `skills/personas/csharp-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define `IDisposable` pattern, async/await deadlock prevention, LINQ allocation overhead, nullable reference types, thread safety
- [ ] Task: Author `skills/personas/kotlin-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define coroutine scope hierarchy, structured concurrency cancellation, platform types & nullability, Android/JVM performance, inline value classes
- [ ] Task: Author `skills/personas/zig-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define explicit allocator parameterization, comptime metaprogramming type verification, error set handling, undefined memory safety
- [ ] Task: Author `skills/personas/ui-layout-reviewer/SKILL.md` (FR-4, AC-4) [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define layer hit-testing/pointer events, viewport responsiveness, WCAG 2.1 AA accessibility & contrast, token contract adherence, touch target sizes
- [ ] Task: Update Skills Catalog & Extension Manifests (AC-10) [TIER-2] [AGENT:superconductor-processor]
    - [ ] Register all 10 persona skills in `skills/catalog.md`
    - [ ] Update `plugin.json` and `gemini-extension.json` with multi-language reviewer keywords and capabilities
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Modular Language Persona Skills Architecture' (Protocol in workflow.md)

---

## Phase 3: Dynamic Quorum Context Splicer Engine — TDD & Implementation [TIER-4]

- [ ] Task: Write unit tests for `LanguagePersonaResolver` in `packages/superconductor-core/src/swarm/__tests__/LanguagePersonaResolver.test.ts` (FR-5, AC-5, AC-9) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: Detect Rust from `Cargo.toml` and `tech-stack.md`
    - [ ] Test: Detect Go from `go.mod` and `tech-stack.md`
    - [ ] Test: Detect Python from `pyproject.toml`, `requirements.txt`, and `tech-stack.md`
    - [ ] Test: Detect Swift from `Package.swift` and `*.xcodeproj`
    - [ ] Test: Detect TypeScript from `package.json` and `tsconfig.json`
    - [ ] Test: Detect C++ from `CMakeLists.txt` and `Makefile`
    - [ ] Test: Detect C# from `*.csproj` and `*.sln`
    - [ ] Test: Detect Kotlin from `build.gradle.kts` and `build.gradle`
    - [ ] Test: Detect Zig from `build.zig`
    - [ ] Test: Detect UI Layout frameworks (React, SwiftUI, Compose, Flutter, Slint, Qt)
    - [ ] Test: Fallback to generic profile on unknown stack
    - [ ] Confirm tests fail (Red)
- [ ] Task: Implement `LanguagePersonaResolver` in `packages/superconductor-core/src/swarm/LanguagePersonaResolver.ts` (FR-5, AC-5) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Implement multi-language detection logic and UI layout framework detector
    - [ ] Run unit tests to confirm Green
- [ ] Task: Write unit tests for `DynamicQuorumContextSplicer` in `packages/superconductor-core/src/swarm/__tests__/DynamicQuorumContextSplicer.test.ts` (FR-6, AC-6, AC-9) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: Splicing Rust persona into Security and Correctness reviewer prompts
    - [ ] Test: Splicing Go persona into Correctness and Adversarial reviewer prompts
    - [ ] Test: Splicing UI Layout persona when UI files are modified
    - [ ] Test: Combining multiple personas for full-stack projects (e.g., Rust + UI Layout)
    - [ ] Test: Fallback behavior when persona skill file is missing
    - [ ] Confirm tests fail (Red)
- [ ] Task: Implement `DynamicQuorumContextSplicer` in `packages/superconductor-core/src/swarm/DynamicQuorumContextSplicer.ts` (FR-6, AC-6) [TIER-3] [AGENT:superconductor-processor]
    - [ ] Implement persona file loading, rubric extraction, and prompt injection logic
    - [ ] Export `DynamicQuorumContextSplicer` and `LanguagePersonaResolver` from `packages/superconductor-core/src/swarm/index.ts`
    - [ ] Run unit tests to confirm Green
- [ ] Task: Verify TypeScript build and package test suite passes cleanly [TIER-2] [AGENT:superconductor-processor]
    - [ ] Run `pnpm test` / `npm test` in `packages/superconductor-core`
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Dynamic Quorum Context Splicer Engine' (Protocol in workflow.md)

---

## Phase 4: Integration, Verification & Quorum Review [TIER-4]

- [ ] Task: Run full Acceptance Criteria verification checklist (AC-1 through AC-10) [TIER-2] [AGENT:superconductor-reviewer]
    - [ ] [ ] AC-1: Visual Language & Token Contract Gate verified in `skills/setup/` & `skills/grill/`
    - [ ] [ ] AC-2: Multilingual / i18n Discovery Gate verified in `skills/setup/`, `skills/to-spec/`, `skills/grill/`
    - [ ] [ ] AC-3: Anti-Hero-Agent Protocol verified in `skills/implement/` & `skills/swarm-execute/`
    - [ ] [ ] AC-4: All 10 persona skills exist under `skills/personas/` with comprehensive rubrics
    - [ ] [ ] AC-5: `LanguagePersonaResolver` verified with tests for all 9 languages + UI frameworks
    - [ ] [ ] AC-6: `DynamicQuorumContextSplicer` verified with prompt injection tests
    - [ ] [ ] AC-7: UI Layer Hit-Testing Dogma verified in `skills/design-heuristics/` & kernel dogma
    - [ ] [ ] AC-8: Terminal Focus Notification Protocol verified in `skills/swarm-execute/` & `skills/implement/`
    - [ ] [ ] AC-9: Core test suite passes 100% in `packages/superconductor-core`
    - [ ] [ ] AC-10: Skills catalog & extension manifests updated
- [ ] Task: Execute 4-Reviewer Quorum Review (Security, Correctness, Adversarial, Regression) [TIER-4] [AGENT:superconductor-reviewer]
- [ ] Task: Oracle Tier-4 Architectural Sign-off and cryptographic verification [TIER-4] [AGENT:superconductor-oracle]
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Integration & Quorum Review' (Protocol in workflow.md)

---

## Swarm Blueprint

```json
{
  "track_id": "multi_language_persona_architecture_20260820",
  "cost_summary": "~0.35M tokens · ~$0.028 at Flash-Lite rates",
  "waves": 4,
  "oracle_cadence": 8,
  "source": "multi-language-persona-scaffold",
  "wave_map": [
    { "wave": 1, "phases": ["Phase 0", "Phase 1"], "agents": ["processor", "reviewer"] },
    { "wave": 2, "phases": ["Phase 2"], "agents": ["dreamer", "processor", "reviewer x2"] },
    { "wave": 3, "phases": ["Phase 3"], "agents": ["processor x2", "reviewer"] },
    { "wave": 4, "phases": ["Phase 4"], "agents": ["reviewer x4", "oracle"] }
  ]
}
```
