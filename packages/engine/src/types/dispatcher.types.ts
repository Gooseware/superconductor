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
  type: 'agent_started' | 'agent_finished' | 'agent_failed';
  agentId: string;
  payload?: SubagentResult;
}
