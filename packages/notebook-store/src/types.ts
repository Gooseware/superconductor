export type NoteType = 'spec' | 'design' | 'style' | 'quorum' | 'preference' | 'procedure' | 'failure' | 'dependency' | 'warning';
export type NoteSeverity = 'info' | 'warning' | 'critical';
export type AuthorityLevel = 'authoritative' | 'system' | 'agent';

// Authority mapping
export const NOTE_AUTHORITY: Record<NoteType, AuthorityLevel> = {
  preference: 'authoritative',
  design: 'authoritative',
  quorum: 'system',
  style: 'system',
  spec: 'agent',
  failure: 'agent',
  dependency: 'agent',
  procedure: 'agent',
  warning: 'agent',
};

// Per-project vs global store routing
export const NOTE_STORE: Record<NoteType, 'global' | 'project'> = {
  preference: 'global',
  design: 'global',
  style: 'global',
  procedure: 'global',
  quorum: 'project',
  failure: 'project',
  dependency: 'project',
  warning: 'project',
  spec: 'project',
};

export interface NotebookEntry {
  id: string;            // UUID v4
  session_id: string;
  track_id: string;
  agent_role: string;
  domain: string;
  files: string[];
  note_type: NoteType;
  content: string;       // ≤280 chars
  severity: NoteSeverity;
  timestamp: number;     // Unix ms
  reviewer_token?: string; // Required for quorum/style notes
}

export interface WriteAck { id: string; deduplicated: boolean; }
export interface NotebookQuery { query?: string; files?: string[]; domain?: string; note_types?: NoteType[]; severity?: NoteSeverity; limit?: number; max_age_days?: number; }
export interface NotebookSummary { by_type: Partial<Record<NoteType, NotebookEntry[]>>; total: number; }

export interface INotebookProvider {
  write(entry: Omit<NotebookEntry, 'id' | 'timestamp'>): Promise<WriteAck>;
  query(params: NotebookQuery): Promise<NotebookEntry[]>;
  summary(track_id?: string): Promise<NotebookSummary>;
  close(): Promise<void>;
}
