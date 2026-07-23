import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// We will implement these functions in scripts/abi-retrospective.ts
import { scanArtifacts, extractFindings, checkShenaniganExists, appendShenanigan } from '../scripts/abi-retrospective';

console.log('Running ABI Retrospective Tests...\n');

{
  // Test: scan with zero new findings → adversarial-audit.md unchanged
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abi-test-'));
  const artifactsDir = path.join(tmpDir, 'brain');
  fs.mkdirSync(artifactsDir, { recursive: true });

  const auditFile = path.join(tmpDir, 'adversarial-audit.md');
  const initialAuditContent = `| # | Check | What it catches |\n|---|---|---|\n| 1 | **Grade inflation** | 🔴 |\n`;
  fs.writeFileSync(auditFile, initialAuditContent);

  // Write a mock review artifact with no findings
  const mockReviewFile = path.join(artifactsDir, 'adversarial_code_review_v1.md');
  fs.writeFileSync(mockReviewFile, `# Review\n\nNo findings found.`);

  const findings = scanArtifacts(artifactsDir);
  assert.strictEqual(findings.length, 0, 'Should extract zero findings');

  const inducted = appendShenanigan(auditFile, findings, 'track_1', '2026-07-23');
  assert.strictEqual(inducted, 0, 'Should induct 0 patterns');

  const afterContent = fs.readFileSync(auditFile, 'utf-8');
  assert.strictEqual(afterContent, initialAuditContent, 'adversarial-audit.md should be unchanged');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ Test 1: Scan with zero new findings works');
}

{
  // Test: extract findings from mock review artifact markdown
  const mockMarkdown = `
## Critical Findings
- 🔴 \`[blocking]\` **Phase omission**: Implementation skips entire plan phases.

## High Findings
- 🟡 \`[important]\` **Zero guard omission**: Functions accept counts without guards.

## Low Findings
- 🟢 \`[nit]\` Formatting issue.
`;
  const findings = extractFindings(mockMarkdown, 'track_1');
  assert.strictEqual(findings.length, 2, 'Should only extract Medium or higher findings');
  assert.strictEqual(findings[0].title, 'Phase omission');
  assert.strictEqual(findings[1].title, 'Zero guard omission');
  console.log('✅ Test 2: Extract findings works');
}

{
  // Test: correctly detect findings already in shenanigan table (no re-induction)
  const auditContent = `
| 9 | **Phase omission** | Implementation skips entire plan phases. | <!-- Inducted: track_1 -->
`;
  
  const finding = { title: 'Phase omission', description: 'Implementation skips entire plan phases.', sourceTrack: 'track_2', severity: '🔴' };
  const exists = checkShenaniganExists(auditContent, finding);
  assert.strictEqual(exists, true, 'Should detect existing finding');

  const findingNew = { title: 'New finding', description: 'This is new.', sourceTrack: 'track_2', severity: '🔴' };
  const existsNew = checkShenaniganExists(auditContent, findingNew);
  assert.strictEqual(existsNew, false, 'Should not detect new finding');
  console.log('✅ Test 3: Duplicate detection works');
}

{
  // Phase 2: Induction Engine Tests
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abi-test-2-'));
  const artifactsDir = path.join(tmpDir, 'brain');
  fs.mkdirSync(artifactsDir, { recursive: true });

  const auditFile = path.join(tmpDir, 'adversarial-audit.md');
  const initialAuditContent = `| # | Check | What it catches |\n|---|---|---|\n| 1 | **Existing** | existing desc |\n`;
  fs.writeFileSync(auditFile, initialAuditContent);

  const mockReviewFile = path.join(artifactsDir, 'adversarial_code_review_v1.md');
  fs.writeFileSync(mockReviewFile, `## Critical Findings\n- 🔴 \`[blocking]\` **Phase omission**: Implementation skips entire plan phases.`);

  const findings = scanArtifacts(artifactsDir);
  assert.strictEqual(findings.length, 1, 'Should extract 1 finding');

  // Test 1: scan with 1 new finding -> exactly 1 row appended
  const inducted = appendShenanigan(auditFile, findings, 'track_1', '2026-07-23');
  assert.strictEqual(inducted, 1, 'Should induct 1 pattern');

  const afterContent = fs.readFileSync(auditFile, 'utf-8');
  assert.strictEqual(afterContent.split('\n').filter(l => l.trim() !== '').length, initialAuditContent.split('\n').filter(l => l.trim() !== '').length + 1, 'Exactly one row should be appended');

  // Test 3: format matches
  const lastLine = afterContent.trim().split('\n').pop()!;
  assert.match(lastLine, /<!-- Inducted: track_1 — 2026-07-23 — 🔴 finding -->/, 'Provenance comment should match expected format');
  assert.match(lastLine, /\|\s*2\s*\|\s*\*\*Phase omission\*\*/, 'Row should increment ID and format title');

  // Test 2: duplicate induction
  const inductedAgain = appendShenanigan(auditFile, findings, 'track_1', '2026-07-23');
  assert.strictEqual(inductedAgain, 0, 'Should not induct duplicate pattern');
  const contentAgain = fs.readFileSync(auditFile, 'utf-8');
  assert.strictEqual(contentAgain, afterContent, 'File should be unchanged on duplicate induction');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ Phase 2: Induction Engine tests passed');
}

console.log('\n🎉 ALL ABI RETROSPECTIVE PHASE 1 & 2 TESTS PASSED!');
