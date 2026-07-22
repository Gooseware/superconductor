# Specification: Swarm Excellence Engine
## Asymmetric Refinement, Token Budgeting & Progressive Quality Gates

## 1. Overview

This track implements the transformation blueprint defined in `WORKFLOW_EXCELLENCE_BLUEPRINT.md` and `deep_research.md` ("Architectural Optimization of Autonomous Software Engineering Swarms"). 

The core goal is to elevate Superconductor into a production-grade autonomous software engineering framework that reliably produces zero-defect code on an optimized token budget.

Key Objectives:
1. **500-Line Skill Progressive Disclosure**: Enforce strict 500-line limits across all skill specifications (`SKILL.md`) and introduce `skill-rules.json` intent triggers for dynamic loading.
2. **Pre-Computed Symbol Indexing & AST Context Builder**: Upgrade `packages/engine/src/context/builder.ts` to query AST call-graphs (`repowise`, `cclsp`) and pass diff-only payloads (~1-5k tokens) to Reviewer agents instead of dumping full file contents into LLM context windows.
3. **Stateful Asymmetric Refinement Engine**: Enhance `packages/engine/src/engine.ts` with explicit Pydantic/TypeScript state serialization (`iteration_count`, `execution_errors`, `review_comments`), strict read-only tool isolation for Reviewers, and automated Git stash/rollback when `iteration_count >= 3`.
4. **Dynamic 4-Tier Model Cascade & Escalation Router**: Wire `EscalationRouter` directly to subagent model tier switching (Tier 1: Scripts/Linters, Tier 2: Fast Triage, Tier 3: Standard Codegen, Tier 4: Frontier Reasoning) based on failure signals and blast radius.
5. **Progressive Definition of Done (DoD) & Tabula Rasa Gate**: Build a 4-tier DoD checklist validator scaling from basic compilation (Level 1) to clean-slate "Tabula Rasa" verification (Level 4).

---

## 2. Research Notes

- **Asymmetric Refinement Loops**: Read-only validation prevents review agents from introducing unverified edits to pass their own checks. Multi-agent state isolation is essential for fault containment.
- **AST / LSP Proxying vs. Context Stuffing**: Injecting raw repository files rapidly exhausts token budgets and degrades reasoning quality. Querying pre-computed symbol graphs (`find_definition`, `find_references`) reduces context overhead by up to 90%.
- **Skill Progressive Disclosure**: Keeping core instruction files under 500 lines and offloading deep references to auxiliary files prevents prompt bloat while allowing on-demand retrieval.
- **Progressive Definition of Done**: Hardcoding static, complex quality gates for simple tasks causes unnecessary latency. Dynamic gating based on task scope optimizes velocity and safety.

---

## 3. Architecture Committee Report

### Dreamer's Structural Vision
- Modernize `packages/engine` to expose a event-driven execution state graph.
- Implement AST symbol context proxying within `ContextBuilder` so agents inspect symbol definitions dynamically.
- Enforce LobeHub / SkillsMP standards for skill metadata and trigger definitions.
- Implement isolated "Tabula Rasa" subagent environment for Level 4 release validation.

### Reviewer's Hardening Requirements
- **Read-Only Enforcement**: Code Review Agent must strictly lack filesystem write tools during review turns.
- **Circuit Breaker Ceiling**: Hard limit of 3 review loop iterations before rolling back working tree changes and escalating to Tier 4 reasoning models.
- **Atomic File State**: All cache updates and state persistence must use atomic write-then-rename patterns.
- **Graceful Failure**: Fall back to standard diff inspection if LSP server is offline.

---

## 4. Functional Requirements

### 4.1 Skill Modularization & Trigger Engine
- **FR1**: All `skills/*/SKILL.md` files must comply with the 500-line limit.
- **FR2**: Each skill directory must contain a valid `skill-rules.json` defining activation triggers (keywords, file globs, regex patterns).
- **FR3**: The engine must dynamically load skill context based on active task triggers.

### 4.2 AST Symbol Context Builder & Token Optimization
- **FR4**: `ContextBuilder` must interface with LSP/AST servers (`cclsp`, `repowise`) to return targeted symbol snippets instead of raw file dumps.
- **FR5**: `Reviewer` subagent payloads must contain strictly `git diff` outputs + target symbol definitions.
- **FR6**: System prompts and tool definitions must be processed via `CacheManager` to eliminate redundant prompt processing fees.

### 4.3 Stateful Engine & Asymmetric Refinement Loop
- **FR7**: `Engine` state must track `iteration_count`, `execution_errors`, `review_comments`, and active subagent assignments.
- **FR8**: Reviewer agents must operate under a read-only tool surface.
- **FR9**: Reaching 3 failed review iterations must trigger `StormController` lock release, git stash/rollback to pre-task commit, and model tier escalation.

### 4.4 4-Tier Progressive Definition of Done Gate
- **FR10**: Enforce Level 1 (compilation/style), Level 2 (>80% unit test coverage), Level 3 (security/migrations), and Level 4 ("Tabula Rasa" clean-slate verification) gates dynamically based on task classification.

---

## 5. Non-Functional Requirements
- **NFR1 (Performance)**: Pre-task context assembly must complete within 200ms using cached symbol indices.
- **NFR2 (Security)**: Sandboxed subagent execution must prevent unauthorized filesystem access outside the target workspace.
- **NFR3 (Maintainability)**: Engine modifications must maintain full backward compatibility with existing Superconductor tracks.

---

## 6. Acceptance Criteria
- [ ] All Superconductor skills conform to the 500-line SKILL.md rule.
- [ ] ContextBuilder generates token-optimized payloads using symbol call-graphs and git diffs.
- [ ] Read-only tool isolation for Reviewer subagents is verified in unit tests.
- [ ] Automatic rollback and model escalation occurs after 3 review loop failures.
- [ ] Level 4 "Tabula Rasa" verification succeeds on test tracks before track finalization.

---

## 7. Out of Scope
- Direct modification of external MCP server binaries (integrates via standard MCP protocols).
- Support for non-Git version control systems.
