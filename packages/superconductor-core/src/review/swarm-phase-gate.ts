import { aggregateFindings, ReviewFinding } from './aggregate-findings.js';

export interface PhaseGateInput {
  reviewerOutputs: { reviewer_id: string; raw_text?: string }[];
  manifestsDir?: string;
  retryCount: number;
}

export interface PhaseGateResult {
  status: 'PASS' | 'REJECT' | 'ESCALATE';
  critical_findings: ReviewFinding[];
  advisory_findings: ReviewFinding[];
  next_action: 'PROCEED' | 'AUTO_REMEDIATE' | 'MANUAL_ESCALATION';
}

export function preparePhaseGateContext(taskSpec: string, gitDiff: string, modifiedFiles: string[]): string {
  return `[TASK SPEC]\n${taskSpec}\n\n[MODIFIED FILES]\n${modifiedFiles.join('\n')}\n\n[GIT DIFF]\n${gitDiff}`;
}

export function evaluatePhaseGate(input: PhaseGateInput): PhaseGateResult {
  const allFindings = aggregateFindings(input.reviewerOutputs, input.manifestsDir);
  
  // Consensus algorithm: PASS if no CRITICAL findings.
  const criticalFindings = allFindings.filter(f => f.severity === 'critical');
  const advisoryFindings = allFindings.filter(f => f.severity !== 'critical');

  if (criticalFindings.length > 0) {
    if (input.retryCount >= 2) { // hard cap of 2 auto-remediations
      return {
        status: 'ESCALATE',
        critical_findings: criticalFindings,
        advisory_findings: advisoryFindings,
        next_action: 'MANUAL_ESCALATION'
      };
    } else {
      return {
        status: 'REJECT',
        critical_findings: criticalFindings,
        advisory_findings: advisoryFindings,
        next_action: 'AUTO_REMEDIATE'
      };
    }
  }

  return {
    status: 'PASS',
    critical_findings: [],
    advisory_findings: allFindings,
    next_action: 'PROCEED'
  };
}
