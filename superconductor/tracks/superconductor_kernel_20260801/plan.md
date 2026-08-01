# Plan: Superconductor Kernel

**Track ID:** `superconductor_kernel_20260801`  
**Spec:** [spec.md](./spec.md)  
**Branch:** `track/superconductor_kernel_20260801`

---

## Orchestration Protocol

### Circuit Breaker — Level 2 Oracle Escalation (Self-Healing)

When `MAX_QUORUM_LOOPS` (3) is exceeded for any phase, the orchestrator **MUST NOT** pause and wait for human input. Instead:

1. **Synthesize failure history**: collect all findings across all 3 loops, identify the repeating root cause pattern
2. **Dispatch Oracle** (`superconductor-oracle`, Pro model) with: all 3 loops of findings, root cause pattern, exact failing files, and phase DEFINITION_OF_DONE. Instruction: "Do a direct surgical fix. Do NOT repeat any approach tried in loops 1–3. Show exact command output as evidence before claiming done."
3. **Run one final Quorum** on Oracle's output — this Quorum has a fresh loop counter of MAX 1
4. **If Oracle Quorum → `APPROVED`**: continue to next phase, reset all counters
5. **If Oracle Quorum → `NEEDS FIXES`**: ONLY NOW escalate to human with full failure summary (all 3 loop findings + Oracle finding + everything tried)

**Escalation levels:**
- Loops 1–3: Processor → Quorum → Remediator (standard)
- Loop 4 (Level 2): Oracle direct fix → single Quorum pass
- Loop 5: Human escalation

---



- [ ] Task: Verify swarm-orchestrate skill is installed and loaded [TIER-1] [AGENT:superconductor-processor]
    - [ ] Confirm `~/.gemini/config/skills/swarm-orchestrate/SKILL.md` exists
    - [ ] Confirm `uv` is on PATH (`uv --version`)
    - [ ] Confirm `python3 --version` ≥ 3.10
    - [ ] Confirm `graphify --version` OR `uv tool install graphifyy` succeeds
    - [ ] Create track branch: `git checkout -b track/superconductor_kernel_20260801`
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Package Rename — design-os-kernel → superconductor-kernel

- [ ] Task: Write rename codemod script [TIER-2] [AGENT:superconductor-processor]
    - [ ] Create `scripts/rename-kernel.ts` that:
        - Renames `packages/design-os-kernel/` → `packages/superconductor-kernel/`
        - Updates `package.json` name → `@superconductor/kernel`, version → `2.0.0`
        - Replaces all `@design-os/mcp-server` and `design-os-kernel` references in `mcp_config.json`, GEMINI.md, `~/.gemini/config/plugins/**/*.md` skill files
        - Is idempotent (running twice produces no diff)
    - [ ] Script is committed but NOT yet executed
- [ ] Task: Execute rename codemod and verify [TIER-2] [AGENT:superconductor-processor]
    - [ ] Run `npx -y tsx scripts/rename-kernel.ts`
    - [ ] Verify `packages/superconductor-kernel/` exists; `packages/design-os-kernel/` does not
    - [ ] Verify zero remaining `grep` matches for `design-os-kernel` or `@design-os/mcp-server` in tracked files
    - [ ] Update `package.json` `workspaces` array if needed
- [ ] Task: Build and smoke-test renamed kernel [TIER-2] [AGENT:superconductor-processor]
    - [ ] Run `cd packages/superconductor-kernel && npm run build`
    - [ ] Verify all 14 Design OS MCP tools still listed in built `dist/index.js`
    - [ ] Run existing kernel tests
    - [ ] Commit: `feat(kernel): rename design-os-kernel to superconductor-kernel`
- [ ] Task: Security review of rename blast radius [TIER-3] [AGENT:superconductor-reviewer]
    - [ ] Verify no dangling references in active tracks, plan files, or skill invocations
    - [ ] Verify `mcp_config.json` server identifier is `superconductor-kernel`
    - [ ] Verify CI workflow still references correct package paths
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Package Rename' (Protocol in workflow.md)

---

## Phase 2: Graphify Intelligence Integration

