import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { extractFencedBlock } from '../scripts/extract-fenced-block';
import { aggregateCoverageManifests } from '../scripts/aggregate-coverage-manifest';
import { aggregateFindings } from '../scripts/aggregate-findings';
import { runCascadeDeferralGate } from '../scripts/cascade-deferral-gate';
import { runDeterministicPreflight } from '../scripts/deterministic-preflight';
import { recordTokenUsage, generateTokenReport } from '../scripts/generate-token-report';

console.log('Running Expanded Review Panel Engine Verification Suite...\n');

// 1. Tier 1 Fenced Block Extraction (Single block & Independent Dual Blocks)
{
  const dualBlockText = `
Here is my review output.

\`\`\`json:coverage-manifest
{
  "reviewer_id": "security-reviewer",
  "examined": [{"file": "auth.ts", "line_range": "1-10", "concern": "JWT logic"}],
  "skimmed": [],
  "not_examined": []
}
\`\`\`

And here are findings:

\`\`\`json:review-findings
[
  {
    "finding_id": "SEC-1",
    "reviewer_id": "security-reviewer",
    "file": "auth.ts",
    "line_range": "5",
    "severity": "HIGH",
    "category": "SECURITY",
    "description": "Insecure JWT secret",
    "recommendation": "Use env var",
    "is_security_critical": true
  }
]
\`\`\`
  `;

  const manifest = extractFencedBlock(dualBlockText, 'coverage-manifest');
  const findings = extractFencedBlock(dualBlockText, 'review-findings');

  assert.ok(manifest !== null, 'Manifest extraction should not be null');
  assert.strictEqual(manifest.reviewer_id, 'security-reviewer');
  assert.ok(Array.isArray(findings), 'Findings extraction should return array');
  assert.strictEqual(findings[0].severity, 'high', 'Severity enum should be normalized to lowercase');
  assert.strictEqual(findings[0].category, 'security', 'Category enum should be normalized to lowercase');
  console.log('✅ Test 1: Dual Fenced Block Extraction & Enum Normalization Passed');
}

// 2. Coverage Manifest Tier 2 Disk Artifact Fallback
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
  const artifactPath = path.join(tmpDir, 'disk-reviewer.json');
  fs.writeFileSync(
    artifactPath,
    JSON.stringify({
      reviewer_id: 'disk-reviewer',
      examined: [{ file: 'server.ts', line_range: '1-50', concern: 'Express routes' }],
      skimmed: [],
      not_examined: []
    })
  );

  const res = aggregateCoverageManifests(
    [{ reviewer_id: 'disk-reviewer', raw_text: 'No json block in text' }],
    tmpDir
  );

  assert.strictEqual(res.coverage_stats.files_examined, 1);
  assert.strictEqual(res.residual_coverage_map.length, 0);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ Test 2: Coverage Manifest Tier 2 Disk Fallback Passed');
}

// 3. Coverage Manifest Tier 3 Fail-Safe Trigger on Malformed Input
{
  const res = aggregateCoverageManifests([
    { reviewer_id: 'bad-reviewer', raw_text: 'I refuse to output JSON!' }
  ]);

  assert.strictEqual(res.residual_coverage_map.length, 1);
  assert.strictEqual(res.residual_coverage_map[0].file, 'all files in diff');
  console.log('✅ Test 3: Coverage Manifest Fail-Safe Passed');
}

// 4. Overlapping not_examined entries deduplication in Residual Coverage Map
{
  const res = aggregateCoverageManifests([
    {
      reviewer_id: 'rev-1',
      raw_text: `\`\`\`json:coverage-manifest
{"reviewer_id":"rev-1","examined":[],"skimmed":[],"not_examined":[{"file":"db.ts","line_range":"10-20","concern":"ORM"}]}
\`\`\``
    },
    {
      reviewer_id: 'rev-2',
      raw_text: `\`\`\`json:coverage-manifest
{"reviewer_id":"rev-2","examined":[],"skimmed":[],"not_examined":[{"file":"db.ts","line_range":"10-20","concern":"Duplicate concern"}]}
\`\`\``
    }
  ]);

  assert.strictEqual(res.residual_coverage_map.length, 1, 'Duplicate not_examined entries must be deduplicated');
  assert.strictEqual(res.residual_coverage_map[0].file, 'db.ts');
  console.log('✅ Test 4: Residual Coverage Map Deduplication Passed');
}

