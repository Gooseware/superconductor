import { describe, it, expect } from 'vitest';
import { evaluatePhaseGate, preparePhaseGateContext } from '../src/review/swarm-phase-gate.js';
import { ReviewFinding } from '../src/review/aggregate-findings.js';

describe('SwarmPhaseGate', () => {
  it('should format minimal context correctly', () => {
    const context = preparePhaseGateContext('Fix login bug', 'diff --git a/a b/b', ['src/login.ts']);
    expect(context).toContain('[TASK SPEC]\nFix login bug');
    expect(context).toContain('[MODIFIED FILES]\nsrc/login.ts');
    expect(context).toContain('[GIT DIFF]\ndiff --git');
  });

  it('should PASS if no CRITICAL findings are found', () => {
    const raw_text = `
\`\`\`review-findings
[
  {
    "finding_id": "F1",
    "reviewer_id": "r1",
    "file": "foo.ts",
    "line_range": "L1-L2",
    "severity": "medium",
    "category": "style",
    "description": "desc",
    "recommendation": "rec",
    "is_security_critical": false
  }
]
\`\`\`
    `;

    const result = evaluatePhaseGate({
      reviewerOutputs: [{ reviewer_id: 'r1', raw_text }],
      retryCount: 0
    });

    expect(result.status).toBe('PASS');
    expect(result.next_action).toBe('PROCEED');
    expect(result.critical_findings.length).toBe(0);
    expect(result.advisory_findings.length).toBe(1);
  });

  it('should REJECT and AUTO_REMEDIATE if a CRITICAL finding is found and retryCount < 2', () => {
    const raw_text = `
\`\`\`review-findings
[
  {
    "finding_id": "F2",
    "reviewer_id": "r2",
    "file": "bar.ts",
    "line_range": "L1-L2",
    "severity": "critical",
    "category": "security",
    "description": "desc",
    "recommendation": "rec",
    "is_security_critical": true
  }
]
\`\`\`
    `;

    const result = evaluatePhaseGate({
      reviewerOutputs: [{ reviewer_id: 'r2', raw_text }],
      retryCount: 1
    });

    expect(result.status).toBe('REJECT');
    expect(result.next_action).toBe('AUTO_REMEDIATE');
    expect(result.critical_findings.length).toBe(1);
  });

  it('should ESCALATE to MANUAL_ESCALATION if a CRITICAL finding is found and retryCount >= 2', () => {
    const raw_text = `
\`\`\`review-findings
[
  {
    "finding_id": "F3",
    "reviewer_id": "r3",
    "file": "baz.ts",
    "line_range": "L1-L2",
    "severity": "critical",
    "category": "security",
    "description": "desc",
    "recommendation": "rec",
    "is_security_critical": true
  }
]
\`\`\`
    `;

    const result = evaluatePhaseGate({
      reviewerOutputs: [{ reviewer_id: 'r3', raw_text }],
      retryCount: 2
    });

    expect(result.status).toBe('ESCALATE');
    expect(result.next_action).toBe('MANUAL_ESCALATION');
    expect(result.critical_findings.length).toBe(1);
  });
});
