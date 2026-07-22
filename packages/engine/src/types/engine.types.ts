export interface EngineConfig {
  headless?: boolean;
  commonContext?: string;
  disableCache?: boolean;
  dbPath?: string;
  skillsDir?: string;
}

export interface ReviewComment {
  severity: 'critical' | 'major' | 'minor';
  file: string;
  line?: number;
  message: string;
}

export interface TrackExecutionState {
  taskId: string;
  trackId: string;
  iteration_count: number;
  execution_errors: string[];
  review_comments: ReviewComment[];
  checkpointSha?: string;
  model_tier: 1 | 2 | 3 | 4;
  escalated: boolean;
  dodLevel?: 1 | 2 | 3 | 4;
  hitRatio?: number;
}