- [ ] Task: Add Graphify to tool registry and pipeline [TIER-2] [AGENT:superconductor-processor]
    - [ ] Add `graphify` to `tool-registry.ts` discovery (check `graphify --version`)
    - [ ] Add `PHASE_INVALIDATION` regex for `p9_graphify` in `incremental-updater.ts`
    - [ ] Create `runners/graphify.ts`: invokes `graphify .` as subprocess, validates output, copies to `superconductor/intelligence/09_graphify_graph.json`
    - [ ] Register `p9_graphify` phase in `pipeline.ts` after `p8_dependency_surface`
    - [ ] Handle graceful degradation: if `graphify` not installed, skip phase and log warning (do NOT crash)
- [ ] Task: Write failing tests for Graphify runner [TIER-2] [AGENT:superconductor-processor]
    - [ ] Test: `p9_graphify` writes `09_graphify_graph.json` with valid schema
    - [ ] Test: Phase is skipped gracefully if `graphify` binary absent
    - [ ] Test: Incremental mode calls `graphify --update` instead of full scan
- [ ] Task: Replace naive domain partitioner with Leiden communities [TIER-3] [AGENT:superconductor-processor]
    - [ ] Update `domain-partitioner.ts` to read Leiden community clusters from `09_graphify_graph.json`
    - [ ] Map Graphify community IDs → `DomainPartition` objects (id, files, hotspotScore, coverageGapPercent)
    - [ ] Fallback to directory-split if `09_graphify_graph.json` absent
    - [ ] Update `task-complexity-scorer.ts`: use node centrality scores for `crossCuttingRisk` dimension
- [ ] Task: Write failing tests for partitioner [TIER-2] [AGENT:superconductor-processor]
    - [ ] Test: Leiden community data produces correct `DomainPartition` objects
    - [ ] Test: Fallback to directory-split when graph absent
    - [ ] Test: TCS `crossCuttingRisk` is higher for high-centrality nodes
- [ ] Task: Correctness review of Graphify integration [TIER-3] [AGENT:superconductor-reviewer]
    - [ ] Verify `09_graphify_graph.json` schema matches Graphify output format
    - [ ] Verify no regression in existing intelligence phases
    - [ ] Verify incremental mode works correctly
- [ ] Task: Superconductor - User Manual Verification 'Phase 2: Graphify Integration' (Protocol in workflow.md)

---

## Phase 3: Kernel Graph MCP Tools

- [ ] Task: Implement graph query MCP tools in superconductor-kernel [TIER-3] [AGENT:superconductor-processor]
    - [ ] Add `GraphCache` class to kernel: loads `09_graphify_graph.json`, provides in-memory index
    - [ ] Implement `kernel_graph_get_node(node_id)` MCP tool
    - [ ] Implement `kernel_graph_get_neighbors(node_id, max_depth)` MCP tool
    - [ ] Implement `kernel_graph_shortest_path(source, target)` MCP tool
    - [ ] Implement `kernel_intelligence_get_hotspots(metric)` MCP tool
    - [ ] Implement `kernel_intelligence_get_dependency_graph(community_id)` MCP tool
    - [ ] Implement `kernel_policy_get_mode()` MCP tool (returns current IDLE/TRACKED/YOLO)
- [ ] Task: Write tests for new MCP tools [TIER-2] [AGENT:superconductor-processor]
    - [ ] Unit tests for each tool with mock `09_graphify_graph.json`
    - [ ] Integration test: kernel starts, `kernel_graph_get_node` returns correct data
    - [ ] Test: `kernel_policy_get_mode()` returns correct state from `TrackStateManager`
- [ ] Task: Security review of MCP tool surface [TIER-4] [AGENT:superconductor-reviewer]
    - [ ] Verify no path traversal via `node_id` parameters
    - [ ] Verify `kernel_graph_get_neighbors` depth is bounded (max_depth ≤ 10)
    - [ ] Verify `kernel_policy_get_mode()` is read-only (cannot mutate state)
- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Kernel Graph MCP Tools' (Protocol in workflow.md)

---

## Phase 4: Quorum FSM (absorbs scripted_swarm_orchestrator)

