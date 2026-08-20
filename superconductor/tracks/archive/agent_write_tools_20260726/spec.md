# Spec: Agent Write Tools Audit & Repair

## Track ID: `agent_write_tools_20260726`

## Overview

During swarm execution, coding agents (`superconductor-processor`, `superconductor-dreamer`,
`superconductor-oracle`, and `remediation-processor`) failed to write files or execute commands
because their plugin `agent.md` manifests do **not** explicitly enumerate disk-write and
command-run tools in the `tools:` list.

Instead, they use only `enable_write_tools: true` plus `send_message`. The `enable_write_tools`
flag is a shorthand for the agent runtime, but it is **not guaranteed** to propagate all write
tools through the `invoke_subagent` dispatch path. As a result, when the Orchestrator spawns
these agents via `invoke_subagent`, the subagents may inherit only the tools explicitly listed
in their manifest (`send_message`), leaving them functionally read-only.

The `*-rw` ad-hoc variants (e.g., `superconductor-processor-rw`) explicitly enumerate all
required tools and **do** work correctly. This is the reference pattern that must be applied
to the plugin-canonical agents.

## Affected Agents

| Agent | Path | Broken Manifest Pattern |
|---|---|---|
| `superconductor-processor` | `plugins/superconductor/agents/superconductor-processor/agent.md` | `enable_write_tools: true` only |
| `superconductor-dreamer` | `plugins/superconductor/agents/superconductor-dreamer/agent.md` | `enable_write_tools: true` only |
| `superconductor-oracle` | `plugins/superconductor/agents/superconductor-oracle/agent.md` | `enable_write_tools: true` only |
| `remediation-processor` | `plugins/superconductor/agents/remediation-processor/agent.md` | Explicit list, but missing `run_command` |

## Root Cause Analysis

The `enable_write_tools` shorthand was designed as a convenience flag to add the write tool
group at the plugin configuration level (for the root agent). However, when an agent is spawned
as a **subagent** via `invoke_subagent`, the runtime re-resolves the tool set from the `tools:`
list only. The `enable_write_tools` flag does **not** carry through this dispatch path. This
means:

- `superconductor-processor` can only `send_message`. It cannot write files or run tests.
- `superconductor-dreamer` can only `send_message`. It cannot write spec/plan files.
- `superconductor-oracle` can only `send_message`. It cannot run commands for verification.
- `remediation-processor` is partially fixed (explicit list) but is missing `run_command`.

## Reference Pattern (Working)

The `superconductor-processor-rw` and `working-processor` ad-hoc agents **work correctly**
because they explicitly enumerate all required tools in the `tools:` list:

```yaml
tools:
    - send_message
    - find_by_name
    - grep_search
    - view_file
    - list_dir
    - read_url_content
    - search_web
    - schedule
    - generate_image
    - multi_replace_file_content
    - replace_file_content
    - write_to_file
    - run_command
    - manage_task
```

## Functional Requirements

1. **FR-1:** Audit all plugin-canonical Superconductor agents for missing write tools.
2. **FR-2:** Apply the explicit tool enumeration pattern (from the `*-rw` reference) to every
   agent that requires write access.
3. **FR-3:** Each agent's tool list must be scoped to its role:
   - **Processor:** Full write + run tools (maximum capability required for TDD).
   - **Dreamer:** Write tools for spec/plan files + run tools for blueprint generation.
   - **Oracle:** Read + run tools (needs `run_command` for test execution; does NOT need
     `write_to_file` as its primary output is analysis, not code).
   - **Remediation Processor:** Write + run tools, scoped tightly (already mostly correct,
     add `run_command`).
   - **Reviewers (security, correctness, adversarial, regression):** Read-only is correct.
     No change needed.
4. **FR-4:** Keep `enable_write_tools: true` as a belt-and-suspenders fallback alongside the
   explicit list (for future runtime improvements).
5. **FR-5:** Write regression tests that verify each agent manifest contains the required
   tools by loading and parsing the `agent.md` YAML frontmatter.

## Non-Functional Requirements

- **NFR-1:** Changes are limited to agent manifest files (`agent.md`). No business logic changes.
- **NFR-2:** Each manifest MUST retain its existing `name`, `description`, `hidden`, and
  `inheritMcp` fields.
- **NFR-3:** The fix must be committed with a clear audit trail.

## Acceptance Criteria

- [ ] `AC-1`: All 4 affected agent manifests are updated with the explicit tool list.
- [ ] `AC-2`: Regression tests verify each manifest parses correctly and contains the required tool set.
- [ ] `AC-3`: All 334+ existing tests continue to pass.
- [ ] `AC-4`: A new smoke test can instantiate each corrected agent type (manifest loads without YAML parse errors).

## Out of Scope

- Modifying agent system prompts or role constraints.
- Changing the swarm orchestration protocol (`swarm-orchestrate/SKILL.md`).
- Adding new agent types.
