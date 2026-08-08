import { DomainClassifier } from './domain-classifier';
import { RemediationStateObject, RemediationStateObjectSchema } from './remediation-state';

export type FSMState = 'IDLE' | 'ANALYZING' | 'DISPATCHING' | 'REMEDIATING' | 'RE-REVIEWING' | 'RESOLVED' | 'ESCALATED';

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
}

export class RemediationOrchestrator {
  private state: FSMState = 'IDLE';
  private findings: any[];
  private spawner: AgentSpawner;
  private classifier: DomainClassifier;
  private stateObj: RemediationStateObject;
  
  private activeAgents: Map<string, { domain: string, retryCount: number }> = new Map();
  private pendingAgents: number = 0;
  private resolveStartPromise!: (value: RemediationStateObject) => void;
  private startPromise: Promise<RemediationStateObject>;
  private domainBatches: Record<string, any[]> = {};
  
  private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();

  constructor(findings: any[], options: OrchestratorOptions) {
    this.findings = findings;
    this.spawner = options.spawner;
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
      await this.spawnForDomain(domain);
    }
  }

  private async spawnForDomain(domain: string) {
    const agentId = await this.spawner.spawn(domain, this.domainBatches[domain], null);
    this.activeAgents.set(agentId, { domain, retryCount: this.stateObj.retryCount[domain] });
    
    const timeout = setTimeout(() => {
      this.handleTimeout(agentId);
    }, 10 * 60 * 1000); // 10 mins
    this.timeoutHandles.set(agentId, timeout);
  }

  private handleTimeout(agentId: string) {
    if (!this.activeAgents.has(agentId)) return;
    this.spawner.kill(agentId);
    this.activeAgents.delete(agentId);
    this.complete('ESCALATED');
  }

  handleReviewResult(senderId: string, result: ReviewResult): void {
    const agentInfo = this.activeAgents.get(senderId);
    if (!agentInfo) return; // Ignore unknown SenderIDs

    const timeout = this.timeoutHandles.get(senderId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeoutHandles.delete(senderId);
    }

    this.transitionTo('RE-REVIEWING');
    this.activeAgents.delete(senderId);

    if (result.status === 'RESOLVED') {
      this.pendingAgents--;
      if (this.pendingAgents === 0) {
        this.complete('RESOLVED');
      } else {
        this.transitionTo('REMEDIATING');
      }
    } else {
      const { domain } = agentInfo;
      this.stateObj.retryCount[domain]++;
      
      if (this.stateObj.retryCount[domain] >= 3) {
        // Exceeded 2 retries (0, 1, 2 = 3 tries total, wait, max 2 retries = 3 attempts total)
        // Instructs say max 2 retries per domain batch before escalating
        this.complete('ESCALATED');
      } else {
        this.transitionTo('REMEDIATING');
        this.spawnForDomain(domain); // retry
      }
    }
  }

  private complete(outcome: 'RESOLVED' | 'ESCALATED') {
    this.stateObj.outcome = outcome;
    this.transitionTo(outcome);
    
    // Cleanup remaining timeouts
    for (const timeout of this.timeoutHandles.values()) {
      clearTimeout(timeout);
    }
    this.timeoutHandles.clear();
    
    this.resolveStartPromise(this.stateObj);
  }
}
