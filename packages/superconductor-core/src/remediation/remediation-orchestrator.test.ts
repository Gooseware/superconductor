import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemediationOrchestrator, AgentSpawner, ReviewResult } from './remediation-orchestrator';
import { RemediationStateObject } from './remediation-state';

describe('RemediationOrchestrator', () => {
  let mockSpawner: AgentSpawner;

  beforeEach(() => {
    mockSpawner = {
      spawn: vi.fn().mockResolvedValue('agent-123'),
      kill: vi.fn().mockResolvedValue(undefined),
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Small helper to advance timers enough for promises to resolve, but not 10 minutes
  const tick = async () => {
    await vi.advanceTimersByTimeAsync(1);
  };

  it('transitions IDLE -> ANALYZING -> DISPATCHING -> REMEDIATING on start', async () => {
    const findings = [{ id: 'f1', ruleId: 'auth-bypass', file: 'auth/index.ts' }];
    const orchestrator = new RemediationOrchestrator(findings, { spawner: mockSpawner });
    
    expect(orchestrator.getState()).toBe('IDLE');
    
    const startPromise = orchestrator.start();
    await tick();
    
    expect(orchestrator.getState()).toBe('REMEDIATING');
    expect(mockSpawner.spawn).toHaveBeenCalledTimes(1);
    expect(mockSpawner.spawn).toHaveBeenCalledWith('security-remediator', findings, null);
  });

  it('batches multiple findings in the same domain to a single agent', async () => {
    const findings = [
      { id: 'f1', ruleId: 'auth-bypass', file: 'auth/a.ts' },
      { id: 'f2', ruleId: 'sql-injection', file: 'auth/b.ts' },
      { id: 'f3', ruleId: 'xss', file: 'auth/c.ts' },
    ];
    const orchestrator = new RemediationOrchestrator(findings, { spawner: mockSpawner });
    orchestrator.start();
    await tick();
    
    expect(mockSpawner.spawn).toHaveBeenCalledTimes(1);
    expect(mockSpawner.spawn).toHaveBeenCalledWith('security-remediator', expect.arrayContaining(findings), null);
  });

  it('spawns multiple agents for mixed domains', async () => {
    const findings = [
      { id: 'f1', ruleId: 'auth-bypass', file: 'auth/a.ts' },
      { id: 'f2', ruleId: 'react-hooks', file: 'ui/b.ts' },
    ];
    const orchestrator = new RemediationOrchestrator(findings, { spawner: mockSpawner });
    
    mockSpawner.spawn = vi.fn()
      .mockResolvedValueOnce('agent-sec')
      .mockResolvedValueOnce('agent-ui');

    orchestrator.start();
    await tick();
    
    expect(mockSpawner.spawn).toHaveBeenCalledTimes(2);
    expect(mockSpawner.spawn).toHaveBeenCalledWith('security-remediator', [findings[0]], null);
    expect(mockSpawner.spawn).toHaveBeenCalledWith('frontend-remediator', [findings[1]], null);
  });

  it('transitions REMEDIATING -> RE-REVIEWING -> RESOLVED on success', async () => {
    const findings = [{ id: 'f1', ruleId: 'auth-bypass', file: 'auth/a.ts' }];
    const orchestrator = new RemediationOrchestrator(findings, { spawner: mockSpawner });
    
    const startPromise = orchestrator.start();
    await tick();
    
    expect(orchestrator.getState()).toBe('REMEDIATING');
    
    orchestrator.handleReviewResult('agent-123', { status: 'RESOLVED' });
    
    const stateObj = await startPromise;
    expect(orchestrator.getState()).toBe('RESOLVED');
    expect(stateObj.outcome).toBe('RESOLVED');
  });

  it('retries max 2 times (RE-REVIEWING -> REMEDIATING) before ESCALATING', async () => {
    const findings = [{ id: 'f1', ruleId: 'auth-bypass', file: 'auth/a.ts' }];
    const orchestrator = new RemediationOrchestrator(findings, { spawner: mockSpawner });
    
    const startPromise = orchestrator.start();
    await tick();
    
    expect(mockSpawner.spawn).toHaveBeenCalledTimes(1);
    
    // 1st failure (retry 1)
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick();
    expect(orchestrator.getState()).toBe('REMEDIATING');
    expect(mockSpawner.spawn).toHaveBeenCalledTimes(2); // Respawned
    
    // 2nd failure (retry 2)
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick();
    expect(orchestrator.getState()).toBe('REMEDIATING');
    expect(mockSpawner.spawn).toHaveBeenCalledTimes(3); // Respawned again
    
    // 3rd failure (exhausted retries)
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    
    const stateObj = await startPromise;
    expect(orchestrator.getState()).toBe('ESCALATED');
    expect(stateObj.outcome).toBe('ESCALATED');
  });

  it('transitions to ESCALATED on 10 min timeout', async () => {
    const findings = [{ id: 'f1', ruleId: 'auth-bypass', file: 'auth/a.ts' }];
    const orchestrator = new RemediationOrchestrator(findings, { spawner: mockSpawner });
    
    const startPromise = orchestrator.start();
    
    await tick();
    expect(orchestrator.getState()).toBe('REMEDIATING');
    
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    
    const stateObj = await startPromise;
    expect(orchestrator.getState()).toBe('ESCALATED');
    expect(stateObj.outcome).toBe('ESCALATED');
});

  it('populates fixedFindings after a RESOLVED review result', async () => {
    const findings = [{ id: 'f1', ruleId: 'auth-bypass', file: 'a.ts' }];
    const orchestrator = new RemediationOrchestrator(findings, { spawner: mockSpawner });
    const startPromise = orchestrator.start();
    await tick();
    
    orchestrator.handleReviewResult('agent-123', { status: 'RESOLVED' });
    const stateObj = await startPromise;
    expect(stateObj.fixedFindings).toContain('f1');
  });

  it('wires deep research on exhausted retries and populates deepResearchResults', async () => {
    const mockEscalationHandler = {
      escalate: vi.fn().mockResolvedValue({
        classification: 'auto-applicable',
        researchContent: 'content',
        spotlightedContent: '<DEEP_RESEARCH_RESULT>content</DEEP_RESEARCH_RESULT>',
      }),
      handlePolicyDecision: vi.fn()
    } as any;

    const findings = [{ id: 'f1', ruleId: 'auth-bypass', file: 'a.ts' }];
    const orchestrator = new RemediationOrchestrator(findings, { 
      spawner: mockSpawner, 
      escalationHandler: mockEscalationHandler 
    });
    
    orchestrator.start();
    await tick();
    
    // Fail 3 times
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick();
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick();
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick();

    expect(mockEscalationHandler.escalate).toHaveBeenCalled();
    expect(mockSpawner.spawn).toHaveBeenCalledWith('general-remediator', findings, { 
      deepResearchResult: '<DEEP_RESEARCH_RESULT>content</DEEP_RESEARCH_RESULT>' 
    });
  });

  it('populates failedFindings and outcome ESCALATED if it fails after deep research', async () => {
    const mockEscalationHandler = {
      escalate: vi.fn().mockResolvedValue({
        classification: 'auto-applicable',
        researchContent: 'content',
        spotlightedContent: '<DEEP_RESEARCH_RESULT>content</DEEP_RESEARCH_RESULT>',
      }),
      handlePolicyDecision: vi.fn()
    } as any;

    const findings = [{ id: 'f1', ruleId: 'auth-bypass', file: 'a.ts' }];
    const orchestrator = new RemediationOrchestrator(findings, { 
      spawner: mockSpawner, 
      escalationHandler: mockEscalationHandler 
    });
    
    const startPromise = orchestrator.start();
    await tick();
    
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick();
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick();
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick(); // Deep research triggers and spawns again

    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' }); // Final fail
    const stateObj = await startPromise;

    expect(stateObj.failedFindings).toContain('f1');
    expect(stateObj.outcome).toBe('ESCALATED');
  });

  it('escalates to HUMAN_REQUIRED for CRITICAL unresolved finding after deep research and prompts abort/revert', async () => {
    const mockEscalationHandler = {
      escalate: vi.fn().mockResolvedValue({
        classification: 'auto-applicable',
        researchContent: 'content',
        spotlightedContent: '<DEEP_RESEARCH_RESULT>content</DEEP_RESEARCH_RESULT>',
      }),
      handlePolicyDecision: vi.fn().mockResolvedValue('aborted')
    } as any;

    const findings = [{ id: 'f1', ruleId: 'CRITICAL', file: 'a.ts' }];
    const orchestrator = new RemediationOrchestrator(findings, { 
      spawner: mockSpawner, 
      escalationHandler: mockEscalationHandler 
    });
    
    const startPromise = orchestrator.start();
    await tick();
    
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick();
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick();
    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });
    await tick(); // Deep research triggers and spawns again

    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' }); // Final fail
    const stateObj = await startPromise;

    expect(mockEscalationHandler.handlePolicyDecision).toHaveBeenCalled();
    expect(stateObj.outcome).toBe('HUMAN_REQUIRED');
  });
});
