export interface TaskResult {
  id: string;
  track_id: string;
  title: string;
  description?: string;
  creates?: string[];
  protected?: string[];
  invariant_after?: string;
  dependencies?: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  tier?: string;
  agent?: string;
  committed_sha?: string;
  created_at: number;
  updated_at: number;
}

export interface InvariantResult {
  id: string;
  capability: string;
  path: string;
  rationale?: string;
  track_id?: string;
  task_id?: string;
  removable_if?: string;
  status: 'active' | 'overridden' | 'untriaged';
  created_at: number;
  updated_at: number;
}

export interface OverrideResult {
  id: string;
  invariant_id: string;
  track_id: string;
  reason: string;
  status: 'active' | 'revoked';
  created_at: number;
}

export interface TaskProvider {
  init(): Promise<void>;
  close(): Promise<void>;
  createTask(args: {
    track_id: string;
    title: string;
    description?: string;
    creates?: string[];
    protected?: string[];
    invariant_after?: string;
    dependencies?: string[];
    tier?: string;
    agent?: string;
  }): Promise<{ id: string }>;
  updateTask(args: {
    id: string;
    status?: 'pending' | 'in_progress' | 'completed' | 'blocked';
    committed_sha?: string;
  }): Promise<{ success: boolean }>;
  queryTasks(args: {
    track_id?: string;
    status?: string;
    agent?: string;
    limit?: number;
  }): Promise<TaskResult[]>;
  createInvariant(args: {
    capability: string;
    path: string;
    rationale?: string;
    track_id?: string;
    task_id?: string;
    removable_if?: string;
    status?: 'active' | 'overridden' | 'untriaged';
  }): Promise<{ id: string }>;
  queryInvariants(args: {
    status?: 'active' | 'overridden' | 'untriaged';
    path?: string;
    capability?: string;
    track_id?: string;
  }): Promise<InvariantResult[]>;
  createOverride(args: {
    invariant_id: string;
    track_id: string;
    reason: string;
  }): Promise<{ override_id: string }>;
  queryOverrides(args: {
    invariant_id?: string;
    track_id?: string;
    status?: 'active' | 'revoked';
  }): Promise<OverrideResult[]>;
}

