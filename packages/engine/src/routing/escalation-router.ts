import { EventEmitter } from 'events';
import { EscalationPolicy, EscalationSignalType, EscalationHistory, EscalationSignal, EscalationEvent } from './escalation.types.js';

export interface IEscalationPolicy extends EscalationPolicy {}

export const DefaultEscalationPolicy: IEscalationPolicy = {
  consecutiveFailuresThreshold: 3,
  budgetExceededThreshold: 10000, // Not used strictly in signal count yet, but could be passed in details
  editMatchFailureThreshold: 2
};

export class EscalationRouter {
  private history: Record<string, Record<string, EscalationHistory>> = {};

  constructor(
    private emitter: EventEmitter,
    private policy: IEscalationPolicy = DefaultEscalationPolicy
  ) {}

  public processSignal(trackId: string, taskId: string, type: EscalationSignalType): 'continue' | 'escalate' {
    if (!this.history[trackId]) {
      this.history[trackId] = {};
    }
    
    if (!this.history[trackId][taskId]) {
      this.history[trackId][taskId] = {
        taskId,
        signals: [],
        escalated: false,
        downshifted: false
      };
    }

    const taskHistory = this.history[trackId][taskId];
    taskHistory.signals.push({
      taskId,
      type,
      timestamp: new Date()
    });

    let shouldEscalate = false;

    if (type === 'budget_exceeded') {
       shouldEscalate = true;
    }

    const redGreenFailures = taskHistory.signals.filter(s => s.type === 'red_green_failure').length;
    if (redGreenFailures >= this.policy.consecutiveFailuresThreshold) {
      shouldEscalate = true;
    }

    const editMatchFailures = taskHistory.signals.filter(s => s.type === 'edit_match_failure').length;
    if (editMatchFailures >= this.policy.editMatchFailureThreshold) {
      shouldEscalate = true;
    }

    if (shouldEscalate && !taskHistory.escalated) {
      taskHistory.escalated = true;
      taskHistory.downshifted = false;
      this.emitEscalationEvent(taskId, 'escalated', 'pro', `Threshold breached for ${type}`);
      return 'escalate';
    }

    if (shouldEscalate && taskHistory.escalated) {
      return 'continue'; // Already escalated, let failure cascade
    }

    return 'continue';
  }

  public onTaskSuccess(trackId: string, taskId: string): 'none' | 'downshift' {
    if (!this.history[trackId] || !this.history[trackId][taskId]) {
      return 'none';
    }

    const taskHistory = this.history[trackId][taskId];
    
    if (taskHistory.escalated) {
      taskHistory.escalated = false;
      taskHistory.downshifted = true;
      taskHistory.signals = [];
      this.emitEscalationEvent(taskId, 'downshifted', 'flash', 'Task succeeded post-escalation');
      return 'downshift';
    }

    return 'none';
  }

  public getHistory(trackId: string, taskId: string): EscalationHistory | undefined {
    return this.history[trackId]?.[taskId];
  }

  private emitEscalationEvent(taskId: string, type: 'escalated' | 'downshifted', model: string, reason: string) {
    const event: EscalationEvent = {
      type: 'system',
      timestamp: Date.now(),
      detail: {
        taskId,
        escalationType: type,
        modelTarget: model,
        reason
      }
    };
    this.emitter.emit('event', event);
  }
}
