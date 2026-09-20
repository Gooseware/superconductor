---
name: swarm-orchestrate
description: (DEPRECATED) Monolithic swarm orchestrator. Redirected to skills/swarm-execute/SKILL.md.
---

# Swarm Orchestrate (DEPRECATED)

> [!WARNING]
> **DEPRECATION NOTICE**: The `swarm-orchestrate` skill has been deprecated and replaced by `swarm-execute`.
> Please read and follow the full operational protocol in [`skills/swarm-execute/SKILL.md`](../swarm-execute/SKILL.md).

## Redirection Directive

All multi-agent swarm execution, task dispatch, quorum review loops, remediation handling, and oracle gate evaluations are now canonically handled by `swarm-execute`.

To execute a track with the swarm:
```bash
superconductor swarm-execute <track-id> [--no-preflight] [--headless] [--triage-source]
```

Refer to [`skills/swarm-execute/SKILL.md`](../swarm-execute/SKILL.md) for the active protocol.

## Quorum Reviewer Panel (5 Reviewers)

When executing via `swarm-execute`, the quorum review panel consists of 5 parallel reviewers:
1. **Security Reviewer** (`superconductor-reviewer`, domain: `security`)
2. **Correctness Reviewer** (`superconductor-reviewer`, domain: `correctness`)
3. **Adversarial Reviewer** (`superconductor-reviewer`, domain: `adversarial`)
4. **Regression Reviewer** (`superconductor-reviewer`, domain: `regression`)
5. **UX / Consistency Reviewer** (`superconductor-reviewer`, domain: `ux-review`, skill: `ux-reviewer`) — audits CLI messages, skill files, MCP schemas, and banners using the 56-rule UxRuleEngine checklist.

All 5 reviewers must report `status: "RESOLVED"` with 0 blocking findings before the Oracle review gate.
