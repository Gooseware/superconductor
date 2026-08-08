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
    private orchestratorFactory: (findings: FindingFingerprint[]) => Pick<RemediationOrchestrator, 'start'>,
    private domainClassifier: DomainClassifier
  ) {}

  public async run(reportContent: string, flags: RemediationFlags = {}): Promise<void> {
    const findings = this.parseFindings(reportContent, flags);
    
    // Group by domain
    const domains = new Set<string>();
    for (const finding of findings) {
      const domain = this.domainClassifier.classify(finding.file || '');
      domains.add(domain);
    }

    const orchestrator = this.orchestratorFactory(findings);
    await orchestrator.start();
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
