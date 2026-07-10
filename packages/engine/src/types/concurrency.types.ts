export interface FileOwnership {
  file: string;
  ownerId: string; // Task/Agent ID currently owning the file
}

export interface WriteRequest {
  taskId: string;
  file: string;
  content: string;
}

export interface ConflictReport {
  file: string;
  conflictingTasks: string[];
  resolved: boolean;
}