// 5. All manifests fully covered -> empty residual map
{
  const res = aggregateCoverageManifests([
    {
      reviewer_id: 'rev-1',
      raw_text: `\`\`\`json:coverage-manifest
{"reviewer_id":"rev-1","examined":[{"file":"app.ts","line_range":"1-100","concern":"core"}],"skimmed":[],"not_examined":[]}
\`\`\``
    }
  ]);

  assert.strictEqual(res.residual_coverage_map.length, 0, 'Residual map must be empty when fully examined');
  console.log('✅ Test 5: Empty Residual Map on Complete Coverage Passed');
}

// 6. Findings Deduplication and Agreement Counting (Line Range Close ±3)
{
  const output1 = `
\`\`\`json:review-findings
[{"finding_id":"F1","reviewer_id":"rev-1","file":"db.ts","line_range":"10-15","severity":"high","category":"security","description":"SQLi","recommendation":"fix","is_security_critical":true}]
\`\`\`
  `;
  const output2 = `
\`\`\`json:review-findings
[{"finding_id":"F2","reviewer_id":"rev-2","file":"db.ts","line_range":"12-14","severity":"high","category":"security","description":"SQLi","recommendation":"fix","is_security_critical":true}]
\`\`\`
  `;

  const findings = aggregateFindings([
    { reviewer_id: 'rev-1', raw_text: output1 },
    { reviewer_id: 'rev-2', raw_text: output2 }
  ]);

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].agreement_count, 2);
  assert.deepStrictEqual(findings[0].reviewer_ids, ['rev-1', 'rev-2']);
  console.log('✅ Test 6: Findings Deduplication (Line Range ±3) Passed');
}

// 7. Findings with line ranges differing by > 3 treated as separate findings
{
  const output1 = `
\`\`\`json:review-findings
[{"finding_id":"F1","reviewer_id":"rev-1","file":"db.ts","line_range":"10-15","severity":"low","category":"style","description":"Naming","recommendation":"fix","is_security_critical":false}]
\`\`\`
  `;
  const output2 = `
\`\`\`json:review-findings
[{"finding_id":"F2","reviewer_id":"rev-2","file":"db.ts","line_range":"30-35","severity":"low","category":"style","description":"Naming","recommendation":"fix","is_security_critical":false}]
\`\`\`
  `;

  const findings = aggregateFindings([
    { reviewer_id: 'rev-1', raw_text: output1 },
    { reviewer_id: 'rev-2', raw_text: output2 }
  ]);

  assert.strictEqual(findings.length, 2, 'Line ranges >3 lines apart must remain separate findings');
  console.log('✅ Test 7: Distant Line Range Separate Findings Passed');
}

// 8. Line range "all" deduplication edge case handling
{
  const output1 = `
\`\`\`json:review-findings
[{"finding_id":"F1","reviewer_id":"rev-1","file":"db.ts","line_range":"all","severity":"medium","category":"correctness","description":"Refactor file","recommendation":"fix","is_security_critical":false}]
\`\`\`
  `;
  const output2 = `
\`\`\`json:review-findings
[{"finding_id":"F2","reviewer_id":"rev-2","file":"db.ts","line_range":"all","severity":"medium","category":"correctness","description":"Refactor file","recommendation":"fix","is_security_critical":false}]
\`\`\`
  `;

  const findings = aggregateFindings([
    { reviewer_id: 'rev-1', raw_text: output1 },
    { reviewer_id: 'rev-2', raw_text: output2 }
  ]);

  assert.strictEqual(findings.length, 1, 'line_range "all" must match and deduplicate');
  assert.strictEqual(findings[0].agreement_count, 2);
  console.log('✅ Test 8: line_range "all" Deduplication Edge Case Passed');
}

