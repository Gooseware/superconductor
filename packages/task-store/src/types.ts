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
