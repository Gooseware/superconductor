# Superconductor v0.5: Task Graph + Invariant Ledger

## Overview
This track upgrades Superconductor by introducing a structured Task Store and an Invariant Ledger. It establishes a libSQL + LanceDB backed task graph as the source of truth for task execution, replacing `plan.md` (which becomes a human-readable view). It also introduces capability invariants (`CREATES`, `PROTECTED`, `INVARIANT_AFTER`) to safeguard against regressions during iterative development.

**Note:** This track supersedes and absorbs `regression_invariant_ledger_20260812`.

## Architecture Details

### Exact SQL Schema (`packages/task-store/`)
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  creates TEXT,          -- JSON[] of file paths created
  protected TEXT,        -- JSON[] of file paths protected from modification
  invariant_after TEXT,  -- Human-readable invariant guarantee
  dependencies TEXT,     -- JSON[] of task_ids
  status TEXT DEFAULT 'pending',  -- pending/in_progress/completed/blocked
  tier TEXT,
  agent TEXT,
  committed_sha TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tasks_track ON tasks(track_id);
CREATE INDEX idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS invariants (
  id TEXT PRIMARY KEY,
  capability TEXT NOT NULL,
  path TEXT NOT NULL,
  rationale TEXT,
  track_id TEXT,
  task_id TEXT,
  removable_if TEXT,
  status TEXT DEFAULT 'active',  -- active/overridden/untriaged
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_invariants_path ON invariants(path);
CREATE INDEX idx_invariants_status ON invariants(status);

CREATE TABLE IF NOT EXISTS invariant_overrides (
  id TEXT PRIMARY KEY,
  invariant_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'active',  -- active/revoked
  created_at INTEGER NOT NULL,
  FOREIGN KEY(invariant_id) REFERENCES invariants(id)
);
```

### Exact MCP Tool Signatures
```typescript
task_create(args: {
  track_id: string; title: string; description: string;
  creates?: string[]; protected?: string[]; invariant_after?: string;
  dependencies?: string[]; tier?: string; agent?: string;
}): Promise<{ id: string }>

task_update(args: {
  id: string; status?: 'pending'|'in_progress'|'completed'|'blocked'; committed_sha?: string;
}): Promise<{ success: boolean }>

task_query(args: {
  track_id?: string; status?: string; agent?: string;
  semantic_query?: string; limit?: number;
}): Promise<Array<TaskResult>>

invariant_query(args: {
  status?: 'active'|'overridden'|'untriaged'; path?: string;
  capability?: string; track_id?: string;
}): Promise<Array<InvariantResult>>

invariant_override(args: {
  invariant_id: string; track_id: string; reason: string;
}): Promise<{ override_id: string }>

task_get_invariants(args: {
  track_id: string;
}): Promise<{ invariants: Array<InvariantResult>, active_overrides: Array<OverrideResult> }>
```

### LanceDB Vector Schema
```typescript
const taskSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("track_id", new Utf8(), false),
  new Field("title", new Utf8(), false),
  new Field("description", new Utf8(), true),
  new Field("vector", new FixedSizeList(1536, new Field("item", new Float32(), false)), false)
]);
```

### Package Structure
Matches `notebook-store` EXACTLY:
```text
packages/task-store/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── providers/
│   │   ├── libsql-task-provider.ts
│   │   ├── lancedb-task-provider.ts
│   │   └── task-provider-factory.ts
│   ├── validation/
│   │   └── index.ts
│   └── mcp/
│       └── handlers.ts
└── tests/
    └── providers.test.ts
```

### Task Card Format in plan.md
```markdown
- [ ] Task: Add Auth Guard [TIER-3] [AGENT:superconductor-processor]
    CREATES: src/auth/guard.ts
    PROTECTED: src/auth/session.ts
    INVARIANT_AFTER: "The session validator MUST never bypass token signature checks."
    - [ ] Write tests
    - [ ] Implement
```

### Sync Flow
1. Dreamer writes `plan.md` with CREATES/PROTECTED/INVARIANT_AFTER fields
2. `newTrack` skill parses plan.md and calls `task_create` for each task
3. `implement` skill reads task assignments from `task_query()` (not markdown)
4. On task completion: `task_update()` + `sync-plan` script rewrites plan.md checkboxes
5. At finalization: `task_get_invariants()` populates `superconductor/invariants.md`

### Discovery Bootstrap (Brownfield)
- HIGH confidence → insert directly as `active` invariant
- MEDIUM/LOW → insert as `untriaged`, output to `superconductor/invariants-untriaged.md`

## Acceptance Criteria

- **AC1:** `packages/task-store/` exists, implementing exact libSQL schema with tables for `tasks`, `invariants`, and `invariant_overrides`, plus the specified LanceDB vector store schema.
- **AC2:** Exact six MCP tools are registered in `superconductor-kernel` using the specified signatures.
- **AC3:** The `newTrack` skill parses `plan.md` and calls `task_create` for each task. `sync-plan` script correctly rewrites checkboxes.
- **AC4:** The `implement` skill reads task assignments from `task_query()` instead of parsing `plan.md`.
- **AC5:** The `status` skill queries the task database directly to report live execution status.
- **AC6:** Dreamer agent logic generates exact `CREATES:`, `PROTECTED:`, and `INVARIANT_AFTER:` format in task cards.
- **AC7:** Regression Reviewer includes a pre-check step that queries `invariant_query()` and emits `REG-INV-N: CRITICAL` if paths are missing without overrides.
- **AC8:** Bootstrap script (`bootstrap-invariants.ts`) seeds initial invariants for all existing slash commands, MCP tools, and 6 core orchestration files.
- **AC9:** Discovery bootstrap agent handles brownfield projects: HIGH confidence -> `active`, MEDIUM/LOW -> `untriaged` and outputs to `superconductor/invariants-untriaged.md`.
- **AC10:** `superconductor/invariants.md` is populated by `task_get_invariants()` at finalization.
- **AC11:** All newly introduced code achieves >80% test coverage.
- **AC12:** `tsc --noEmit` completes cleanly without errors.