- [ ] Task: Design and implement Quorum FSM in quorum-review.ts [TIER-4] [AGENT:superconductor-dreamer]
    - [ ] Define FSM states: `IDLE | REVIEW_PENDING | ANALYSIS | REMEDIATION_REQUIRED | APPROVED | FAILED | REQUIRES_HUMAN_INTERVENTION`
    - [ ] Implement state transitions as explicit switch-case (no implicit jumps)
    - [ ] Implement `MAX_QUORUM_LOOPS = 3` circuit breaker
    - [ ] Implement finding deduplication check (reject finding if matches previous loop verbatim)
    - [ ] Persist FSM state atomically to `superconductor/logs/quorum-state.json` (write-tmp → rename)
- [ ] Task: Implement parallel reviewer dispatch [TIER-3] [AGENT:superconductor-processor]
    - [ ] Dispatch Security, Correctness, Adversarial reviewers via `invoke_subagent` in parallel (not sequential)
    - [ ] Collect `APPROVED` / `NEEDS FIXES` responses from all reviewers
    - [ ] Transition to `REMEDIATION_REQUIRED` if ANY reviewer returns `NEEDS FIXES`
    - [ ] Transition to `APPROVED` only when ALL reviewers return `APPROVED`
- [ ] Task: Implement LanguageAdapter — language-agnostic project inspector [TIER-3] [AGENT:superconductor-processor]
    - [ ] Create `packages/superconductor-core/src/swarm/LanguageAdapter.ts`
    - [ ] `LanguageAdapter.detect(projectRoot, techStack)` → returns `LanguageProfile` by reading `tech-stack.md` first, then falling back to manifest detection
    - [ ] `LanguageProfile` interface contains:
        - `language`: `'typescript' | 'python' | 'go' | 'rust' | 'java' | 'unknown'`
        - `testCommand`: e.g. `npm test`, `pytest`, `go test ./...`, `cargo test`, `mvn test`
        - `manifestFiles`: e.g. `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`
        - `generatedDirs`: e.g. `dist/`, `__pycache__/`, `target/`, `.venv/`, `build/`
        - `testTheatreAntiPatterns`: language-specific fake-test signatures (TS: `echo`/`exit 0`; Python: empty `def test_*(): pass`; Go: `t.Skip()`-only tests; Rust: `todo!()` bodies)
        - `siblingsWithTests(root)`: finds sibling packages/modules that have real tests as `PATTERN` examples
    - [ ] Manifest detection priority order: `tech-stack.md` declaration → `package.json` → `pyproject.toml` → `go.mod` → `Cargo.toml`
    - [ ] Write unit tests: TS project → `npm test`, `node_modules/` excluded; Python project → `pytest`, `__pycache__/` excluded; unknown project → graceful fallback with explicit warning in prompt
- [ ] Task: Implement RemediatorPromptBuilder using LanguageAdapter [TIER-4] [AGENT:superconductor-processor]
    - [ ] Create `packages/superconductor-core/src/swarm/RemediatorPromptBuilder.ts`
    - [ ] Builder accepts `QuorumFinding[]` + `RepoContext` + `TrackState` → calls `LanguageAdapter.detect()` first → produces `RemediatorPrompt` per finding domain
    - [ ] Each `RemediatorPrompt` MUST include all 7 fields, all language-aware:
        - `TASK`: specific action from `finding.recommendation`
        - `SCOPE`: explicit file globs the remediator may touch (from finding `file` + sibling sources)
        - `EXCLUDED`: always includes `plan.md`, `spec.md`, `archive/` + language-specific generated dirs from `LanguageProfile.generatedDirs`
        - `PATTERN`: correct-solution example from `LanguageProfile.siblingsWithTests()` — never hardcoded
        - `ANTI_PATTERNS`: `LanguageProfile.testTheatreAntiPatterns` + category-keyed entries from `anti-patterns.ts`
        - `EVIDENCE_REQUIRED`: uses `LanguageProfile.testCommand` — never hardcodes `npm test`
        - `DEFINITION_OF_DONE`: objective criteria using the language's test output format
    - [ ] `anti-patterns.ts`: static registry keyed by `(language, findingCategory)` — e.g. `('python', 'adversarial')` → `["Do NOT use empty test bodies (def test_x(): pass)", "Do NOT use pytest.skip() as sole test body"]`
    - [ ] Write unit tests:
        - TS test-theatre finding → ANTI_PATTERNS contains `echo`/`exit 0`; EVIDENCE uses `npm test`
        - Python test-theatre finding → ANTI_PATTERNS contains `pass` body prohibition; EVIDENCE uses `pytest`
        - Go naming finding → EXCLUDED contains `__pycache__/` is absent, `vendor/` is present; EVIDENCE uses `go test ./...`
        - Unknown language → prompt includes explicit warning: `"Language could not be detected from tech-stack.md. Verify test command manually before claiming done."`

