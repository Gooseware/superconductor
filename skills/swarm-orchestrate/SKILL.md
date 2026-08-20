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
