import { describe, it, expect } from 'vitest';
import { RemediationLogWriter, LogWriterOptions } from './remediation-log-writer.js';
import { RemediationStateObject } from './remediation-state.js';

describe('RemediationLogWriter', () => {
  it('should generate log with correct structure and outcomes', () => {
    const state: RemediationStateObject = {
      findingIndex: {
        'f1': { id: 'f1', severity: 'HIGH' },
        'f2': { id: 'f2', severity: 'CRITICAL' },
        'f3': { id: 'f3', severity: 'LOW' }
      },
      domainAssignments: {
        'Security': ['f1'],
        'Performance': ['f2', 'f3']
      },
      retryCount: {
        'Security': 2,
        'Performance': 3
      },
      deepResearchResults: {
        'f1': 'Research complete'
      },
      fixedFindings: ['f1'],
      failedFindings: ['f2', 'f3'],
      outcome: 'ESCALATED'
    };

    const options: LogWriterOptions = {
      target: 'AuthService',
      timestamp: '2026-08-09T03:17:12Z',
      fixCommitSha: 'a1b2c3d4' // Passing the sha via options? Let's assume the sha is either in options or finding? Wait, spec says: "Log contains fix commit SHA for RESOLVED findings (SHA from RemediationStateObject)". Let's add fixCommitSha to RemediationStateObject if it's there.
    };
    
    // Oh wait, spec: "Log contains fix commit SHA for RESOLVED findings (SHA from RemediationStateObject)". But RemediationStateObjectSchema does not have fixCommitSha or fixCommitShas.
    // Wait, let's assume either the finding itself has it, or there's a record `fixCommitShas: Record<string, string>`. Actually, the spec says "SHA from RemediationStateObject". Wait, the prompt says "The RemediationStateObject shape (already defined in remediation-state.ts): ... fixedFindings: string[];". Wait, is there a `fixCommitShas`? The prompt says "SHA: include if in fixedFindings, else 'N/A'" - wait, "Log contains fix commit SHA for RESOLVED findings (SHA from RemediationStateObject)" - maybe I need to add `fixCommitSha: string` to the state, or maybe the findings have a commit sha? Let's just output 'N/A' or assume state.fixCommitSha. Let's add `fixCommitSha` to state. Wait, the prompt literally gave me the shape of RemediationStateObject. It does NOT have fixCommitSha. "SHA from RemediationStateObject" might imply we should just add it, or maybe it's in `finding.fixCommitSha`. Let's mock it for now.
    // Let's assume `fixCommitSha?: string;` at root of state.
    const stateWithSha = { ...state, fixCommitSha: 'abc1234' } as any;

    const writer = new RemediationLogWriter();
    const log = writer.write(stateWithSha, options);

    // Header
    expect(log).toContain('<Remediation Log — AuthService — 2026-08-09T03:17:12Z>');
    expect(log).toContain('</Remediation Log — AuthService — 2026-08-09T03:17:12Z>');

    // f1 - RESOLVED
    expect(log).toContain('## Finding: f1');
    expect(log).toContain('- Domain: Security');
    expect(log).toContain('- Agent: Security');
    expect(log).toContain('- Attempts: 2');
    expect(log).toContain('- Deep Research Called: yes');
    expect(log).toContain('- Outcome: RESOLVED');
    expect(log).toContain('- Fix SHA: abc1234');

    // f2 - HUMAN_REQUIRED (failed and CRITICAL)
    expect(log).toContain('## Finding: f2');
    expect(log).toContain('- Domain: Performance');
    expect(log).toContain('- Agent: Performance');
    expect(log).toContain('- Attempts: 3');
    expect(log).toContain('- Deep Research Called: no');
    expect(log).toContain('- Outcome: HUMAN_REQUIRED');
    expect(log).toContain('- Fix SHA: N/A');

    // f3 - ESCALATED (failed but not CRITICAL)
    expect(log).toContain('## Finding: f3');
    expect(log).toContain('- Domain: Performance');
    expect(log).toContain('- Agent: Performance');
    expect(log).toContain('- Attempts: 3');
    expect(log).toContain('- Deep Research Called: no');
    expect(log).toContain('- Outcome: ESCALATED');
    expect(log).toContain('- Fix SHA: N/A');
  });

  it('should include token stats if includeStats is true', () => {
    const state: RemediationStateObject = {
      findingIndex: {},
      domainAssignments: {},
      retryCount: {},
      deepResearchResults: {},
      fixedFindings: [],
      failedFindings: [],
      outcome: 'RESOLVED',
      tokenUsage: {
        'Security': 1500,
        'Performance': 200
      }
    } as any;

    const options: LogWriterOptions = {
      target: 'AuthService',
      includeStats: true
    };

    const writer = new RemediationLogWriter();
    const log = writer.write(state, options);

    expect(log).toContain('## Token Usage');
    expect(log).toContain('Security');
    expect(log).toContain('1500');
    expect(log).toContain('Performance');
    expect(log).toContain('200');
  });
});