- [x] Task: Implement parallel remediator dispatch using RemediatorPromptBuilder [TIER-3] [AGENT:superconductor-processor]
    - [ ] Group findings by domain (file prefix + category)
    - [ ] Run each finding group through `RemediatorPromptBuilder.build()` BEFORE dispatching
    - [ ] Dispatch ONE remediator per domain group in parallel, passing the structured `RemediatorPrompt` (NOT the raw finding)
    - [ ] Remediator receives the full 7-field prompt — never raw Quorum text
    - [ ] Wait for all remediators to complete before re-entering `REVIEW_PENDING`
- [x] Task: Implement escalation and human intervention state [TIER-2] [AGENT:superconductor-processor]
    - [ ] On `MAX_QUORUM_LOOPS` exceeded: write `REQUIRES_HUMAN_INTERVENTION` to `quorum-state.json`
    - [ ] Emit clear user-facing message with loop history and unresolved findings
    - [ ] Halt FSM — do NOT continue looping
- [x] Task: Write FSM tests [TIER-3] [AGENT:superconductor-processor]
    - [ ] Test: FSM transitions through full happy path to `APPROVED`
    - [ ] Test: FSM halts at `REQUIRES_HUMAN_INTERVENTION` after 3 loops
    - [ ] Test: Duplicate finding from previous loop is rejected (reviewer forced to acknowledge)
    - [ ] Test: State file is written atomically (simulated crash during write)
    - [ ] Test: Reviewers dispatched in parallel (not sequential)
- [x] Task: Archive scripted_swarm_orchestrator track [TIER-1] [AGENT:superconductor-processor]
    - [ ] Move `superconductor/tracks/scripted_swarm_orchestrator` → `superconductor/tracks/archive/`
    - [ ] Note in archive metadata that scope was absorbed into `superconductor_kernel_20260801`
- [ ] Task: Adversarial review of Quorum FSM [TIER-4] [AGENT:superconductor-reviewer]
    - [ ] Verify no path to `APPROVED` without all reviewers explicitly returning it
    - [ ] Verify circuit breaker cannot be bypassed by reviewer outputting `APPROVED` mid-loop
    - [ ] Verify deduplication check cannot be gamed by minor rephrasing of same finding
- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Quorum FSM' (Protocol in workflow.md)

---

## Phase 5: Audit Log Hardening

- [ ] Task: Harden YoloAuditLogger with application-level append-only enforcement [TIER-2] [AGENT:superconductor-processor]
    - [ ] Update `audit.ts`: replace file write with `fs.appendFile` exclusively
    - [ ] Add `init()` method: set file mode `0o600`, crash with descriptive error if permissions cannot be enforced
    - [ ] Add startup validation: read file stats, crash if `mode & 0o077` (group/other writable)
    - [ ] Interceptor regex guards remain as defense-in-depth but NOT as primary protection
- [ ] Task: Write audit log tests [TIER-2] [AGENT:superconductor-processor]
    - [ ] Test: `init()` crashes if file is writable by others
    - [ ] Test: Multiple appends produce correct append-only log (no overwrites)
    - [ ] Test: Startup error message is descriptive and actionable
- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Audit Log Hardening' (Protocol in workflow.md)

---

## Phase 6: SWARM GUARDRAIL Enforcement

- [ ] Task: Enforce SWARM GUARDRAIL in PolicyEngine [TIER-3] [AGENT:superconductor-processor]
    - [ ] Add rule to `engine.ts`: in TRACKED mode, block `write_file`, `replace_file_content`, `multi_replace_file_content` targeting `packages/*/src/**`
    - [ ] Block emits: `"[Superconductor] Rogue write attempt detected. Aborting. I must dispatch a Processor subagent instead."`
    - [ ] Rule is bypassed in YOLO mode (with audit log entry)
    - [ ] Rule is not active in IDLE mode
