import { RemediationOrchestrator } from './remediation-orchestrator';
import { DomainClassifier } from './domain-classifier';
import { FindingFingerprint } from './bias-isolated-review-gate';

export interface RemediationFlags {
  severity?: string;
  domain?: string;
  dryRun?: boolean;
  headless?: boolean;
  stats?: boolean;
  noDeepResearch?: boolean;
}

export class StandaloneRemediationSkillRunner {
  constructor(
    private orchestratorFactory: (findings: FindingFingerprint[], flags?: RemediationFlags) => Pick<RemediationOrchestrator, 'start'>,
    private domainClassifier: DomainClassifier
  ) {}

  public async run(reportContent: string, flags: RemediationFlags = {}): Promise<void> {
    let findings = this.parseFindings(reportContent, flags);
    
    if (flags.domain) {
      findings = findings.filter(finding => this.domainClassifier.classify(finding.file || '') === flags.domain);
    }

    if (flags.dryRun) {
      console.log(`[StandaloneRemediation] dryRun enabled. Would remediate ${findings.length} findings.`);
      return;
    }

    const orchestrator = this.orchestratorFactory(findings, flags);
    const result: any = await orchestrator.start();
    
    if (flags.stats && result) {
      console.log(`[StandaloneRemediation] Stats: ${JSON.stringify(result.tokenUsage || {})}`);
    }
  }

  private parseFindings(reportContent: string, flags: RemediationFlags): FindingFingerprint[] {
    const findingsBlockRegex = /```json:review-findings\n([\s\S]*?)\n```/;
    const match = reportContent.match(findingsBlockRegex);
    if (!match) {
      throw new Error('No json:review-findings block found in report');
    }

    let findings: any[];
    try {
      findings = JSON.parse(match[1]);
    } catch (e) {
      throw new Error('Invalid JSON in review-findings block');
    }

    let parsedFindings: FindingFingerprint[] = findings.map((f: any) => ({
      id: f.id,
      severity: f.severity,
      ruleId: f.ruleId,
      file: f.file
    }));

    if (flags.severity) {
      const severities = flags.severity.split(',').map(s => s.trim().toUpperCase());
      parsedFindings = parsedFindings.filter(f => severities.includes(f.severity.toUpperCase()));
    }

    return parsedFindings;
  }
}
