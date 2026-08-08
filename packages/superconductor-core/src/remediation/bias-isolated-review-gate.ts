export interface FindingFingerprint {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ADVISORY';
  ruleId: string;
  file: string;
}

export interface ReviewFindings {
  description: string;
  file: string;
  ruleId: string;
}

export interface GateResult {
  status: 'RESOLVED' | 'UNRESOLVED';
  senderId: string;
  findings: ReviewFindings[];
}

export interface ReviewerSpawner {
  spawn(context: any): Promise<string>;
}

export class BiasIsolatedReviewGate {
  private spawner: ReviewerSpawner;
  private pendingEvals: Map<string, (result: GateResult) => void>;

  constructor(spawner: ReviewerSpawner) {
    this.spawner = spawner;
    this.pendingEvals = new Map();
  }

  async evaluate(fingerprint: FindingFingerprint, diff: string, preflightOutput: string): Promise<GateResult> {
    const strippedFingerprint = {
      id: fingerprint.id,
      severity: fingerprint.severity,
      ruleId: fingerprint.ruleId,
      file: fingerprint.file,
    };

    const context = {
      fingerprint: strippedFingerprint,
      diff,
      preflightOutput
    };

    const agentId = await this.spawner.spawn(context);

    return new Promise((resolve) => {
      this.pendingEvals.set(agentId, resolve);
    });
  }

  handleResponse(senderId: string, response: string): void {
    const resolve = this.pendingEvals.get(senderId);
    if (!resolve) {
      throw new Error(`Unknown SenderID: ${senderId}`);
    }

    // Parse json:review-findings block
    const blockMatch = response.match(/```json:review-findings\n([\s\S]*?)\n```/);
    if (!blockMatch) {
      resolve({
        status: 'UNRESOLVED',
        senderId,
        findings: [{ description: 'Invalid review format', file: '', ruleId: '' }]
      });
      this.pendingEvals.delete(senderId);
      return;
    }

    try {
      const parsed = JSON.parse(blockMatch[1]);
      
      if (parsed.status === 'RESOLVED' && (!parsed.findings || parsed.findings.length === 0)) {
        resolve({
          status: 'RESOLVED',
          senderId,
          findings: []
        });
      } else {
        resolve({
          status: 'UNRESOLVED',
          senderId,
          findings: parsed.findings || []
        });
      }
    } catch (e) {
      resolve({
        status: 'UNRESOLVED',
        senderId,
        findings: [{ description: 'Failed to parse review findings JSON', file: '', ruleId: '' }]
      });
    }

    this.pendingEvals.delete(senderId);
  }
}