- [ ] Task: Write SWARM GUARDRAIL tests [TIER-2] [AGENT:superconductor-processor]
    - [ ] Test: Root agent write to `packages/superconductor-kernel/src/index.ts` in TRACKED mode is blocked
    - [ ] Test: Same write is allowed in YOLO mode (with audit entry)
    - [ ] Test: Same write is allowed in IDLE mode
    - [ ] Test: Write to `packages/superconductor-kernel/test/` (not `src/`) is allowed in TRACKED mode
- [ ] Task: Security review of GUARDRAIL implementation [TIER-4] [AGENT:superconductor-reviewer]
    - [ ] Verify glob pattern `packages/*/src/**` cannot be bypassed via symlinks or relative path traversal
    - [ ] Verify YOLO audit entry is written before allowing the bypassed call
    - [ ] Verify the error message matches the exact string in GEMINI.md
- [ ] Task: Superconductor - User Manual Verification 'Phase 6: SWARM GUARDRAIL Enforcement' (Protocol in workflow.md)

---

## Phase 7: Integration & Finalization

- [ ] Task: Full test suite verification [TIER-2] [AGENT:superconductor-processor]
    - [ ] Run `cd packages/superconductor-kernel && npm run build && npm test`
    - [ ] Run `cd packages/superconductor-core && npm run build && npm test`
    - [ ] Verify test count ≥ 438 (new tests added in this track)
    - [ ] Verify zero references to `design-os-kernel` or `@design-os/mcp-server` in tracked files
- [ ] Task: Update documentation [TIER-2] [AGENT:superconductor-processor]
    - [ ] Update GEMINI.md SWARM GUARDRAILS section with new kernel tool names and quorum FSM state reference
    - [ ] Update `superconductor/agent-config.md` with new MCP tool inventory
    - [ ] Update `docs/permissions.md` with SWARM GUARDRAIL enforcement details
- [ ] Task: Final quorum review [TIER-4] [AGENT:superconductor-reviewer]
    - [ ] Security: verify all AC items are met
    - [ ] Correctness: verify no phantom implementations
    - [ ] Adversarial: verify test theatre is absent
    - [ ] Regression: verify no Design OS tools were accidentally broken
- [ ] Task: Integrate track 'superconductor_kernel_20260801' into main branch [TIER-1] [AGENT:superconductor-processor]
    - [ ] Merge `track/superconductor_kernel_20260801` → `main` (after quorum approval)
    - [ ] Tag release: `v2.0.0-kernel`
- [ ] Task: Superconductor - User Manual Verification 'Phase 7: Integration & Finalization' (Protocol in workflow.md)

---

## Swarm Blueprint

```json
{
  "track_id": "superconductor_kernel_20260801",
  "estimated_waves": 7,
  "phases": [
    { "phase": 0, "name": "Swarm Preflight", "wave": 1, "agents": ["processor"], "tier": "TIER-1" },
    { "phase": 1, "name": "Package Rename", "wave": 2, "agents": ["processor", "processor", "processor", "reviewer"], "tier": "TIER-2/3", "parallel": true },
    { "phase": 2, "name": "Graphify Integration", "wave": 3, "agents": ["processor", "processor", "processor", "processor", "reviewer"], "tier": "TIER-2/3", "parallel": true },
    { "phase": 3, "name": "Kernel Graph MCP Tools", "wave": 4, "agents": ["processor", "processor", "reviewer"], "tier": "TIER-3/4", "parallel": true },
    { "phase": 4, "name": "Quorum FSM", "wave": 5, "agents": ["dreamer", "processor", "processor", "processor", "processor", "reviewer"], "tier": "TIER-3/4", "parallel": true },
    { "phase": 5, "name": "Audit Log Hardening", "wave": 6, "agents": ["processor", "processor"], "tier": "TIER-2", "parallel": true },
    { "phase": 6, "name": "SWARM GUARDRAIL", "wave": 6, "agents": ["processor", "processor", "reviewer"], "tier": "TIER-3/4", "parallel": true },
    { "phase": 7, "name": "Integration & Finalization", "wave": 7, "agents": ["processor", "processor", "reviewer"], "tier": "TIER-1/4" }
  ],
  "circuit_breakers": {
    "max_quorum_loops": 3,
    "max_processor_retries": 2
  }
}
```
