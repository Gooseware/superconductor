import { DomainClassifier } from './domain-classifier';
import { RemediationStateObject, RemediationStateObjectSchema } from './remediation-state';
import { DeepResearchEscalationHandler } from './deep-research-escalation-handler';

export type FSMState = 'IDLE' | 'ANALYZING' | 'DISPATCHING' | 'REMEDIATING' | 'RE-REVIEWING' | 'RESOLVED' | 'ESCALATED' | 'HUMAN_REQUIRED';

export interface AgentSpawner {
  spawn(domain: string, findings: any[], context: any | null): Promise<string>;
  kill(agentId: string): Promise<void>;
}

export interface ReviewResult {
  status: 'RESOLVED' | 'FAILED';
  findings?: any[];
}

export interface OrchestratorOptions {
  spawner: AgentSpawner;
  escalationHandler?: DeepResearchEscalationHandler;
}

export class RemediationOrchestrator {
  private state: FSMState = 'IDLE';
  private findings: any[];
  private spawner: AgentSpawner;
  private classifier: DomainClassifier;
  private stateObj: RemediationStateObject;
  private escalationHandler?: DeepResearchEscalationHandler;
  
  private activeAgents: Map<string, { domain: string, retryCount: number, postResearch: boolean }> = new Map();
  private pendingAgents: number = 0;
  private resolveStartPromise!: (value: RemediationStateObject) => void;
  private startPromise: Promise<RemediationStateObject>;
  private domainBatches: Record<string, any[]> = {};
  
  private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();

  constructor(findings: any[], options: OrchestratorOptions) {
    this.findings = findings;
    this.spawner = options.spawner;
    this.escalationHandler = options.escalationHandler;
    this.classifier = new DomainClassifier();
    this.stateObj = {
      findingIndex: {},
      domainAssignments: {},
      retryCount: {},
      deepResearchResults: {},
      fixedFindings: [],
      failedFindings: [],
      outcome: 'IN_PROGRESS'
    };
    
    this.startPromise = new Promise((resolve) => {
      this.resolveStartPromise = resolve;
    });
  }

  getState(): FSMState {
    return this.state;
  }

  async start(): Promise<RemediationStateObject> {
    this.transitionTo('ANALYZING');
    
    await this.analyze();
    
    this.transitionTo('DISPATCHING');
    await this.dispatch();
    
    return this.startPromise;
  }

  private transitionTo(newState: FSMState) {
    this.state = newState;
  }

  private async analyze() {
    this.domainBatches = await this.classifier.groupByDomain(this.findings);
    for (const [domain, batch] of Object.entries(this.domainBatches)) {
      this.stateObj.domainAssignments[domain] = batch.map(f => f.id);
      this.stateObj.retryCount[domain] = 0;
    }
  }

  private async dispatch() {
    const domains = Object.keys(this.domainBatches);
    if (domains.length === 0) {
      this.complete('RESOLVED');
      return;
    }

    this.pendingAgents = domains.length;
    this.transitionTo('REMEDIATING');

    for (const domain of domains) {
      await this.spawnForDomain(domain, false);
    }
  }

  private async spawnForDomain(domain: string, postResearch: boolean, extraContext: any = null) {
    const agentId = await this.spawner.spawn(domain, this.domainBatches[domain], extraContext);
    this.activeAgents.set(agentId, { domain, retryCount: this.stateObj.retryCount[domain], postResearch });
    
    const timeout = setTimeout(() => {
      this.handleTimeout(agentId);
    }, 10 * 60 * 1000); // 10 mins
    this.timeoutHandles.set(agentId, timeout);
  }

  private handleTimeout(agentId: string) {
    if (!this.activeAgents.has(agentId)) return;
    const { domain } = this.activeAgents.get(agentId)!;
    this.stateObj.failedFindings.push(...this.domainBatches[domain].map(f => f.id));
    this.spawner.kill(agentId);
    this.activeAgents.delete(agentId);
    this.complete('ESCALATED');
  }

  handleReviewResult(senderId: string, result: ReviewResult): void {
    const agentInfo = this.activeAgents.get(senderId);
    if (!agentInfo) return;

    const timeout = this.timeoutHandles.get(senderId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeoutHandles.delete(senderId);
    }

    this.transitionTo('RE-REVIEWING');
    this.activeAgents.delete(senderId);

    const { domain, postResearch } = agentInfo;

    if (result.status === 'RESOLVED') {
      this.stateObj.fixedFindings.push(...this.domainBatches[domain].map(f => f.id));
      this.pendingAgents--;
      if (this.pendingAgents === 0) {
        this.complete('RESOLVED');
      } else {
        this.transitionTo('REMEDIATING');
      }
    } else {
      if (postResearch) {
        // failed even after deep research
        this.stateObj.failedFindings.push(...this.domainBatches[domain].map(f => f.id));
        this.handlePostResearchFailure(domain).catch(e => console.error(e));
        return;
      }
      
      this.stateObj.retryCount[domain]++;
      
      if (this.stateObj.retryCount[domain] >= 3) {
        if (this.escalationHandler) {
          this.triggerDeepResearch(domain).catch(e => console.error(e));
        } else {
          this.stateObj.failedFindings.push(...this.domainBatches[domain].map(f => f.id));
          this.complete('ESCALATED');
        }
      } else {
        this.transitionTo('REMEDIATING');
        this.spawnForDomain(domain, false);
      }
    }
  }

  private async triggerDeepResearch(domain: string) {
    if (!this.escalationHandler) return;
    
    // Process the first finding in the batch for escalation simplicity in this context
    const finding = this.domainBatches[domain][0];
    
    const request = {
      finding,
      codeContext: 'Simulated context',
      errorMessages: ['Previous fixes failed'],
      priorFixDiffs: []
    };
    
    const researchResult = await this.escalationHandler.escalate(request);
    
    this.stateObj.deepResearchResults[finding.id] = researchResult.spotlightedContent;

    if (researchResult.classification === 'policy-decision-required') {
      const decision = await this.escalationHandler.handlePolicyDecision(researchResult);
      if (decision === 'aborted' || decision === 'reverted') {
        this.stateObj.failedFindings.push(...this.domainBatches[domain].map(f => f.id));
        this.complete('HUMAN_REQUIRED');
      }
    } else {
      this.transitionTo('REMEDIATING');
      await this.spawnForDomain(domain, true, { deepResearchResult: researchResult.spotlightedContent });
    }
  }

  private async handlePostResearchFailure(domain: string) {
    const finding = this.domainBatches[domain][0];
    if (finding.ruleId === 'CRITICAL' || finding.severity === 'CRITICAL') {
      if (this.escalationHandler) {
        try {
          const decision = await this.escalationHandler.handlePolicyDecision({
             classification: 'policy-decision-required',
             researchContent: 'CRITICAL finding unresolved after deep research',
             spotlightedContent: '',
             policyRationale: 'CRITICAL finding unresolved after deep research'
          });
        } catch (e) {}
      }
      this.complete('HUMAN_REQUIRED');
    } else {
      this.complete('ESCALATED');
    }
  }

  private complete(outcome: 'RESOLVED' | 'ESCALATED' | 'HUMAN_REQUIRED') {
    this.stateObj.outcome = outcome;
    this.transitionTo(outcome);
    
    for (const timeout of this.timeoutHandles.values()) {
      clearTimeout(timeout);
    }
    this.timeoutHandles.clear();
    
    this.resolveStartPromise(this.stateObj);
  }
}
