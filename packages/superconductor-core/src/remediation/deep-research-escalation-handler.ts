export interface EscalationRequest {
  finding: any;
  codeContext: string;
  errorMessages: string[];
  priorFixDiffs: string[];
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
    private researchProvider: ResearchProvider,
    private prompter?: Prompter
  ) {}

  async escalate(request: EscalationRequest): Promise<EscalationResult> {
    const researchContent = await this.researchProvider.research(request);
    
    const spotlightedContent = `<DEEP_RESEARCH_RESULT>\n${researchContent}\n</DEEP_RESEARCH_RESULT>`;
    
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
