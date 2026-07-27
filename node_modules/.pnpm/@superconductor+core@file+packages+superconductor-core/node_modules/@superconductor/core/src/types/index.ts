export interface CoreMetadata {
  name: string;
  version: string;
}

export interface AgentContextOptions {
  projectRoot: string;
  tokenBudget?: number;
}
