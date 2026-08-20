# Implementation Plan: Agent Write Tools Audit & Repair

## Track ID: `agent_write_tools_20260726`

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify `swarm-orchestrate` skill is active and loaded [TIER-1] [AGENT:superconductor-dreamer]
- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md)

---

## Phase 1: Audit & Inventory

- [ ] Task: Audit all 9 plugin-canonical agent manifests in `~/.gemini/config/plugins/superconductor/agents/` and compare tool lists against the working `*-rw` reference agents [TIER-2] [AGENT:superconductor-dreamer]
    - [ ] Identify all agents missing explicit write/run tools
    - [ ] Produce an audit table: agent name → missing tools → required fix
    - [ ] Determine correct tool scope per agent role (Processor=full, Dreamer=write+run, Oracle=read+run, Reviewers=read-only)
- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Audit & Inventory' (Protocol in workflow.md)

---

## Phase 2: Regression Test Suite

- [x] Task: Write regression tests for agent manifest correctness [TIER-3] [AGENT:superconductor-processor]
    - [x] Create `packages/superconductor-core/tests/agents/agent-manifest-audit.test.ts`
    - [x] Parse YAML frontmatter of each agent manifest file
    - [x] Assert required tools are present per role
    - [x] Assert manifests have no YAML parse errors
    - [x] Ensure tests FAIL before the fix is applied (Red phase)
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Regression Test Suite' (Protocol in workflow.md)

---

## Phase 3: Apply Fixes to Agent Manifests

- [x] Task: Fix `superconductor-processor/agent.md` — add full explicit tool list [TIER-2] [AGENT:superconductor-processor]
    - [x] Add: `find_by_name`, `grep_search`, `view_file`, `list_dir`, `read_url_content`, `search_web`, `schedule`, `generate_image`, `multi_replace_file_content`, `replace_file_content`, `write_to_file`, `run_command`, `manage_task`
    - [x] Retain: `enable_write_tools: true` as belt-and-suspenders
    - [x] Retain existing `name`, `description` fields
- [x] Task: Fix `superconductor-dreamer/agent.md` — add write + run tools [TIER-2] [AGENT:superconductor-processor]
    - [x] Add: `find_by_name`, `grep_search`, `view_file`, `list_dir`, `read_url_content`, `search_web`, `multi_replace_file_content`, `replace_file_content`, `write_to_file`, `run_command`, `manage_task`
    - [x] Retain: `enable_write_tools: true`
- [x] Task: Fix `superconductor-oracle/agent.md` — add read + run tools [TIER-2] [AGENT:superconductor-processor]
    - [x] Add: `find_by_name`, `grep_search`, `view_file`, `list_dir`, `read_url_content`, `search_web`, `run_command`, `manage_task`, `ask_question`
    - [x] Retain: `enable_write_tools: true`
    - [x] Do NOT add `write_to_file` (Oracle is analysis-only; output via `send_message`)
- [x] Task: Fix `remediation-processor/agent.md` — add missing `run_command` [TIER-2] [AGENT:superconductor-processor]
    - [x] Add: `run_command` to the existing explicit list (already has write tools)
    - [x] Retain all existing tools
- [x] Task: Verify reviewer agents (security, correctness, adversarial, regression) are correctly read-only — no changes required, just confirm [TIER-2] [AGENT:superconductor-processor]
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Apply Fixes to Agent Manifests' (Protocol in workflow.md)

---

## Phase 4: Verify Green

- [x] Task: Run regression tests — assert all manifest tests now pass (Green phase) [TIER-3] [AGENT:superconductor-processor]
    - [x] Run `npx vitest run tests/agents/agent-manifest-audit.test.ts`
    - [x] Confirm 334+ existing tests still pass: `CI=true npm test`
- [x] Task: Superconductor - User Manual Verification 'Phase 4: Verify Green' (Protocol in workflow.md)

---

## Phase 5: Integration & Finalization

- [x] Task: Integrate track 'agent_write_tools_20260726' into main branch. [TIER-2] [AGENT:superconductor-processor]
