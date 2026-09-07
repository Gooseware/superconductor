export interface EscalationRequest {
  finding: any;
  codeContext?: string;
  errorMessages?: string[];
  priorFixDiffs?: string[];
  trackId?: string;
  threadId?: string;
  errorContext?: { stack?: string; [key: string]: any } | string;
  priorDiff?: string;
  [key: string]: any;
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

export const POLICY_KEYWORDS = [
  'breaking change',
  'architectural',
  'compliance',
  'CVE',
  'security policy',
  'requires migration',
  'deprecation',
  'vulnerability',
  'exploit',
  'arbitrary code',
  'remote code execution',
  'rce',
  'privilege escalation'
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
    
    const findingText = typeof request.finding === 'string'
      ? request.finding
      : (request.finding?.message || request.finding?.description || (request.finding ? JSON.stringify(request.finding) : ''));
    const lowerContent = `${researchContent}\n${findingText}`.toLowerCase();
    
    const matchedKeywords = POLICY_KEYWORDS.filter(keyword => {
      const lowerKw = keyword.toLowerCase();
      if (lowerKw.length <= 4) {
        const regex = new RegExp(`\\b${lowerKw}\\b`, 'i');
        return regex.test(lowerContent);
      }
      return lowerContent.includes(lowerKw);
    });

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

  static async escalateWithRouter(
    request: EscalationRequest,
    router?: any,
    options?: { threadId?: string; trackId?: string }
  ): Promise<EscalationResult & { threadId?: string }> {
    return new DeepResearchEscalationHandler().escalateWithRouter(request, router, options);
  }

  async escalateWithRouter(
    request: EscalationRequest,
    router?: any,
    options?: { threadId?: string; trackId?: string }
  ): Promise<EscalationResult & { threadId?: string }> {
    const findingText = typeof request.finding === 'string'
      ? request.finding
      : (request.finding?.message || request.finding?.description || JSON.stringify(request.finding || {}));

    const errorTraces: string[] = [];
    if (Array.isArray(request.errorMessages)) {
      errorTraces.push(...request.errorMessages);
    }
    if (request.errorContext) {
      if (typeof request.errorContext === 'string') {
        errorTraces.push(request.errorContext);
      } else if (typeof request.errorContext === 'object' && request.errorContext.stack) {
        errorTraces.push(request.errorContext.stack);
      } else {
        errorTraces.push(JSON.stringify(request.errorContext));
      }
    }

    const diffs: string[] = [];
    if (Array.isArray(request.priorFixDiffs)) {
      diffs.push(...request.priorFixDiffs);
    }
    if (request.priorDiff) {
      diffs.push(request.priorDiff);
    }

    const queryParts: string[] = [
      `Finding: ${findingText}`,
      `Failure Traces:\n${errorTraces.length > 0 ? errorTraces.join('\n') : 'None'}`,
      `Failing Diffs:\n${diffs.length > 0 ? diffs.join('\n') : 'None'}`,
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
      const trackId = options?.trackId || request.trackId || 'remediation';
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

    const combinedContent = `${researchContent}\n${findingText}`;
    const lowerContent = combinedContent.toLowerCase();

    const matchedKeywords = POLICY_KEYWORDS.filter(keyword => {
      const lowerKw = keyword.toLowerCase();
      if (lowerKw.length <= 4) {
        const regex = new RegExp(`\\b${lowerKw}\\b`, 'i');
        return regex.test(lowerContent);
      }
      return lowerContent.includes(lowerKw);
    });

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

  static async handlePolicyDecision(
    result: EscalationResult,
    prompter?: Prompter
  ): Promise<'aborted' | 'reverted' | 'deferred'> {
    return new DeepResearchEscalationHandler(undefined, prompter).handlePolicyDecision(result, prompter);
  }

  async handlePolicyDecision(
    result: EscalationResult,
    prompter?: Prompter
  ): Promise<'aborted' | 'reverted' | 'deferred'> {
    const activePrompter = prompter || this.prompter;
    if (!activePrompter) {
      throw new Error("Prompter must be provided to handle policy decisions");
    }

    const question = `A policy decision is required for this fix:\n${result.policyRationale}\nHow would you like to proceed?`;
    const options = ['Acknowledge & Abort', 'Acknowledge & Revert'];
    
    const answer = await activePrompter.askQuestion(question, options);

    if (answer === 'Acknowledge & Abort') {
      return 'aborted';
    } else if (answer === 'Acknowledge & Revert') {
      return 'reverted';
    }
    
    return 'deferred';
  }
}

