export type TaskRole = 'architect' | 'editor' | 'reviewer' | 'processor' | 'oracle';
export type TaskTier = 1 | 2 | 3 | 4;
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';

export interface DagEdge {
  from: string;
  to: string;
}

export interface DagNode {
  id: string;
  name?: string;
  description?: string;
  role: TaskRole;
  tier: TaskTier;
  status: TaskStatus;
  prompt: string;
  contextFiles?: string[];
  dependsOn?: string[]; // Array of node IDs
  constraints?: string[];
  variables?: Record<string, string>;
  symbolDependencies?: { file: string; symbol: string }[];
  toolSurface?: 'full' | 'readonly';
}


export interface TaskGraph {
  nodes: Record<string, DagNode>;
  edges: DagEdge[];
}
