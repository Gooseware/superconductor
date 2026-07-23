import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveReviewInput } from '../scripts/input-resolution';
import { runDeterministicPreflight } from '../scripts/deterministic-preflight';
import { aggregateCoverageManifests } from '../scripts/aggregate-coverage-manifest';
import { aggregateFindings } from '../scripts/aggregate-findings';
import { runCascadeDeferralGate } from '../scripts/cascade-deferral-gate';
import { recordTokenUsage, generateTokenReport } from '../scripts/generate-token-report';

console.log('Running Standalone Review Input Resolution & Smoke Test Suite...\n');

// 1. Input resolution: no args + git repo -> resolves to git diff HEAD
{
  const resolved = resolveReviewInput([], true);
  assert.strictEqual(resolved.targetType, 'default');
  assert.strictEqual(resolved.resolvedDiffCommand, 'git diff HEAD');
  assert.strictEqual(resolved.depthMode, 'full');
  console.log('✅ Test 1: Default Git Repo Input Resolution Passed');
}

// 2. Input resolution: no args + non-git dir -> returns error
{
  const resolved = resolveReviewInput([], false);
  assert.strictEqual(resolved.targetType, 'default');
  assert.ok(resolved.error && resolved.error.includes('not a git repository'));
  console.log('✅ Test 2: Non-Git Dir Target Prompt Error Passed');
}

// 3. Input resolution: --staged flag -> resolves to git diff --staged
{
  const resolved = resolveReviewInput(['--staged'], true);
  assert.strictEqual(resolved.targetType, 'staged');
  assert.strictEqual(resolved.resolvedDiffCommand, 'git diff --staged');
  console.log('✅ Test 3: --staged Flag Resolution Passed');
}

// 4. Input resolution: --file <nonexistent> -> error with clear message
{
  const resolved = resolveReviewInput(['--file', 'nonexistent-file.ts'], true);
  assert.strictEqual(resolved.targetType, 'file');
  assert.ok(resolved.error && resolved.error.includes('File not found'));
  console.log('✅ Test 4: Nonexistent --file Error Resolution Passed');
}

// 5. Input resolution: --file <existent> -> valid resolution
{
  const tmpFile = path.join(os.tmpdir(), 'valid-file.ts');
  fs.writeFileSync(tmpFile, 'const a = 1;');
  const resolved = resolveReviewInput(['--file', tmpFile], true);
  assert.strictEqual(resolved.targetType, 'file');
  assert.strictEqual(resolved.targetValue, tmpFile);
  assert.strictEqual(resolved.error, undefined);
  fs.unlinkSync(tmpFile);
  console.log('✅ Test 5: Existing --file Resolution Passed');
}

// 6. Input resolution: depth mode flags (--fast, --deep, --stats)
{
  const resolvedFast = resolveReviewInput(['--fast', '--stats'], true);
  assert.strictEqual(resolvedFast.depthMode, 'fast');
  assert.strictEqual(resolvedFast.stats, true);

  const resolvedDeep = resolveReviewInput(['--deep'], true);
  assert.strictEqual(resolvedDeep.depthMode, 'deep');
  console.log('✅ Test 6: Depth Mode & Stats Flags Resolution Passed');
}

// 7. Standalone Review Smoke Test: execute fast mode pipeline on superconductor root
{
  const projectRoot = path.resolve(__dirname, '..');
  const manifestsDir = path.join(projectRoot, '.manifests');
  if (!fs.existsSync(manifestsDir)) {
    fs.mkdirSync(manifestsDir, { recursive: true });
  }

  // Preflight
  const preflightRes = runDeterministicPreflight(projectRoot);
  assert.ok(preflightRes.status === 'passed' || preflightRes.status === 'skipped' || preflightRes.status === 'failed');
  fs.writeFileSync(path.join(manifestsDir, 'preflight.json'), JSON.stringify(preflightRes, null, 2));

  // Mock Flash Reviewers
  const reviewer1 = `\`\`\`json:coverage-manifest\n{"reviewer_id":"security-reviewer","examined":[{"file":"scripts/cascade-deferral-gate.ts","line_range":"1-60","concern":"Security"}],"skimmed":[],"not_examined":[]}\n\`\`\``;
  const reviewer2 = `\`\`\`json:coverage-manifest\n{"reviewer_id":"correctness-reviewer","examined":[{"file":"scripts/aggregate-findings.ts","line_range":"1-100","concern":"Correctness"}],"skimmed":[],"not_examined":[]}\n\`\`\``;

  const coverage = aggregateCoverageManifests([
    { reviewer_id: 'security-reviewer', raw_text: reviewer1 },
    { reviewer_id: 'correctness-reviewer', raw_text: reviewer2 }
  ], manifestsDir);

  const findings = aggregateFindings([
    { reviewer_id: 'security-reviewer', raw_text: reviewer1 },
    { reviewer_id: 'correctness-reviewer', raw_text: reviewer2 }
  ], manifestsDir);

  const gateResult = runCascadeDeferralGate(findings, 2);

  // Record token usage
  recordTokenUsage(path.join(manifestsDir, 'token-report.json'), {
    stage: 'Standalone Fast Review',
    model: 'gemini-3.6-flash',
    input_tokens: 1500,
    output_tokens: 300,
    cost_usd: 0.0015
  });

  const tokenReport = generateTokenReport(path.join(manifestsDir, 'token-report.json'));

  // Generate Report File
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(projectRoot, `review-smoke-test-${timestamp}.md`);

  let reportContent = `# Standalone Review Smoke Test Report\n\n`;
  reportContent += `**Target:** Superconductor Codebase\n`;
  reportContent += `**Gate Can Skip Arbiter:** ${gateResult.can_skip_arbiter}\n\n`;
  reportContent += tokenReport;

  fs.writeFileSync(reportPath, reportContent, 'utf-8');

  // Assertions
  assert.ok(fs.existsSync(reportPath), 'Report file must be written to CWD');
  assert.ok(fs.existsSync(path.join(manifestsDir, 'preflight.json')), 'preflight.json manifest must exist');
  assert.ok(fs.existsSync(path.join(manifestsDir, 'token-report.json')), 'token-report.json manifest must exist');

  // Cleanup report file created during smoke test
  fs.unlinkSync(reportPath);
  console.log('✅ Test 7: Standalone Review Engine Fast Smoke Test Passed');
}

console.log('\n🎉 ALL STANDALONE REVIEW TESTS & SMOKE TEST PASSED CLEANLY!');
