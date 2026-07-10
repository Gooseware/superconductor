import { SchedulerEvent } from './scheduler.types.js';
import { DispatcherEvent } from './dispatcher.types.js';

export type EngineEventType = 'scheduler' | 'dispatcher' | 'concurrency' | 'system';

export interface BaseEngineEvent {
  type: EngineEventType;
  timestamp: number;
}

export interface SchedulerEngineEvent extends BaseEngineEvent {
  type: 'scheduler';
  detail: SchedulerEvent;
}

export interface DispatcherEngineEvent extends BaseEngineEvent {
  type: 'dispatcher';
  detail: DispatcherEvent;
}

export interface ConcurrencyEngineEvent extends BaseEngineEvent {
  type: 'concurrency';
  detail: unknown; // Detailed later if needed
}

export interface SystemEngineEvent extends BaseEngineEvent {
  type: 'system';
  detail: unknown;
}

export type EngineEvent = SchedulerEngineEvent | DispatcherEngineEvent | ConcurrencyEngineEvent | SystemEngineEvent;
