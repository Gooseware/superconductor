# Implementation Plan: Swarm Excellence Engine

## Phase 0: Swarm Preflight

- [ ] Task: Verify environment readiness and skill availability [TIER-1] [AGENT:caduceus-oracle]
    - [ ] Check `swarm-orchestrate` skill loading and subagent tool registrations
    - [ ] Verify test runner and build tools environment setup
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Skill Standardisation & Marketplace Alignment

- [ ] Task: Audit and refactor all existing Superconductor skills for 500-line compliance [TIER-2] [AGENT:caduceus-processor]
    - [ ] Write failing unit test verifying SKILL.md line count validator
    - [ ] Enforce < 500 lines constraint across `skills/*/SKILL.md`
    - [ ] Move oversized documentation sections to `references/` auxiliary files
- [ ] Task: Implement `skill-rules.json` intent trigger schema and validator [TIER-2] [AGENT:caduceus-processor]
    - [ ] Create JSON schema for skill triggers (keywords, regex patterns, file globs)
    - [ ] Add `skill-rules.json` to all core Superconductor skills
    - [ ] Implement trigger parser in skill discovery engine
- [ ] Task: Implement LobeHub / SkillsMP frontmatter metadata parser [TIER-3] [AGENT:caduceus-processor]
    - [ ] Support LobeHub YAML frontmatter metadata fields
    - [ ] Write unit tests for frontmatter parsing and validation
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Skill Standardisation' (Protocol in workflow.md)

---

## Phase 2: Pre-Computed Symbol Indexing & AST Context Builder

- [ ] Task: Upgrade `packages/engine/src/context/builder.ts` for AST/LSP symbol queries [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test for AST symbol call-graph context extraction
    - [ ] Implement LSP/repowise query integration (`find_definition`, `find_references`)
    - [ ] Verify context window savings vs full file dumping
- [ ] Task: Implement Diff-Only Payload Generator for Reviewer subagent turns [TIER-3] [AGENT:caduceus-processor]
    - [ ] Create diff extraction utility producing concise line-level diffs
    - [ ] Inject target symbol definitions alongside diff payload (~1-5k tokens)
- [ ] Task: Integrate prompt and tool schema caching via CacheManager [TIER-2] [AGENT:caduceus-processor]
    - [ ] Wire `CacheManager` payload processing into engine task dispatcher
    - [ ] Verify token budget savings on multi-turn conversations
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Pre-Computed Symbol Indexing' (Protocol in workflow.md)

---

## Phase 3: Stateful Engine & Asymmetric Refinement Loop

- [ ] Task: Extend `packages/engine/src/engine.ts` with state persistence graph [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing test for state graph tracking `iteration_count`, `execution_errors`, and `review_comments`
    - [ ] Implement atomic state serialization and state transition handlers
- [ ] Task: Enforce read-only tool surface isolation for Code Reviewer subagents [TIER-3] [AGENT:caduceus-processor]
    - [ ] Implement tool filter interceptor stripping file write tools for Reviewer persona
    - [ ] Verify security boundary compliance with automated test
- [ ] Task: Implement automated Git checkpointing, circuit breaker, and rollback [TIER-3] [AGENT:caduceus-processor]
    - [ ] Add automated Git stash/commit before refinement loop execution
    - [ ] Implement circuit breaker halting execution and triggering rollback when `iteration_count >= 3`
- [ ] Task: Connect EscalationRouter to dynamic model tier switching [TIER-3] [AGENT:caduceus-processor]
    - [ ] Update `EscalationRouter` to escalate task execution from Tier 3 to Tier 4 models on review failure
    - [ ] Verify model tier escalation flow end-to-end
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Stateful Engine' (Protocol in workflow.md)

---

## Phase 4: Progressive Definition of Done (DoD) & Tabula Rasa Quality Gate

- [ ] Task: Create 4-Tier Progressive Definition of Done (DoD) checklist validator [TIER-3] [AGENT:caduceus-processor]
    - [ ] Write failing tests for DoD Level 1 through Level 4 requirement checks
    - [ ] Implement DoD checklist parser and validation engine
- [ ] Task: Build isolated "Tabula Rasa" clean-slate verification runner [TIER-4] [AGENT:caduceus-oracle]
    - [ ] Create isolated workspace compilation and test runner subagent
    - [ ] Execute Level 4 tabula rasa check prior to Oracle track approval
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Progressive Definition of Done' (Protocol in workflow.md)

---

## Phase 5: Integration & Finalization

- [ ] Task: Integrate track 'swarm_excellence_20260722' into main branch [TIER-3] [AGENT:caduceus-processor]
    - [ ] Run full test suite and build checks across all packages
    - [ ] Merge track branch `track/swarm_excellence_20260722` into `main`
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Integration & Finalization' (Protocol in workflow.md)
