export interface EscalationRequest {
  finding: any;
  codeContext: string;
  errorMessages: string[];
  priorFixDiffs: string[];
  trackId?: string;
  threadId?: string;
}

export interface EscalationResult {
  classification: 'auto-applicable' | 'policy-decision-required';
  researchContent: string;
  spotlightedContent: string;
  policyRationale?: string;
  suggestedFix?: string;
}

export interface ResearchProvider {
  research(request: EscalationRequest): Promise<string>;
  chat?(threadId: string, message: string): Promise<string | { content: string; threadId?: string }>;
}

export interface Prompter {
  askQuestion(question: string, options: string[]): Promise<string>;
}

const POLICY_KEYWORDS = [
  'breaking change',
  'architectural',
  'compliance',
  'CVE',
  'security policy',
  'requires migration',
  'deprecation'
];

export class DeepResearchEscalationHandler {
  constructor(
    private researchProvider?: ResearchProvider,
    private prompter?: Prompter
  ) {}

  async escalate(request: EscalationRequest): Promise<EscalationResult> {
    if (!this.researchProvider) {
      throw new Error("ResearchProvider must be provided for escalate()");
    }
    const researchContent = await this.researchProvider.research(request);
    
    const sanitizedContent = researchContent.replace(/<\/DEEP_RESEARCH_RESULT>/gi, '[/DEEP_RESEARCH_RESULT]');
    const spotlightedContent = `<DEEP_RESEARCH_RESULT>\n${sanitizedContent}\n</DEEP_RESEARCH_RESULT>`;
    
    const lowerContent = researchContent.toLowerCase();
    
    const matchedKeywords = POLICY_KEYWORDS.filter(keyword => 
      lowerContent.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      return {
        classification: 'policy-decision-required',
        researchContent,
        spotlightedContent,
        policyRationale: `Found policy keywords: ${matchedKeywords.join(', ')}. Original content: ${researchContent}`
      };
    } else {
      return {
        classification: 'auto-applicable',
        researchContent,
        spotlightedContent,
        suggestedFix: researchContent
      };
    }
  }

  async escalateWithRouter(
    request: EscalationRequest,
    router?: any,
    options?: { threadId?: string }
  ): Promise<EscalationResult & { threadId?: string }> {
    const findingText = typeof request.finding === 'string'
      ? request.finding
      : (request.finding?.message || request.finding?.description || JSON.stringify(request.finding || {}));

    const queryParts: string[] = [
      `Finding: ${findingText}`,
      `Failure Traces:\n${request.errorMessages?.join('\n') || 'None'}`,
      `Failing Diffs:\n${request.priorFixDiffs?.join('\n') || 'None'}`,
      `Code Context:\n${request.codeContext || 'None'}`
    ];
    const diagnosticQuery = queryParts.join('\n\n');

    const targetRouter = router || this.researchProvider;
    if (!targetRouter) {
      throw new Error('A router or researchProvider must be provided for escalation');
    }

    let activeThreadId = options?.threadId || request.threadId;
    let researchContent = '';

    if (activeThreadId && typeof targetRouter.chat === 'function') {
      const chatRes = await targetRouter.chat(activeThreadId, diagnosticQuery);
      if (typeof chatRes === 'object' && chatRes !== null) {
        researchContent = chatRes.content || chatRes.message || JSON.stringify(chatRes);
        if (chatRes.threadId) activeThreadId = chatRes.threadId;
        else if (chatRes.thread_id) activeThreadId = chatRes.thread_id;
      } else {
        researchContent = String(chatRes);
      }
    } else if (typeof targetRouter.executeResearch === 'function') {
      const trackId = request.trackId || 'remediation';
      const execRes = await targetRouter.executeResearch(trackId, [
        { term: diagnosticQuery, intent: 'FRONTIER' }
      ]);
      if (execRes?.brief) {
        researchContent = execRes.brief.executiveSummary || '';
        if (execRes.brief.recommendedPatterns?.length) {
          researchContent += '\n' + execRes.brief.recommendedPatterns.join('\n');
        }
      } else {
        researchContent = typeof execRes === 'string' ? execRes : JSON.stringify(execRes);
      }
      if (execRes?.threadId) {
        activeThreadId = execRes.threadId;
      } else if (execRes?.thread_id) {
        activeThreadId = execRes.thread_id;
      } else if (!activeThreadId) {
        activeThreadId = `thread-${Date.now()}`;
      }
    } else if (typeof targetRouter.research === 'function') {
      const res = await targetRouter.research({
        ...request,
        diagnosticQuery,
        threadId: activeThreadId
      });
      if (typeof res === 'object' && res !== null) {
        researchContent = res.content || res.researchContent || res.text || JSON.stringify(res);
        if (res.threadId) activeThreadId = res.threadId;
        else if (res.thread_id) activeThreadId = res.thread_id;
      } else {
        researchContent = String(res);
      }
      if (!activeThreadId) {
        activeThreadId = `thread-${Date.now()}`;
      }
    } else if (typeof targetRouter === 'function') {
      const res = await targetRouter(diagnosticQuery);
      researchContent = typeof res === 'string' ? res : JSON.stringify(res);
      if (!activeThreadId) {
        activeThreadId = `thread-${Date.now()}`;
      }
    }

    const sanitizedContent = researchContent.replace(/<\/DEEP_RESEARCH_RESULT>/gi, '[/DEEP_RESEARCH_RESULT]');
    const spotlightedContent = `<DEEP_RESEARCH_RESULT>\n${sanitizedContent}\n</DEEP_RESEARCH_RESULT>`;

    const lowerContent = researchContent.toLowerCase();

    const matchedKeywords = POLICY_KEYWORDS.filter(keyword =>
      lowerContent.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      return {
        classification: 'policy-decision-required',
        researchContent,
        spotlightedContent,
        policyRationale: `Found policy keywords: ${matchedKeywords.join(', ')}. Original content: ${researchContent}`,
        threadId: activeThreadId
      };
    } else {
      return {
        classification: 'auto-applicable',
        researchContent,
        spotlightedContent,
        suggestedFix: researchContent,
        threadId: activeThreadId
      };
    }
  }

  async handlePolicyDecision(result: EscalationResult): Promise<'aborted' | 'reverted' | 'deferred'> {
    if (!this.prompter) {
      throw new Error("Prompter must be provided to handle policy decisions");
    }

    const question = `A policy decision is required for this fix:\n${result.policyRationale}\nHow would you like to proceed?`;
    const options = ['Acknowledge & Abort', 'Acknowledge & Revert'];
    
    const answer = await this.prompter.askQuestion(question, options);

    if (answer === 'Acknowledge & Abort') {
      return 'aborted';
    } else if (answer === 'Acknowledge & Revert') {
      return 'reverted';
    }
    
    return 'deferred';
  }
}
