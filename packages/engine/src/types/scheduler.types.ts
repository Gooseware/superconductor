import { DagNode } from './dag.types.js';

export interface SchedulerState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  activeTasks: string[]; // Node IDs
  completedTasks: string[];
  failedTasks: string[];
}

export interface TaskBatch {
  tasks: DagNode[];
}

export interface SchedulerEvent {
  type: 'batch_ready' | 'task_completed' | 'task_failed' | 'workflow_finished';
  payload?: any;
}