// 9. Cascade Deferral Gate: Zero findings -> can_skip_arbiter: true (Clean Pass)
{
  const gateResult = runCascadeDeferralGate([], 3);
  assert.strictEqual(gateResult.can_skip_arbiter, true, 'Zero findings must produce clean pass can_skip_arbiter: true');
  assert.strictEqual(gateResult.escalate_to_arbiter, false);
  console.log('✅ Test 9: Zero Findings Clean Pass Gate Passed');
}

// 10. Cascade Deferral Gate: Unanimous Non-Security Findings -> can_skip_arbiter: true
{
  const findings = [
    {
      finding_id: 'STYLE-1',
      reviewer_id: 'rev-1',
      file: 'app.ts',
      line_range: '1-5',
      severity: 'low' as const,
      category: 'style' as const,
      description: 'Format typo',
      recommendation: 'Fix typo',
      is_security_critical: false,
      agreement_count: 3,
      reviewer_ids: ['rev-1', 'rev-2', 'rev-3']
    }
  ];

  const gateResult = runCascadeDeferralGate(findings, 3);
  assert.strictEqual(gateResult.can_skip_arbiter, true);
  assert.strictEqual(gateResult.escalate_to_arbiter, false);
  console.log('✅ Test 10: Unanimous Non-Security Gate Pass Passed');
}

// 11. Cascade Deferral Gate: Disputed Finding -> Severity Downgrade in Briefing
{
  const findings = [
    {
      finding_id: 'CORR-1',
      reviewer_id: 'rev-1',
      file: 'app.ts',
      line_range: '10',
      severity: 'high' as const,
      category: 'correctness' as const,
      description: 'Potential null deref',
      recommendation: 'Add null check',
      is_security_critical: false,
      agreement_count: 2, // 2 out of 3 reviewers (disputed)
      reviewer_ids: ['rev-1', 'rev-2']
    }
  ];

  const gateResult = runCascadeDeferralGate(findings, 3);
  assert.strictEqual(gateResult.can_skip_arbiter, false);
  assert.strictEqual(gateResult.escalate_to_arbiter, true);
  assert.ok(
    gateResult.arbiter_briefing.includes('downgraded to MEDIUM'),
    'Briefing must document severity downgrade for disputed finding'
  );
  console.log('✅ Test 11: Disputed Finding Severity Downgrade Passed');
}

// 12. Cascade Deferral Gate: Security Critical Escalation
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
  console.log('✅ Test 12: Security Critical Escalation Gate Passed');
}

// 13. Deterministic Preflight Unit Test
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-'));
  const scDir = path.join(tmpDir, 'superconductor');
  fs.mkdirSync(scDir, { recursive: true });
  fs.writeFileSync(path.join(scDir, 'tech-stack.md'), 'Primary Language: Haskell');

  const resSkipped = runDeterministicPreflight(tmpDir);
  assert.strictEqual(resSkipped.status, 'skipped');
  assert.strictEqual(resSkipped.short_circuit, false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ Test 13: Deterministic Preflight Skipped State Passed');
}

// 14. Token Instrumentation: recordTokenUsage & generateTokenReport
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-test-'));
  const reportPath = path.join(tmpDir, 'token-report.json');

  recordTokenUsage(reportPath, {
    stage: 'Flash Review Panel',
    model: 'gemini-3.6-flash',
    input_tokens: 1000,
    output_tokens: 200,
    cost_usd: 0.001
  });

  const reportMd = generateTokenReport(reportPath);
  assert.ok(reportMd.includes('Flash Review Panel'), 'Report should contain stage name');
  assert.ok(reportMd.includes('$0.0010'), 'Report should contain cost calculation');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ Test 14: Token Instrumentation & Efficiency Report Generation Passed');
}

console.log('\n🎉 ALL 14 EXPANDED REVIEW PANEL ENGINE TESTS PASSED CLEANLY!');
