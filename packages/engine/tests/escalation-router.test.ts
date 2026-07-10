import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { EscalationRouter } from '../src/routing/escalation-router.js';

describe('EscalationRouter', () => {
  let emitter: EventEmitter;
  let router: EscalationRouter;

  beforeEach(() => {
    emitter = new EventEmitter();
    router = new EscalationRouter(emitter, {
      consecutiveFailuresThreshold: 3,
      budgetExceededThreshold: 10000,
      editMatchFailureThreshold: 2
    });
  });

  it('No escalation when failures are below threshold (< 3 consecutive)', () => {
    const action1 = router.processSignal('track-1', 'task-1', 'red_green_failure');
    const action2 = router.processSignal('track-1', 'task-1', 'red_green_failure');
    
    expect(action1).toBe('continue');
    expect(action2).toBe('continue');
    
    const history = router.getHistory('track-1', 'task-1');
    expect(history.escalated).toBe(false);
  });

  it('Escalation triggers after 3 consecutive Red→Green failures', () => {
    router.processSignal('track-1', 'task-1', 'red_green_failure');
    router.processSignal('track-1', 'task-1', 'red_green_failure');
    const action3 = router.processSignal('track-1', 'task-1', 'red_green_failure');
    
    expect(action3).toBe('escalate');
    
    const history = router.getHistory('track-1', 'task-1');
    expect(history.escalated).toBe(true);
  });

  it('Escalation triggers on token budget exceeded', () => {
    const action = router.processSignal('track-1', 'task-1', 'budget_exceeded');
    expect(action).toBe('escalate');
  });

  it('Escalation triggers on edit match failure threshold', () => {
    router.processSignal('track-1', 'task-1', 'edit_match_failure');
    const action2 = router.processSignal('track-1', 'task-1', 'edit_match_failure');
    expect(action2).toBe('escalate');
  });

  it('Combined signal mode triggers on any threshold breach', () => {
    router.processSignal('track-1', 'task-1', 'red_green_failure');
    const action = router.processSignal('track-1', 'task-1', 'budget_exceeded');
    expect(action).toBe('escalate');
  });

  it('Downshift to cheaper model after successful post-escalation task', () => {
    router.processSignal('track-1', 'task-1', 'red_green_failure');
    router.processSignal('track-1', 'task-1', 'red_green_failure');
    router.processSignal('track-1', 'task-1', 'red_green_failure');
    
    const historyBefore = router.getHistory('track-1', 'task-1');
    expect(historyBefore.escalated).toBe(true);
    
    // Simulate success
    const action = router.onTaskSuccess('track-1', 'task-1');
    expect(action).toBe('downshift');
    
    const historyAfter = router.getHistory('track-1', 'task-1');
    expect(historyAfter.downshifted).toBe(true);
    expect(historyAfter.escalated).toBe(false); // Should reset or something
  });

  it('Escalation history is maintained per track', () => {
    router.processSignal('track-1', 'task-1', 'budget_exceeded');
    
    const track1History = router.getHistory('track-1', 'task-1');
    expect(track1History.escalated).toBe(true);
    
    const track2History = router.getHistory('track-2', 'task-1');
    expect(track2History).toBeUndefined();
  });

  it('Custom escalation policy overrides default thresholds', () => {
    const customRouter = new EscalationRouter(emitter, {
      consecutiveFailuresThreshold: 1,
      budgetExceededThreshold: 5000,
      editMatchFailureThreshold: 5
    });
    
    const action = customRouter.processSignal('track-1', 'task-1', 'red_green_failure');
    expect(action).toBe('escalate');
  });
});
