export interface AgyStatusPayload {
  tokensUsed: number;
  contextSize: number;
  state: 'RED' | 'GREEN' | 'REFACTOR' | 'IDLE';
  escalationTriggered?: boolean;
  taskId?: string;
  trackId?: string;
  diffStatus?: 'APPLIED' | 'FAILED' | 'NONE';
  timestamp: string;
}

export interface TaskMetrics {
  taskId: string;
  trackId: string;
  tokenCount: number;
  success: boolean;
  editMatchFailureRate: number; // failed diffs / total diffs
  escalationCount: number;
  timeToGreenMs: number; // diff from RED start to GREEN end
}

export interface TrackMetrics {
  trackId: string;
  tokenToSuccessRatio: number;
  totalTokens: number;
  tasksCompleted: number;
  averageTimeToGreenMs: number;
  escalationFrequency: number;
}

export interface MetricQuery {
  taskId?: string;
  trackId?: string;
  timeRangeStart?: string;
  timeRangeEnd?: string;
}
