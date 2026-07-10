export interface SubagentConfig {
  agentName: string;
  role: string;
  tier: number;
  prompt: string;
  workspace: string;
}

export interface SubagentResult {
  agentId: string;
  status: 'success' | 'failure';
  output: string;
  error?: string;
  filesChanged?: string[];
}

export interface DispatcherEvent {
  type: 'task_started' | 'task_completed' | 'task_failed';
  taskId: string;
  agentId?: string;
  payload?: SubagentResult;
}
