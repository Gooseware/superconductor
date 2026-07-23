import assert from 'node:assert';
import { extractFencedBlock } from '../scripts/extract-fenced-block';
import { aggregateCoverageManifests } from '../scripts/aggregate-coverage-manifest';
import { aggregateFindings } from '../scripts/aggregate-findings';
import { runCascadeDeferralGate } from '../scripts/cascade-deferral-gate';

console.log('Running Review Panel Engine Verification Suite...');

// 1. Tier 1 Fenced Block Extraction
{
  const rawText = `
Here is my review.

\`\`\`json:coverage-manifest
{
  "reviewer_id": "security-reviewer",
  "examined": [{"file": "auth.ts", "line_range": "1-10", "concern": "JWT logic"}],
  "skimmed": [],
  "not_examined": []
}
\`\`\`
  `;

  const manifest = extractFencedBlock(rawText, 'coverage-manifest');
  assert.ok(manifest !== null, 'Manifest extraction should not be null');
  assert.strictEqual(manifest.reviewer_id, 'security-reviewer');
  assert.strictEqual(manifest.examined.length, 1);
  console.log('✅ Test 1: Tier 1 Fenced Block Extraction Passed');
}

// 2. Coverage Manifest Fail-Safe Trigger on Malformed Input
{
  const res = aggregateCoverageManifests([
    { reviewer_id: 'bad-reviewer', raw_text: 'I refuse to output JSON!' }
  ]);

  assert.strictEqual(res.residual_coverage_map.length, 1);
  assert.strictEqual(res.residual_coverage_map[0].file, 'all files in diff');
  console.log('✅ Test 2: Coverage Manifest Fail-Safe Passed');
}

// 3. Findings Deduplication and Agreement Counting
{
  const output1 = `
\`\`\`json:review-findings
[
  {
    "finding_id": "SEC-1",
    "reviewer_id": "rev-1",
    "file": "db.ts",
    "line_range": "10-15",
    "severity": "high",
    "category": "security",
    "description": "SQLi bug",
    "recommendation": "fix query",
    "is_security_critical": true
  }
]
\`\`\`
  `;

  const output2 = `
\`\`\`json:review-findings
[
  {
    "finding_id": "CORR-1",
    "reviewer_id": "rev-2",
    "file": "db.ts",
    "line_range": "12-14",
    "severity": "high",
    "category": "security",
    "description": "SQLi query issue",
    "recommendation": "parameterize",
    "is_security_critical": true
  }
]
\`\`\`
  `;

  const findings = aggregateFindings([
    { reviewer_id: 'rev-1', raw_text: output1 },
    { reviewer_id: 'rev-2', raw_text: output2 }
  ]);

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].agreement_count, 2);
  assert.ok(findings[0].reviewer_ids?.includes('rev-1'));
  assert.ok(findings[0].reviewer_ids?.includes('rev-2'));
  console.log('✅ Test 3: Findings Deduplication and Agreement Counting Passed');
}

// 4. Cascade Deferral Gate Security Critical Escalation
{
  const findings = [
    {
      finding_id: 'SEC-1',
      reviewer_id: 'rev-1',
      file: 'auth.ts',
      line_range: '10',
      severity: 'critical' as const,
      category: 'security' as const,
      description: 'Hardcoded secret',
      recommendation: 'Use env var',
      is_security_critical: true,
      agreement_count: 3,
      reviewer_ids: ['rev-1', 'rev-2', 'rev-3']
    }
  ];

  const gateResult = runCascadeDeferralGate(findings, 3);
  assert.strictEqual(gateResult.can_skip_arbiter, false);
  assert.strictEqual(gateResult.escalate_to_arbiter, true);
  console.log('✅ Test 4: Cascade Deferral Gate Security Critical Escalation Passed');
}

console.log('\n🎉 ALL REVIEW PANEL ENGINE TESTS PASSED CLEANLY!');
