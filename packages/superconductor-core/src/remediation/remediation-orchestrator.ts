import { DomainClassifier } from './domain-classifier';
import { RemediationStateObject, RemediationStateObjectSchema } from './remediation-state';
import { DeepResearchEscalationHandler } from './deep-research-escalation-handler';
import * as fs from 'fs/promises';
import * as path from 'path';

export type FSMState = 'IDLE' | 'ANALYZING' | 'DISPATCHING' | 'REMEDIATING' | 'RE-REVIEWING' | 'RESOLVED' | 'ESCALATED' | 'HUMAN_REQUIRED';

export interface AgentSpawner {
  /**
   * Spawns a domain agent. MUST return a cryptographically random ID (e.g. crypto.randomUUID()).
   * Sequential or predictable IDs allow sender impersonation.
   */
  spawn(domain: string, findings: any[], context: any | null): Promise<string>;
  kill(agentId: string): Promise<void>;
}

export interface ReviewResult {
  status: 'RESOLVED' | 'FAILED';
  findings?: any[];
  errorMessage?: string;
  fixDiff?: string;
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
  
  private activeAgents: Map<string, { domain: string, retryCount: number, postResearch: boolean, errorMessages: string[], priorFixDiffs: string[] }> = new Map();
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
      outcome: 'IN_PROGRESS',
      tokenUsage: {}
    };
    
    this.startPromise = new Promise((resolve) => {
      this.resolveStartPromise = resolve;
    });
  }

  getState(): FSMState {
    return this.state;
  }

  recordTokenUsage(domain: string, tokens: number): void {
    if (!this.stateObj.tokenUsage) {
      this.stateObj.tokenUsage = {};
    }
    this.stateObj.tokenUsage[domain] = (this.stateObj.tokenUsage[domain] || 0) + tokens;
  }

  async start(): Promise<RemediationStateObject> {
    try {
      this.transitionTo('ANALYZING');
      
      await this.analyze();
      
      this.transitionTo('DISPATCHING');
      await this.dispatch();
    } catch (e) {
      console.error('[RemediationOrchestrator] Fatal error during start:', e);
      this.complete('ESCALATED');
    }
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
      for (const f of batch) {
        this.stateObj.findingIndex[f.id] = f;
      }
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

  private async spawnForDomain(domain: string, postResearch: boolean, extraContext: any = null, errorMessages: string[] = [], priorFixDiffs: string[] = []) {
    const agentId = await this.spawner.spawn(domain, this.domainBatches[domain], extraContext);
    this.activeAgents.set(agentId, { domain, retryCount: this.stateObj.retryCount[domain], postResearch, errorMessages, priorFixDiffs });
    
    const timeout = setTimeout(() => {
      this.handleTimeout(agentId);
    }, 10 * 60 * 1000); // 10 mins
    this.timeoutHandles.set(agentId, timeout);
  }

  private recordFailedFindings(domain: string): void {
    this.stateObj.failedFindings.push(...this.domainBatches[domain].map(f => f.id));
  }

  private handleTimeout(agentId: string) {
    if (!this.activeAgents.has(agentId)) return;
    const { domain } = this.activeAgents.get(agentId)!;
    this.recordFailedFindings(domain);
    this.spawner.kill(agentId);
    this.activeAgents.delete(agentId);
    this.complete('ESCALATED');
  }

  handleReviewResult(senderId: string, result: ReviewResult): void {
    if (this.state === 'RESOLVED' || this.state === 'ESCALATED' || this.state === 'HUMAN_REQUIRED') return;
    
    const agentInfo = this.activeAgents.get(senderId);
    if (!agentInfo) return;

    const timeout = this.timeoutHandles.get(senderId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeoutHandles.delete(senderId);
    }

    this.transitionTo('RE-REVIEWING');
    this.activeAgents.delete(senderId);

    const { domain, postResearch, errorMessages, priorFixDiffs } = agentInfo;

    if (result.status === 'RESOLVED') {
      this.stateObj.fixedFindings.push(...this.domainBatches[domain].map(f => f.id));
      this.pendingAgents--;
      if (this.pendingAgents === 0) {
        this.complete('RESOLVED');
      } else {
        this.transitionTo('REMEDIATING');
      }
    } else {
      if (result.errorMessage) errorMessages.push(this.sanitizeErrorMessage(result.errorMessage));
      if (result.fixDiff) priorFixDiffs.push(result.fixDiff);

      if (postResearch) {
        // failed even after deep research — FSM must always reach a terminal state
        this.recordFailedFindings(domain);
        this.handlePostResearchFailure(domain).catch(e => {
          console.error('[RemediationOrchestrator] Unhandled error in handlePostResearchFailure:', e);
          this.complete('ESCALATED');
        });
        return;
      }
      
      this.stateObj.retryCount[domain]++;
      
      if (this.stateObj.retryCount[domain] >= 3) {
        if (this.escalationHandler) {
          this.triggerDeepResearch(domain, errorMessages, priorFixDiffs).catch(e => {
            console.error('[RemediationOrchestrator] Unhandled error in triggerDeepResearch:', e);
            this.recordFailedFindings(domain);
            this.complete('ESCALATED');
          });
        } else {
          this.recordFailedFindings(domain);
          this.complete('ESCALATED');
        }
      } else {
        this.transitionTo('REMEDIATING');
        this.spawnForDomain(domain, false, null, errorMessages, priorFixDiffs).catch(e => {
          console.error('[RemediationOrchestrator] Unhandled error in spawnForDomain (retry):', e);
          this.recordFailedFindings(domain);
          this.complete('ESCALATED');
        });
      }
    }
  }

  private async triggerDeepResearch(domain: string, errorMessages: string[], priorFixDiffs: string[]) {
    if (!this.escalationHandler) return;
    
    // Process the first finding in the batch for escalation simplicity in this context
    const finding = this.domainBatches[domain][0];
    
    let codeContext: string;
    if (finding.file) {
      try {
        const workspaceRoot = process.cwd();
        const resolvedPath = path.resolve(finding.file);
        if (!resolvedPath.startsWith(workspaceRoot + path.sep) && resolvedPath !== workspaceRoot) {
          const msg = `[RemediationOrchestrator] Path traversal blocked: '${finding.file}' is outside workspace root.`;
          console.error(msg);
          errorMessages.push(this.sanitizeErrorMessage(msg));
          codeContext = '(file access denied: outside workspace)';
        } else {
          codeContext = await fs.readFile(finding.file, 'utf8');
        }
      } catch (e) {
        const msg = `[RemediationOrchestrator] Failed to read code context from '${finding.file}': ${(e as Error).message}`;
        console.error(msg);
        errorMessages.push(this.sanitizeErrorMessage(msg));
        codeContext = `(file unreadable: ${(finding.file)})`;
      }
    } else {
      codeContext = '(no file path provided for this finding)';
    }
    
    const request = {
      finding,
      codeContext,
      errorMessages,
      priorFixDiffs
    };
    
    const researchResult = await this.escalationHandler.escalate(request);
    
    this.stateObj.deepResearchResults[finding.id] = researchResult.spotlightedContent;

    if (researchResult.classification === 'policy-decision-required') {
      const decision = await this.escalationHandler.handlePolicyDecision(researchResult);
      if (decision === 'aborted' || decision === 'reverted') {
        this.recordFailedFindings(domain);
        this.complete('HUMAN_REQUIRED');
      } else {
        this.recordFailedFindings(domain);
        this.complete('HUMAN_REQUIRED');
      }
    } else {
      this.transitionTo('REMEDIATING');
      await this.spawnForDomain(domain, true, { deepResearchResult: researchResult.spotlightedContent }, errorMessages, priorFixDiffs);
    }
  }

  private async handlePostResearchFailure(domain: string) {
    const finding = this.domainBatches[domain][0];
    const hasCritical = this.domainBatches[domain].some(
      (f: any) => f.ruleId === 'CRITICAL' || f.severity === 'CRITICAL'
    );
    if (hasCritical) {
      if (this.escalationHandler) {
        try {
          const deepResearchResultContent = this.stateObj.deepResearchResults[finding.id] || '';
          const decision = await this.escalationHandler.handlePolicyDecision({
             classification: 'policy-decision-required',
             researchContent: `CRITICAL finding ${finding.id} unresolved after deep research.`,
             spotlightedContent: deepResearchResultContent,
             policyRationale: `Finding ${finding.id} (${finding.ruleId}) failed remediation repeatedly.`
          });
          if (decision === 'aborted' || decision === 'reverted') {
            this.complete('HUMAN_REQUIRED');
            return;
          }
        } catch (e) {
          console.error(e);
          throw e;
        }
      }
      this.complete('HUMAN_REQUIRED');
    } else {
      this.complete('ESCALATED');
    }
  }

  private sanitizeErrorMessage(msg: string): string {
    // Strip common prompt injection patterns
    return msg
      .replace(/<\/?[a-zA-Z][^>]*>/g, '') // strip XML/HTML tags
      .replace(/\[INST\]|\[\/INST\]|###\s*(System|Human|Assistant):/gi, '') // strip instruction markers
      .slice(0, 2000); // cap length
  }

  private complete(outcome: 'RESOLVED' | 'ESCALATED' | 'HUMAN_REQUIRED') {
    this.stateObj.outcome = outcome;
    this.transitionTo(outcome);
    
    for (const timeout of this.timeoutHandles.values()) {
      clearTimeout(timeout);
    }
    this.timeoutHandles.clear();

    for (const [agentId] of this.activeAgents) {
      this.spawner.kill(agentId).catch(() => {});
    }
    this.activeAgents.clear();
    
    this.resolveStartPromise(this.stateObj);
  }
}
