import { ReviewFinding } from './aggregate-findings';

export interface DeferralGateResult {
  can_skip_arbiter: boolean;
  escalate_to_arbiter: boolean;
  classified_findings: ReviewFinding[];
  arbiter_briefing: string;
}

export function runCascadeDeferralGate(
  findings: ReviewFinding[],
  totalReviewersCount: number
): DeferralGateResult {
  let hasDisputed = false;
  let hasSecurityCritical = false;

  const classified = findings.map((f) => {
    const copy = { ...f };
    const agreement = copy.agreement_count || 1;

    // Disputed rule
    if (agreement < totalReviewersCount) {
      hasDisputed = true;
    }

    // Security critical bypass rule
    if (copy.category === 'security' && (copy.severity === 'critical' || copy.severity === 'high')) {
      copy.is_security_critical = true;
      hasSecurityCritical = true;
    }

    return copy;
  });

  // Can skip arbiter if ALL findings are unanimous AND no security critical issues exist
  const canSkip = !hasSecurityCritical && !hasDisputed && classified.length > 0;
  const escalate = hasSecurityCritical || hasDisputed || classified.length === 0;

  // Build markdown Arbiter Briefing
  let briefing = `# Arbiter Briefing\n\n`;
  briefing += `**Total Reviewers:** ${totalReviewersCount}\n`;
  briefing += `**Total Unique Findings:** ${classified.length}\n`;
  briefing += `**Security Critical Escalation:** ${hasSecurityCritical ? 'YES' : 'NO'}\n\n`;
  briefing += `## Deduplicated Findings\n\n`;

  for (const f of classified) {
    briefing += `### [${f.severity.toUpperCase()}] ${f.category} — ${f.file}:${f.line_range}\n`;
    briefing += `- **Agreement:** ${f.agreement_count}/${totalReviewersCount} reviewers (${f.reviewer_ids?.join(', ')})\n`;
    briefing += `- **Description:** ${f.description}\n`;
    briefing += `- **Recommendation:** ${f.recommendation}\n\n`;
  }

  return {
    can_skip_arbiter: canSkip,
    escalate_to_arbiter: escalate,
    classified_findings: classified,
    arbiter_briefing: briefing
  };
}
