import { ReviewFinding } from './aggregate-findings';

export interface DeferralGateResult {
  can_skip_arbiter: boolean;
  escalate_to_arbiter: boolean;
  classified_findings: ReviewFinding[];
  arbiter_briefing: string;
}

const severityMap: Record<string, ReviewFinding['severity']> = {
  critical: 'high',
  high: 'medium',
  medium: 'low',
  low: 'advisory',
  advisory: 'advisory'
};

export function runCascadeDeferralGate(
  findings: ReviewFinding[],
  totalReviewersCount: number
): DeferralGateResult {
  // Guard against invalid or 0 reviewer count
  if (totalReviewersCount <= 0) {
    return {
      can_skip_arbiter: false,
      escalate_to_arbiter: true,
      classified_findings: findings,
      arbiter_briefing: '# Arbiter Briefing\n\n**Error:** Invalid reviewer count (0 or negative reviewers).'
    };
  }

  let hasDisputed = false;
  let hasSecurityCritical = false;

  const classified = findings.map((f) => {
    const copy = { ...f };
    const agreement = copy.agreement_count || 1;

    // Disputed rule: agreement below quorum OR N=1 reviewer single pass (cannot establish quorum)
    if (agreement < totalReviewersCount || totalReviewersCount === 1) {
      hasDisputed = true;
    }

    // Security critical bypass rule
    if (copy.category === 'security' && (copy.severity === 'critical' || copy.severity === 'high')) {
      copy.is_security_critical = true;
      hasSecurityCritical = true;
    }

    return copy;
  });

  // Can skip arbiter if zero findings OR (unanimous findings AND no security critical issues AND totalReviewersCount > 1)
  const canSkip = !hasSecurityCritical && !hasDisputed;
  const escalate = hasSecurityCritical || hasDisputed;

  // Build markdown Arbiter Briefing
  let briefing = `# Arbiter Briefing\n\n`;
  briefing += `**Total Reviewers:** ${totalReviewersCount}\n`;
  briefing += `**Total Unique Findings:** ${classified.length}\n`;
  briefing += `**Security Critical Escalation:** ${hasSecurityCritical ? 'YES' : 'NO'}\n\n`;
  briefing += `## Deduplicated Findings\n\n`;

  for (const f of classified) {
    const isDisputed = (f.agreement_count || 1) < totalReviewersCount || totalReviewersCount === 1;
    const effectiveSeverity = isDisputed ? severityMap[f.severity] || f.severity : f.severity;

    briefing += `### [${effectiveSeverity.toUpperCase()}] ${f.category} — ${f.file}:${f.line_range}\n`;
    briefing += `- **Agreement:** ${f.agreement_count}/${totalReviewersCount} reviewers (${f.reviewer_ids?.join(', ')})\n`;
    if (isDisputed) {
      briefing += `- **Status:** Disputed (${totalReviewersCount === 1 ? 'N=1 single reviewer pass' : `Original severity: ${f.severity.toUpperCase()}, downgraded to ${effectiveSeverity.toUpperCase()}`})\n`;
    }
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
