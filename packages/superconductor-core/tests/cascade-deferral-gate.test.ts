import { describe, it, expect } from 'vitest';
import { runCascadeDeferralGate } from '../src/review/cascade-deferral-gate.js';
import { ReviewFinding } from '../src/review/aggregate-findings.js';

describe('runCascadeDeferralGate', () => {
  const sampleFinding: ReviewFinding = {
    finding_id: 'F1',
    reviewer_id: 'rev1',
    file: 'src/app.ts',
    line_range: '10-20',
    severity: 'high',
    category: 'correctness',
    description: 'Null check missing',
    recommendation: 'Add null check',
    is_security_critical: false
  };

  it('should handle N=0 boundary case (invalid reviewer count)', () => {
    const result = runCascadeDeferralGate([sampleFinding], 0);

    expect(result.can_skip_arbiter).toBe(false);
    expect(result.escalate_to_arbiter).toBe(true);
    expect(result.arbiter_briefing).toContain('Invalid reviewer count');
  });

  it('should handle N=1 boundary case (single pass reviewer)', () => {
    const resultWithFindings = runCascadeDeferralGate([{ ...sampleFinding, agreement_count: 1 }], 1);
    expect(resultWithFindings.can_skip_arbiter).toBe(false);
    expect(resultWithFindings.escalate_to_arbiter).toBe(true);
    expect(resultWithFindings.arbiter_briefing).toContain('Disputed');

    const resultNoFindings = runCascadeDeferralGate([], 1);
    expect(resultNoFindings.can_skip_arbiter).toBe(true);
    expect(resultNoFindings.escalate_to_arbiter).toBe(false);
  });

  it('should handle N=3 boundary case with unanimous agreement', () => {
    const unanimousFinding: ReviewFinding = {
      ...sampleFinding,
      reviewer_ids: ['rev1', 'rev2', 'rev3'],
      agreement_count: 3
    };

    const result = runCascadeDeferralGate([unanimousFinding], 3);

    expect(result.can_skip_arbiter).toBe(true);
    expect(result.escalate_to_arbiter).toBe(false);
  });

  it('should handle N=3 boundary case with disputed findings or security critical findings', () => {
    const disputedFinding: ReviewFinding = {
      ...sampleFinding,
      reviewer_ids: ['rev1', 'rev2'],
      agreement_count: 2
    };

    const resultDisputed = runCascadeDeferralGate([disputedFinding], 3);
    expect(resultDisputed.can_skip_arbiter).toBe(false);
    expect(resultDisputed.escalate_to_arbiter).toBe(true);

    const securityFinding: ReviewFinding = {
      ...sampleFinding,
      category: 'security',
      severity: 'critical',
      reviewer_ids: ['rev1', 'rev2', 'rev3'],
      agreement_count: 3
    };

    const resultSecurity = runCascadeDeferralGate([securityFinding], 3);
    expect(resultSecurity.can_skip_arbiter).toBe(false);
    expect(resultSecurity.escalate_to_arbiter).toBe(true);
  });
});
