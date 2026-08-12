# Implementation Plan: Regression Protocol: Capability Invariant Ledger

## Phase 0: Swarm Preflight
- [ ] `[TIER-1]` `[AGENT:superconductor-processor]` Verify workspace and branches. Ensure Superconductor Notebook LanceDB/FTS5 store is accessible.

## Phase 1: Notebook Schema
- [ ] `[TIER-2]` `[AGENT:superconductor-processor]` Update `packages/notebook-store/` schema and validation logic to accept `invariant` and `invariant_override` types.
- [ ] `[TIER-2]` `[AGENT:superconductor-processor]` Update the `notebook_write` MCP tool to accept fields: `capability`, `path`, `rationale`, `track`, `created_at`, `removable_if` for `invariant`, and `justification` for `invariant_override`.
- [ ] `[TIER-2]` `[AGENT:superconductor-processor]` Update the `notebook_query` MCP tool to filter by these new note types.

## Phase 2: Regression Reviewer Enhancement
- [ ] `[TIER-1]` `[AGENT:superconductor-processor]` Modify `/home/gooseware/.gemini/config/plugins/superconductor/agents/regression-reviewer/agent.md`. Add the pre-check step to query invariants, check paths/globs, and enforce overrides before checking git diffs.

## Phase 3: Invariant Write Protocol
- [ ] `[TIER-1]` `[AGENT:superconductor-processor]` Modify `/home/gooseware/.gemini/config/plugins/superconductor/skills/implement/SKILL.md`. Add a mandatory step in the Integration & Finalization phase asking if durable capabilities were created, and writing invariants if so.

## Phase 4: Bootstrap
- [ ] `[TIER-3]` `[AGENT:superconductor-processor]` Create a bootstrap script (e.g., `scripts/bootstrap_invariants.ts`) to write invariant notes for:
  - All `commands/superconductor/*.toml` slash commands.
  - All MCP tools in `packages/superconductor-kernel/`.
  - All skills in `skills/`.
  - Key orchestration files (WorkspaceGuard, SignOffGate, QuorumFSM).
- [ ] `[TIER-2]` `[AGENT:superconductor-processor]` Create a script to generate the human-readable `superconductor/invariants.md` audit trail from the notebook store.
- [ ] `[TIER-1]` `[AGENT:superconductor-processor]` Run both scripts to bootstrap the notebook and generate the initial `invariants.md`.

## Phase 5: Integration & Finalization
- [ ] `[TIER-2]` `[AGENT:superconductor-reviewer]` Perform full review (correctness and regression) on the implemented ledger.
- [ ] `[TIER-1]` `[AGENT:superconductor-processor]` Ensure all tests pass and documentation is up to date.
