# Track: Agent Config Model Resolution

**Track ID:** `agent_config_model_resolution_20260902`
**Status:** `[ ]` Pending

## Links
- [Spec](./spec.md)
- [Plan](./plan.md)
- **Branch:** `track/agent_config_model_resolution_20260902`

## Summary
Fixes the bug where `invoke_subagent` dispatches all subagents with `Model: "inherit"` instead of the model configured in `superconductor/agent-config.md`. Adds a mandatory `AgentConfigReader` step to `swarm-execute §Step 1` and `implement/SKILL.md`, a model-ID-to-tier-enum mapping table, and enforces the resolved model at every dispatch call site.
