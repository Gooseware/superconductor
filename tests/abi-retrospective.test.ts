import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// We will implement these functions in scripts/abi-retrospective.ts
import { scanArtifacts, extractFindings, checkShenaniganExists, appendShenanigan, syncStandaloneReviewSkill, writeRetrospectiveReport } from '../scripts/abi-retrospective';

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
  const mockMarkdown = `
## Critical Findings
- 🔴 \`[blocking]\` **Phase omission**: Implementation skips entire plan phases.
This is a multiline description.
It should be captured.

## High Findings
- 🟡 \`[important]\` **Zero guard omission**: Functions accept counts without guards.

## Low Findings
- 🟢 \`[nit]\` Formatting issue.
`;
  const findings = extractFindings(mockMarkdown, 'track_1');
  assert.strictEqual(findings.length, 2, 'Should only extract Medium or higher findings');
  assert.strictEqual(findings[0].title, 'Phase omission');
  assert.strictEqual(findings[0].description, 'Implementation skips entire plan phases.\nThis is a multiline description.\nIt should be captured.');
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

{
  // Test: EOF append edge cases
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abi-test-append-'));
  const artifactsDir = path.join(tmpDir, 'brain');
  fs.mkdirSync(artifactsDir, { recursive: true });

  const auditFile = path.join(tmpDir, 'adversarial-audit.md');
  const initialAuditContent = `Some intro text\n| # | Check | What it catches |\n|---|---|---|\n| 1 | **Existing** | existing desc |\n\nSome trailing text that should not be after the table if we just append to EOF.`;
  fs.writeFileSync(auditFile, initialAuditContent);

  const mockReviewFile = path.join(artifactsDir, 'adversarial_code_review_v1.md');
  fs.writeFileSync(mockReviewFile, `## Critical Findings\n- 🔴 \`[blocking]\` **New Pattern**: Multiline\ndesc here.`);

  const findings = scanArtifacts(artifactsDir);
  const inducted = appendShenanigan(auditFile, findings, 'track_1', '2026-07-23');
  assert.strictEqual(inducted, 1, 'Should induct 1 pattern');

  const afterContent = fs.readFileSync(auditFile, 'utf-8');
  
  // The new row should be placed immediately after the table, before the trailing text
  assert.match(afterContent, /\| 2 \| \*\*New Pattern\*\* \| Multiline desc here\. \| <!-- Inducted:.*-->\n\nSome trailing text/, 'Row should be appended immediately after the table');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ Test: EOF append edge cases passed');
}

{
  // Phase 3: syncStandaloneReviewSkill test
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abi-test-3-'));
  const skillFile = path.join(tmpDir, 'SKILL.md');
  const initialSkillContent = `Some intro text\n\n§4.1 Embedded Shenanigan Checklist\n- Existing Pattern (A description)\n\nMore text`;
  fs.writeFileSync(skillFile, initialSkillContent);

  const findings = [
    { title: 'Existing Pattern', description: 'A description', sourceTrack: 't1', severity: '🔴' },
    { title: 'New Pattern', description: 'New description', sourceTrack: 't1', severity: '🔴' }
  ];

  const added = syncStandaloneReviewSkill(skillFile, findings);
  assert.strictEqual(added, 1, 'Should only add the new pattern');

  const afterContent = fs.readFileSync(skillFile, 'utf-8');
  assert.match(afterContent, /- New Pattern \(New description\)/, 'Should append the new pattern to the list');
  assert.strictEqual(afterContent.split('New Pattern').length, 2, 'Should only exist once');

  // Second run should add 0
  const addedAgain = syncStandaloneReviewSkill(skillFile, findings);
  assert.strictEqual(addedAgain, 0, 'Should be idempotent');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ Phase 3: syncStandaloneReviewSkill tests passed');
}

{
  // Phase 4: writeRetrospectiveReport test
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abi-test-4-'));
  
  const findings = [
    { title: 'Phase omission', description: 'Implementation skips plan phases', sourceTrack: 't1', severity: '🔴' }
  ];
  
  writeRetrospectiveReport(tmpDir, 'track_1', '2026-07-23', findings, 1);
  const reportPath = path.join(tmpDir, 'retrospective-track_1-2026-07-23.md');
  
  assert.ok(fs.existsSync(reportPath), 'Report file should be created');
  const content = fs.readFileSync(reportPath, 'utf-8');
  assert.match(content, /# Retrospective Report: track_1 \(2026-07-23\)/, 'Title should match');
  assert.match(content, /New Shenanigans Inducted: 1/, 'Inducted count should match');
  assert.match(content, /\[🔴\] \*\*Phase omission\*\*/, 'Extracted findings should be listed');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ Phase 4: writeRetrospectiveReport tests passed');
}

{
  // Smoke test for already-inducted shenanigans
  const auditContent = `
| 1 | **Pattern One** | desc |
| 2 | **Pattern Two** | desc |
| 3 | **Pattern Three** | desc |
| 4 | **Pattern Four** | desc |
| 5 | **Pattern Five** | desc |
| 6 | **Pattern Six** | desc |
`;
  const findings = [
    { title: 'Pattern One', description: '', sourceTrack: 't', severity: '🔴' },
    { title: 'Pattern Two', description: '', sourceTrack: 't', severity: '🔴' },
    { title: 'Pattern Three', description: '', sourceTrack: 't', severity: '🔴' },
    { title: 'Pattern Four', description: '', sourceTrack: 't', severity: '🔴' },
    { title: 'Pattern Five', description: '', sourceTrack: 't', severity: '🔴' },
    { title: 'Pattern Six', description: '', sourceTrack: 't', severity: '🔴' }
  ];
  const allExist = findings.every(f => checkShenaniganExists(auditContent, f));
  assert.strictEqual(allExist, true, 'Smoke test: all 6 shenanigans identified as already-inducted');
  console.log('✅ Smoke test: already-inducted check works');
}

console.log('\n🎉 ALL ABI RETROSPECTIVE TESTS PASSED!');
