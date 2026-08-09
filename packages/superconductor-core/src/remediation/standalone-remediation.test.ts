import { describe, expect, it, vi } from 'vitest';
import { StandaloneRemediationSkillRunner } from './standalone-remediation.js';
import { DomainClassifier } from './domain-classifier.js';

describe('StandaloneRemediationSkillRunner', () => {
  it('parses findings, groups by domain, and calls orchestrator start', async () => {
    const reportContent = `
# Review Report

Here are the findings:

\`\`\`json:review-findings
[
  {
    "id": "f1",
    "severity": "CRITICAL",
    "ruleId": "sec-01",
    "file": "src/api/auth.ts"
  },
  {
    "id": "f2",
    "severity": "HIGH",
    "ruleId": "perf-02",
    "file": "src/ui/button.tsx"
  }
]
\`\`\`
    `;

    const mockStart = vi.fn().mockResolvedValue(undefined);
    let capturedFindings: any[] = [];
    const orchestratorFactory = (findings: any[]) => {
      capturedFindings = findings;
      return { start: mockStart };
    };

    const domainClassifier = new DomainClassifier();
    const runner = new StandaloneRemediationSkillRunner(orchestratorFactory, domainClassifier);

    await runner.run(reportContent, { severity: 'CRITICAL,HIGH' });

    expect(capturedFindings).toHaveLength(2);
    expect(capturedFindings[0].id).toBe('f1');
    expect(capturedFindings[0].severity).toBe('CRITICAL');
    expect(capturedFindings[1].id).toBe('f2');
    expect(capturedFindings[1].severity).toBe('HIGH');
    expect(mockStart).toHaveBeenCalled();
  });

  it('filters by severity if flag is provided', async () => {
    const reportContent = `
\`\`\`json:review-findings
[
  { "id": "f1", "severity": "CRITICAL", "file": "src/api.ts" },
  { "id": "f2", "severity": "LOW", "file": "src/ui.tsx" }
]
\`\`\`
    `;

    const mockStart = vi.fn().mockResolvedValue(undefined);
    let capturedFindings: any[] = [];
    const runner = new StandaloneRemediationSkillRunner((f: any[]) => {
      capturedFindings = f;
      return { start: mockStart };
    }, new DomainClassifier());

    await runner.run(reportContent, { severity: 'CRITICAL' });
    expect(capturedFindings).toHaveLength(1);
    expect(capturedFindings[0].id).toBe('f1');
  });

  it('throws if no json block found', async () => {
    const reportContent = `No JSON block here`;
    const runner = new StandaloneRemediationSkillRunner(() => ({ start: vi.fn() }), new DomainClassifier());
    await expect(runner.run(reportContent)).rejects.toThrow('No json:review-findings block found');
  });
});
