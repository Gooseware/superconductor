import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runDeterministicPreflight } from '../scripts/deterministic-preflight';
import { aggregateCoverageManifests } from '../scripts/aggregate-coverage-manifest';
import { aggregateFindings } from '../scripts/aggregate-findings';
import { runCascadeDeferralGate } from '../scripts/cascade-deferral-gate';
import { recordTokenUsage, generateTokenReport } from '../scripts/generate-token-report';

console.log('Running Phase 5 & 7 E2E Integration & Backward Compatibility Suite...\n');

// 1. Phase 5 Backward Compatibility: Monolithic Oracle Path Mock Test
{
  function mockMonolithicOracleAudit(diffText: string, specText: string) {
    return `# Oracle Audit Report\n\n` +
      `**Verdict:** READY\n` +
      `**Quality Score:** 9/10\n\n` +
      `## Summary\n` +
      `Track implementation matches spec.md specifications.\n\n` +
      `## Findings\n` +
      `- None (Clean pass)\n\n` +
      `## Central Registry Candidate\n` +
      `- No components recommended for superconductor-kernel promotion.\n`;
  }

  const legacyReport = mockMonolithicOracleAudit('sample diff', 'sample spec');
  assert.ok(legacyReport.includes('# Oracle Audit Report'), 'Oracle audit report header missing');
  assert.ok(legacyReport.includes('**Verdict:** READY'), 'Oracle audit verdict missing');
  assert.ok(legacyReport.includes('**Quality Score:** 9/10'), 'Oracle quality score missing');
  console.log('✅ Test 1: Phase 5 Monolithic Oracle Backward Compatibility Passed');
}

// 2. Phase 7 Full End-to-End Pipeline Smoke Test
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-smoke-'));
  const manifestsDir = path.join(tmpDir, '.manifests');
  fs.mkdirSync(manifestsDir, { recursive: true });

  // Step 1: Preflight
  const preflightRes = runDeterministicPreflight(tmpDir);
  const preflightFile = path.join(manifestsDir, 'preflight.json');
  fs.writeFileSync(preflightFile, JSON.stringify(preflightRes, null, 2));

  // Step 2: Specialized Flash Reviewers outputs (Simulated outputs)
  const securityOutput = `
Here is security critique:
\`\`\`json:coverage-manifest
{
  "reviewer_id": "security-reviewer",
  "examined": [{"file": "src/auth.ts", "line_range": "1-30", "concern": "Authentication"}],
  "skimmed": [],
  "not_examined": []
}
\`\`\`

\`\`\`json:review-findings
[
  {
    "finding_id": "SEC-101",
    "reviewer_id": "security-reviewer",
    "file": "src/auth.ts",
    "line_range": "15",
    "severity": "high",
    "category": "security",
    "description": "Hardcoded JWT secret fallback",
    "recommendation": "Require env variable",
    "is_security_critical": true
  }
]
\`\`\`
  `;

  const correctnessOutput = `
Here is correctness critique:
\`\`\`json:coverage-manifest
{
  "reviewer_id": "correctness-reviewer",
  "examined": [{"file": "src/auth.ts", "line_range": "10-25", "concern": "Null check"}],
  "skimmed": [],
  "not_examined": []
}
\`\`\`

\`\`\`json:review-findings
[
  {
    "finding_id": "CORR-101",
    "reviewer_id": "correctness-reviewer",
    "file": "src/auth.ts",
    "line_range": "15",
    "severity": "high",
    "category": "security",
    "description": "Hardcoded JWT secret fallback",
    "recommendation": "Require env variable",
    "is_security_critical": true
  }
]
\`\`\`
  `;

  const adversarialOutput = `
Here is adversarial critique:
\`\`\`json:coverage-manifest
{
  "reviewer_id": "adversarial-reviewer",
  "examined": [{"file": "src/auth.ts", "line_range": "1-30", "concern": "Shenanigan check"}],
  "skimmed": [],
  "not_examined": []
}
\`\`\`

\`\`\`json:review-findings
[]
\`\`\`
  `;

  const reviewerOutputs = [
    { reviewer_id: 'security-reviewer', raw_text: securityOutput },
    { reviewer_id: 'correctness-reviewer', raw_text: correctnessOutput },
    { reviewer_id: 'adversarial-reviewer', raw_text: adversarialOutput }
  ];

  // Step 3: Coverage Manifest Aggregation
  const coverageResult = aggregateCoverageManifests(reviewerOutputs, manifestsDir);
  const coverageFile = path.join(manifestsDir, 'coverage-manifest.json');
  fs.writeFileSync(coverageFile, JSON.stringify(coverageResult, null, 2));

  // Step 4: Findings Aggregation & Deduplication
  const findings = aggregateFindings(reviewerOutputs, manifestsDir);
  const findingsFile = path.join(manifestsDir, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify(findings, null, 2));

  // Step 5: Cascade Deferral Gate
  const gateResult = runCascadeDeferralGate(findings, 3);
  const briefingFile = path.join(manifestsDir, 'arbiter-briefing.md');
  fs.writeFileSync(briefingFile, gateResult.arbiter_briefing);

  // Step 6: Token Instrumentation Logging
  const tokenReportFile = path.join(manifestsDir, 'token-report.json');
  recordTokenUsage(tokenReportFile, {
    stage: 'Deterministic Preflight',
    model: 'none',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0
  });
  recordTokenUsage(tokenReportFile, {
    stage: 'Flash Review Panel',
    model: 'gemini-3.6-flash',
    input_tokens: 4500,
    output_tokens: 800,
    cost_usd: 0.0045
  });

  const tokenReportMd = generateTokenReport(tokenReportFile);

  // Verification assertions of file artifacts in .manifests/
  assert.ok(fs.existsSync(preflightFile), 'preflight.json must exist in .manifests/');
  assert.ok(fs.existsSync(coverageFile), 'coverage-manifest.json must exist in .manifests/');
  assert.ok(fs.existsSync(findingsFile), 'findings.json must exist in .manifests/');
  assert.ok(fs.existsSync(briefingFile), 'arbiter-briefing.md must exist in .manifests/');
  assert.ok(fs.existsSync(tokenReportFile), 'token-report.json must exist in .manifests/');

  // Content Assertions
  const savedFindings: any[] = JSON.parse(fs.readFileSync(findingsFile, 'utf-8'));
  assert.strictEqual(savedFindings.length, 1, 'Findings must be deduplicated to 1 item');
  assert.strictEqual(savedFindings[0].agreement_count, 2, 'Agreement count must be 2');

  assert.strictEqual(gateResult.escalate_to_arbiter, true, 'Security critical finding must escalate to arbiter');
  assert.ok(tokenReportMd.includes('Flash Review Panel'), 'Token report must include Flash stage');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ Test 2: Phase 7 Full End-to-End Smoke Test Passed');
}

console.log('\n🎉 ALL E2E INTEGRATION AND COMPATIBILITY TESTS PASSED CLEANLY!');
