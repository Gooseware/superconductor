export type TaskRole = 'architect' | 'editor';
export type TaskTier = 1 | 2 | 3 | 4;
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';

export interface DagEdge {
  from: string;
  to: string;
}

export interface DagNode {
  id: string;
  role: TaskRole;
  tier: TaskTier;
  status: TaskStatus;
  prompt: string;
  contextFiles?: string[];
  dependsOn?: string[]; // Array of node IDs
}

export interface TaskGraph {
  nodes: Map<string, DagNode>;
  edges: DagEdge[];
}
