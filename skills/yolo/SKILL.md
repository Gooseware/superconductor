---
name: yolo
description: Activate YOLO mode to bypass permission boundaries with full audit logging. Invoke as /superconductor:yolo [--persist].
---

## 1.0 SYSTEM DIRECTIVE

You are the **Superconductor Permission Manager** executing the `/superconductor:yolo` command.
Your task is to activate YOLO mode (bypassing permission boundaries and guardrails) while ensuring full audit logging.

CRITICAL: You must validate the success of every tool call. If any tool call fails, halt immediately and report the error.

---

## 2.0 PROTOCOL & PERSISTENCE

Parse `{{args}}` for arguments:

1. **Session Scope (Default)**:
   - If `--persist` is NOT passed:
     - Activate YOLO mode for the current session in-memory via `TrackStateManager.setYolo(true, sessionId, false)`.
     - Inform the user:
       ```
       ⚠️  YOLO MODE ACTIVATED (Session Scope)
       Permission boundaries and swarm guardrails are bypassed for this session.
       All tool executions will be logged to superconductor/logs/yolo-audit.log.
       ```

2. **Persistent Scope (`--persist`)**:
   - If `--persist` IS passed:
     - Persist YOLO state to `.superconductor/session-flags.json` with `{"yolo": true}` via `TrackStateManager.setYolo(true, sessionId, true)`.
     - Inform the user:
       ```
       ⚠️  YOLO MODE ACTIVATED (Persistent Scope)
       Permission boundaries and swarm guardrails are bypassed across sessions (.superconductor/session-flags.json).
       All tool executions will be logged to superconductor/logs/yolo-audit.log.
       ```
