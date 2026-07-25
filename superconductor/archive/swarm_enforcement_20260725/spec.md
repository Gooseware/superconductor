# Specification: Swarm Protocol Strict Guardrails & Anti-Rogue Agent Enforcement

## Problem Statement
The Superconductor framework's swarm enforcement relies entirely on *instructional* guardrails (prompts, skills, protocol documents). The root Orchestrator agent retains raw access to low-level file-editing tools and can bypass the swarm entirely — writing directly to `src/`, committing, and merging without any Reviewer seeing the change. This is the "Lone-Wolf Commit" anti-pattern.

## Root Cause
Three structural gaps exist:
1. **No write lockout**: Nothing prevents the root Orchestrator from invoking `replace_file_content` on `src/` paths while Superconductor is active.
2. **No commit gate**: The commit pipeline accepts any commit, even one that was never seen by the Review Quorum.
3. **No audit trail**: Post-merge, there is no way to distinguish a swarm-reviewed commit from a lone-wolf commit.

## Behavioural Model (Clarified)

### Condition: Superconductor is NOT active
- No restrictions. Agent operates normally with full tool access.

### Condition: Superconductor is active — Swarm Mode
- **Write lockout**: The root Orchestrator is prohibited from invoking source-write tools (`replace_file_content`, `multi_replace_file_content`, `write_to_file` targeting `packages/*/src/`) directly. All implementation MUST be delegated to Processor subagents.
- **Commit gate**: A track branch CANNOT be committed or merged to `main` until the full **Quorum → Remediate → Quorum** loop is complete and all four Reviewers (Security, Correctness, Adversarial, Regression) report `RESOLVED`.

### Condition: Superconductor is active — Sequential Mode
- **No write lockout**: The root Orchestrator CAN write code directly (sequential mode is intentionally tighter, single-agent).
- **Commit gate (same as swarm)**: The track branch CANNOT be committed or merged until the full **Quorum → Remediate → Quorum** loop is complete and everything is green. Sequential mode does not skip the review requirement.

## Acceptance Criteria

### AC-1: Swarm Mode Write Lockout
- When a track is `[~]` in-progress and swarm mode is active, any direct invocation of a source-write tool on `packages/*/src/` by the root agent MUST be blocked at the protocol level (GEMINI.md rule + skill enforcement).
- The root agent MUST emit a rejection message directing it to use `invoke_subagent` with a Processor instead.

### AC-2: Commit Gate (Both Modes)
- A `pre-commit` git hook is **permanently installed** but **context-aware**: it only enforces when a Superconductor track is currently active.
- The hook checks `superconductor/tracks.md` for any entry with `[~]` status. If none is found, the hook exits silently as a no-op — normal commits are completely unaffected.
- When a `[~]` track is detected, any staged changes under `packages/*/src/` require the commit message to contain `Swarm-Authorized: true`.
- Commits missing the trailer are rejected with a clear error message.
- The trailer is ONLY appended by the Swarm Orchestrator CLI pipeline after unanimous quorum (all 4 reviewers `RESOLVED`).
- The trailer includes a structured reference: `Swarm-Authorized: true | reviewers: <conv_id_1>,<conv_id_2>,<conv_id_3>,<conv_id_4>`.

### AC-3: Sequential Mode Commit Gate
- Sequential mode tracks are subject to the same commit gate as swarm mode.
- The sequential mode workflow MUST invoke the Review Quorum before being permitted to run the finalization commit step.
- The workflow document (`workflow.md`) is updated to make this explicit and non-bypassable.

### AC-4: Bypass Hardening
- The `pre-commit` hook is the **sole structural enforcement gate**. There is no CI pipeline — enforcement is entirely local.
- The hook is permanently installed (once, at `/superconductor:setup` time). It does NOT need to be installed/uninstalled per track — its context-awareness handles activation automatically.
- `git commit --no-verify` is the only bypass path. This MUST be treated as an emergency-only escape hatch reserved for human developers. Agents MUST NOT use it.
- Any use of `--no-verify` while a `[~]` track is active MUST write an entry to `superconductor/swarm_compliance.log` documenting the bypass (timestamp, committer, reason). Since `--no-verify` skips the hook, this logging is the responsibility of the `SwarmAuthorizer` pre-flight check which runs independently.
- The audit tool (`npm run audit:swarm`) can detect `--no-verify` bypasses by cross-referencing commits with missing trailers against the compliance log.

### AC-5: Audit Trail
- The Swarm Authorization trailer makes every swarm-reviewed commit identifiable via `git log --grep="Swarm-Authorized"`.
- A script `scripts/audit-swarm-compliance.ts` is a **manual diagnostic tool** (run via `npm run audit:swarm`) — it is NOT wired into any CI pipeline.
- The script scans git history and reports any commits to `packages/*/src/` missing the trailer. Output is human-readable to the terminal; it is not a blocking gate.
- `superconductor/swarm_compliance.log` acts as the local audit log for bypass events.

## Out of Scope
- Blocking non-superconductor agent work (e.g., design-os, standalone skills).
- Restricting writes to non-`src/` paths (docs, config, superconductor metadata files).
- Server-side git hook infrastructure (deferred to a follow-on track if needed).
