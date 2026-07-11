export interface WorktreeInfo {
  taskId: string;
  branchName: string;
  worktreePath: string;
}

export type GccOperation = 'branch' | 'merge' | 'drop';

export interface GccEvent {
  taskId: string;
  operation: GccOperation;
  timestamp: number;
  success: boolean;
  error?: string;
}
