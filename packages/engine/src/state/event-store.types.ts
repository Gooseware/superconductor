import { EngineEvent } from '../types/events.js';

export interface EngineEventRecord {
  id: number;
  taskId?: string;
  eventType: string;
  timestamp: number;
  payload: EngineEvent;
}

export interface EventQuery {
  taskId?: string;
  eventType?: string;
  since?: number;
  until?: number;
}

export interface EventStoreConfig {
  dbPath: string;
}
