import { describe, it, expect, vi } from 'vitest';
import { DeepResearchEscalationHandler, EscalationRequest, Prompter } from '../deep-research-escalation-handler.js';

describe('DeepResearchEscalationHandler - Router Integration', () => {
  it('Invariant 2: feeds failure traces, stack traces, code context and diffs into the research router', async () => {
    const mockRouter = {
      executeResearch: vi.fn().mockResolvedValue({
        brief: {
          executiveSummary: 'Upgrade dependency to v2.1.0 to resolve breaking method signature.',
          keyFindings: [
            { category: 'OSS_DISCOVERY', description: 'Patch released in @superconductor/engine v2.1.0' }
          ],
          recommendedPatterns: ['Pass options object instead of positional arguments']
        },
        threadId: 'thread-router-test-123'
      })
    };

    const handler = new DeepResearchEscalationHandler({ research: vi.fn() });

    const request: EscalationRequest = {
      trackId: 'track-remediation-99',
      finding: { id: 'F101', message: 'TypeError: undefined is not a function at processItem' },
      codeContext: 'export function processItem(item: Item) { item.execute(); }',
      errorMessages: [
        'TypeError: undefined is not a function\n    at processItem (handler.ts:14:12)',
        'Process failed with exit code 1'
      ],
      priorFixDiffs: [
        '--- a/handler.ts\n+++ b/handler.ts\n@@ -14,1 +14,1 @@\n- item.execute();\n+ item.run();'
      ]
    };

    const result = await handler.escalateWithRouter(request, mockRouter);

    // Verify router was called with combined diagnostic query containing all error traces and diffs
    expect(mockRouter.executeResearch).toHaveBeenCalledTimes(1);
    const [trackIdArg, queriesArg] = mockRouter.executeResearch.mock.calls[0];

    expect(trackIdArg).toBe('track-remediation-99');
    expect(queriesArg).toHaveLength(1);
    const queryTerm = queriesArg[0].term;

    // Verify Invariant 2: Diagnostic query must contain failure traces, diffs, code context, and finding
    expect(queryTerm).toContain('TypeError: undefined is not a function at processItem');
    expect(queryTerm).toContain('TypeError: undefined is not a function\n    at processItem (handler.ts:14:12)');
    expect(queryTerm).toContain('Process failed with exit code 1');
    expect(queryTerm).toContain('--- a/handler.ts\n+++ b/handler.ts');
    expect(queryTerm).toContain('item.execute()');

    // Verify result classification and content
    expect(result.classification).toBe('auto-applicable');
    expect(result.researchContent).toContain('Upgrade dependency to v2.1.0');
    expect(result.spotlightedContent).toContain('<DEEP_RESEARCH_RESULT>');
    expect(result.threadId).toBe('thread-router-test-123');
  });

  it('supports multi-turn conversational follow-up with preserved threadId via chat', async () => {
    const mockRouter = {
      executeResearch: vi.fn().mockResolvedValue({
        brief: { executiveSummary: 'Initial investigation.' },
        threadId: 'thread-conv-456'
      }),
      chat: vi.fn().mockResolvedValue('Follow-up recommendation: apply patch.')
    };

    const handler = new DeepResearchEscalationHandler({ research: vi.fn() });

    // Turn 1: Initial escalation
    const turn1Request: EscalationRequest = {
      finding: 'Initial failure',
      codeContext: 'const x = 1;',
      errorMessages: ['Initial error trace'],
      priorFixDiffs: []
    };

    const turn1Result = await handler.escalateWithRouter(turn1Request, mockRouter);
    expect(turn1Result.threadId).toBe('thread-conv-456');
    expect(mockRouter.executeResearch).toHaveBeenCalledTimes(1);
    expect(mockRouter.chat).not.toHaveBeenCalled();

    // Turn 2: Follow-up escalation using preserved threadId
    const turn2Request: EscalationRequest = {
      finding: 'Second failure after applying first fix',
      codeContext: 'const x = 2;',
      errorMessages: ['Second error trace after initial fix'],
      priorFixDiffs: ['+ const x = 2;']
    };

    const turn2Result = await handler.escalateWithRouter(turn2Request, mockRouter, {
      threadId: turn1Result.threadId
    });

    expect(mockRouter.chat).toHaveBeenCalledTimes(1);
    expect(mockRouter.chat).toHaveBeenCalledWith(
      'thread-conv-456',
      expect.stringContaining('Second error trace after initial fix')
    );
    expect(turn2Result.threadId).toBe('thread-conv-456');
    expect(turn2Result.researchContent).toBe('Follow-up recommendation: apply patch.');
  });

  it('detects policy decision requirement and enables interactive prompter workflow', async () => {
    const mockRouter = {
      executeResearch: vi.fn().mockResolvedValue({
        brief: {
          executiveSummary: 'This fix introduces a breaking change to the public API and requires security policy review (CVE-2026-4412).'
        }
      })
    };

    const mockPrompter: Prompter = {
      askQuestion: vi.fn().mockResolvedValue('Acknowledge & Abort')
    };

    const handler = new DeepResearchEscalationHandler({ research: vi.fn() }, mockPrompter);

    const request: EscalationRequest = {
      finding: 'Security check failure',
      codeContext: 'function authenticate() {}',
      errorMessages: ['Vulnerability alert'],
      priorFixDiffs: []
    };

    const result = await handler.escalateWithRouter(request, mockRouter);

    expect(result.classification).toBe('policy-decision-required');
    expect(result.policyRationale).toContain('breaking change');
    expect(result.policyRationale).toContain('CVE');
    expect(result.suggestedFix).toBeUndefined();

    // Verify prompter workflow
    const decision = await handler.handlePolicyDecision(result);
    expect(decision).toBe('aborted');
    expect(mockPrompter.askQuestion).toHaveBeenCalledWith(
      expect.stringContaining('policy decision is required'),
      ['Acknowledge & Abort', 'Acknowledge & Revert']
    );
  });

  it('falls back to researchProvider when router argument is omitted', async () => {
    const mockProvider = {
      research: vi.fn().mockResolvedValue('Direct provider result with no policy keywords.')
    };

    const handler = new DeepResearchEscalationHandler(mockProvider);

    const request: EscalationRequest = {
      finding: 'Minor lint failure',
      codeContext: 'let a = 1;',
      errorMessages: ['Unused variable'],
      priorFixDiffs: []
    };

    const result = await handler.escalateWithRouter(request);

    expect(mockProvider.research).toHaveBeenCalledTimes(1);
    expect(result.classification).toBe('auto-applicable');
    expect(result.researchContent).toBe('Direct provider result with no policy keywords.');
    expect(result.threadId).toBeDefined();
  });

  it('triggers policy-decision-required for findings or research containing remote code execution, vulnerability, or exploit without explicit CVE (REV-4)', async () => {
    const mockRouter = {
      executeResearch: vi.fn().mockResolvedValue({
        brief: {
          executiveSummary: 'Identified a remote code execution exploit allowing arbitrary code execution in the parser. Recommend applying strict validation.'
        }
      })
    };

    const handler = new DeepResearchEscalationHandler({ research: vi.fn() });

    const request: EscalationRequest = {
      finding: { id: 'SEC-RCE', message: 'High severity vulnerability reported in request handling' },
      codeContext: 'eval(userInput)',
      errorMessages: ['Arbitrary execution error'],
      priorFixDiffs: []
    };

    const result = await handler.escalateWithRouter(request, mockRouter);

    expect(result.classification).toBe('policy-decision-required');
    expect(result.policyRationale).toContain('vulnerability');
    expect(result.policyRationale).toContain('exploit');
    expect(result.policyRationale).toContain('remote code execution');
    expect(result.policyRationale).toContain('arbitrary code');
    expect(result.policyRationale).not.toContain('CVE');
    expect(result.suggestedFix).toBeUndefined();
  });

  it('triggers policy-decision-required when finding message itself contains remote code execution without CVE (REV-4)', async () => {
    const mockRouter = {
      executeResearch: vi.fn().mockResolvedValue({
        brief: {
          executiveSummary: 'Use input parser helper to avoid unsafe evaluation.'
        }
      })
    };

    const handler = new DeepResearchEscalationHandler({ research: vi.fn() });

    const request: EscalationRequest = {
      finding: 'Critical remote code execution flaw in router handler',
      codeContext: 'parse(payload)',
      errorMessages: [],
      priorFixDiffs: []
    };

    const result = await handler.escalateWithRouter(request, mockRouter);

    expect(result.classification).toBe('policy-decision-required');
    expect(result.policyRationale).toContain('remote code execution');
    expect(result.policyRationale).not.toContain('CVE');
    expect(result.suggestedFix).toBeUndefined();
  });

  it('does not falsely trigger rce on words containing rce such as source or resource', async () => {
    const mockRouter = {
      executeResearch: vi.fn().mockResolvedValue({
        brief: {
          executiveSummary: 'Reference the open source library resource for standard implementation.'
        }
      })
    };

    const handler = new DeepResearchEscalationHandler({ research: vi.fn() });

    const request: EscalationRequest = {
      finding: 'Clean helper refactor',
      codeContext: 'const x = 1;',
      errorMessages: [],
      priorFixDiffs: []
    };

    const result = await handler.escalateWithRouter(request, mockRouter);

    expect(result.classification).toBe('auto-applicable');
    expect(result.suggestedFix).toBeDefined();
  });
});
