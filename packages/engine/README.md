# Superconductor Engine

The Superconductor Engine manages the orchestration of agentic tasks via a DAG structure.

## Safety Module

The Engine includes a robust Safety Module designed for sandboxing and state resilience.

### Event Store (`src/state/event-store.ts`)
A synchronous SQLite-backed event store that records all engine state changes and safety operations using `better-sqlite3` and Write-Ahead Logging (WAL) for high performance. It can be used to reconstruct the engine state and generate the current working plan.

### Git Context Controller (GCC) (`src/safety/gcc.ts`)
Isolates high-risk tasks into standalone Git worktrees.
- `gccBranch(taskId)`: Creates an isolated worktree for execution.
- `gccMerge(taskId)`: Merges the worktree back on success.
- `gccDrop(taskId)`: Drops the worktree and branch on failure.

### Semantic Risk Middleware (`src/safety/risk-middleware.ts`)
Evaluates the risk of commands and file writes, assigning them a tier (1-5) and an action (`auto-approve`, `require-approval`, `block`).
- Prevents destructive commands like `rm -rf` without explicit approval.
- Blocks system-level access paths like `/etc/`.
