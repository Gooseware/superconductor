import { describe, it, expect, vi } from 'vitest';
import { DeepResearchEscalationHandler, ResearchProvider, EscalationRequest, Prompter } from './deep-research-escalation-handler';

describe('DeepResearchEscalationHandler', () => {
  it('should include prior fix diffs in the research request', async () => {
    const mockProvider: ResearchProvider = {
      research: vi.fn().mockResolvedValue('Some generic research result about fixing the code.')
    };
    const handler = new DeepResearchEscalationHandler(mockProvider);
    
    const request: EscalationRequest = {
      finding: { id: 'F1' },
      codeContext: 'function test() {}',
      errorMessages: ['Error: fail'],
      priorFixDiffs: ['- function test() {}\n+ function test(a) {}']
    };

    await handler.escalate(request);

    expect(mockProvider.research).toHaveBeenCalledWith(
      expect.objectContaining({
        priorFixDiffs: ['- function test() {}\n+ function test(a) {}']
      })
    );
  });

  it('should wrap research result in spotlighting delimiters', async () => {
    const mockProvider: ResearchProvider = {
      research: vi.fn().mockResolvedValue('Research output content')
    };
    const handler = new DeepResearchEscalationHandler(mockProvider);
    
    const result = await handler.escalate({
      finding: {},
      codeContext: '',
      errorMessages: [],
      priorFixDiffs: []
    });

    expect(result.spotlightedContent).toBe('<DEEP_RESEARCH_RESULT>\nResearch output content\n</DEEP_RESEARCH_RESULT>');
  });

  it('should classify as auto-applicable and include suggestedFix if no policy keywords found', async () => {
    const mockProvider: ResearchProvider = {
      research: vi.fn().mockResolvedValue('Here is the code to fix the issue: change x to y.')
    };
    const handler = new DeepResearchEscalationHandler(mockProvider);
    
    const result = await handler.escalate({
      finding: {},
      codeContext: '',
      errorMessages: [],
      priorFixDiffs: []
    });

    expect(result.classification).toBe('auto-applicable');
    expect(result.suggestedFix).toBe('Here is the code to fix the issue: change x to y.');
    expect(result.policyRationale).toBeUndefined();
  });

  it('should classify as policy-decision-required if policy keywords are present', async () => {
    const mockProvider: ResearchProvider = {
      research: vi.fn().mockResolvedValue('This fix involves a breaking change and requires migration.')
    };
    const handler = new DeepResearchEscalationHandler(mockProvider);
    
    const result = await handler.escalate({
      finding: {},
      codeContext: '',
      errorMessages: [],
      priorFixDiffs: []
    });

    expect(result.classification).toBe('policy-decision-required');
    expect(result.policyRationale).toBeDefined();
    expect(result.policyRationale).toContain('breaking change');
    expect(result.suggestedFix).toBeUndefined();
  });

  it('should handle policy decision with Acknowledge & Abort returning aborted', async () => {
    const mockPrompter: Prompter = {
      askQuestion: vi.fn().mockResolvedValue('Acknowledge & Abort')
    };
    const handler = new DeepResearchEscalationHandler({ research: vi.fn() }, mockPrompter);
    
    const action = await handler.handlePolicyDecision({
      classification: 'policy-decision-required',
      researchContent: 'breaking change detected',
      spotlightedContent: '<DEEP_RESEARCH_RESULT>breaking change detected</DEEP_RESEARCH_RESULT>',
      policyRationale: 'breaking change detected'
    });

    expect(action).toBe('aborted');
    expect(mockPrompter.askQuestion).toHaveBeenCalledWith(
      expect.any(String),
      ['Acknowledge & Abort', 'Acknowledge & Revert']
    );
  });

  it('should handle policy decision with Acknowledge & Revert returning reverted', async () => {
    const mockPrompter: Prompter = {
      askQuestion: vi.fn().mockResolvedValue('Acknowledge & Revert')
    };
    const handler = new DeepResearchEscalationHandler({ research: vi.fn() }, mockPrompter);
    
    const action = await handler.handlePolicyDecision({
      classification: 'policy-decision-required',
      researchContent: 'security policy updated',
      spotlightedContent: '<DEEP_RESEARCH_RESULT>security policy updated</DEEP_RESEARCH_RESULT>',
      policyRationale: 'security policy updated'
    });

    expect(action).toBe('reverted');
  });
});
