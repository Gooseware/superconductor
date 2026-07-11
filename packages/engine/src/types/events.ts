import { SchedulerEvent } from './scheduler.types.js';
import { DispatcherEvent } from './dispatcher.types.js';
import { EscalationEvent } from '../routing/escalation.types.js';
import { GccEvent } from '../safety/gcc.types.js';
import { RiskClassification } from '../safety/risk.types.js';

export type EngineEventType = 'scheduler' | 'dispatcher' | 'concurrency' | 'system' | 'routing' | 'safety' | 'state';

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

export interface RoutingEngineEvent extends BaseEngineEvent {
  type: 'routing';
  detail: any; // Can be TrimResult, CacheHitReport, or EscalationEvent
}

export interface SafetyEngineEvent extends BaseEngineEvent {
  type: 'safety';
  detail: GccEvent | RiskClassification;
}

export interface StateEngineEvent extends BaseEngineEvent {
  type: 'state';
  detail: unknown;
}

export type EngineEvent = SchedulerEngineEvent | DispatcherEngineEvent | ConcurrencyEngineEvent | SystemEngineEvent | RoutingEngineEvent | EscalationEvent | SafetyEngineEvent | StateEngineEvent;
