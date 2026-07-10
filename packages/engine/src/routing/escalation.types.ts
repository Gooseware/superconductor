import { BaseEngineEvent } from '../types/events';

export type EscalationSignalType = 'red_green_failure' | 'budget_exceeded' | 'edit_match_failure';

export interface EscalationSignal {
  taskId: string;
  type: EscalationSignalType;
  timestamp: Date;
  details?: Record<string, any>;
}

export interface EscalationPolicy {
  consecutiveFailuresThreshold: number; // default: 3
  budgetExceededThreshold: number; // default: varies
  editMatchFailureThreshold: number; // default: varies
}

export interface EscalationHistory {
  taskId: string;
  signals: EscalationSignal[];
  escalated: boolean;
  downshifted: boolean;
}

export interface EscalationEvent extends BaseEngineEvent {
  type: 'system';
  taskId: string;
  escalationType: 'escalated' | 'downshifted';
  modelTarget: string;
  reason: string;
}
