import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ReviewFinding {
  title: string;
  description: string;
  sourceTrack: string;
  severity: string;
}

export function scanArtifacts(artifactsDir: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  if (!fs.existsSync(artifactsDir)) return findings;
  
  const files = fs.readdirSync(artifactsDir);
  for (const file of files) {
    if (file.startsWith('adversarial_code_review_v') && file.endsWith('.md')) {
      const content = fs.readFileSync(path.join(artifactsDir, file), 'utf-8');
      findings.push(...extractFindings(content, '')); 
    }
  }
  return findings;
}

export function extractFindings(markdown: string, trackId: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const regex = /(?:^|\n)-\s*(🔴|🟡)\s*(?:`\[.*?\]`\s*)?\*\*([^*]+)\*\*:\s*([\s\S]*?)(?=\n-\s|\n##\s|$)/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    findings.push({
      severity: match[1],
      title: match[2].trim(),
      description: match[3].trim(),
      sourceTrack: trackId
    });
  }
  return findings;
}

export function checkShenaniganExists(auditContent: string, finding: ReviewFinding): boolean {
  const tableLines = auditContent.split('\n').filter(line => /^\s*\|/.test(line));
  const tableText = tableLines.join('\n').toLowerCase();
  return tableText.includes(`**${finding.title.toLowerCase()}**`);
}

export function appendShenanigan(auditFile: string, findings: ReviewFinding[], trackId: string, date: string): number {
  if (!fs.existsSync(auditFile)) return 0;
  
  let content = fs.readFileSync(auditFile, 'utf-8');
  let added = 0;
  
  let maxN = 0;
  let lastTableLineIndex = -1;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*\|\s*(\d+)\s*\|/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxN) maxN = n;
    }
    if (line.trim().startsWith('|')) {
      lastTableLineIndex = i;
    }
  }

  for (const finding of findings) {
    if (!checkShenaniganExists(content, finding)) {
      maxN++;
      const trigger = `${finding.severity} finding`;
      const flatDesc = finding.description.replace(/\s*\n\s*/g, ' ');
      const row = `| ${maxN} | **${finding.title}** | ${flatDesc} | <!-- Inducted: ${trackId} — ${date} — ${trigger} -->`;
      
      if (lastTableLineIndex !== -1) {
        lines.splice(lastTableLineIndex + 1, 0, row);
        lastTableLineIndex++;
      } else {
        lines.push(row);
        lastTableLineIndex = lines.length - 1;
      }
      added++;
    }
  }
  
  if (added > 0) {
    fs.writeFileSync(auditFile, lines.join('\n'), 'utf-8');
  }
  return added;
}

export function syncStandaloneReviewSkill(skillFilePath: string, inductedFindings: ReviewFinding[]): number {
  if (!fs.existsSync(skillFilePath) || inductedFindings.length === 0) return 0;
  
  let content = fs.readFileSync(skillFilePath, 'utf-8');
  let added = 0;
  
  const sectionHeader = '§4.1 Embedded Shenanigan Checklist';
  const headerIdx = content.indexOf(sectionHeader);
  if (headerIdx === -1) return 0;
  
  const lines = content.split('\n');
  const headerLineIdx = lines.findIndex(l => l.includes(sectionHeader));
  
  let insertIdx = headerLineIdx + 1;
  while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
    insertIdx++;
  }
  
  while (insertIdx < lines.length && lines[insertIdx].trim().startsWith('-')) {
    insertIdx++;
  }
  
  for (const finding of inductedFindings) {
    if (!content.includes(finding.title)) {
      lines.splice(insertIdx, 0, `- ${finding.title} (${finding.description})`);
      insertIdx++;
      added++;
    }
  }
  
  if (added > 0) {
    fs.writeFileSync(skillFilePath, lines.join('\n'), 'utf-8');
  }
  return added;
}

export function writeRetrospectiveReport(trackDir: string, trackId: string, date: string, findings: ReviewFinding[], inductedCount: number): void {
  const reportPath = path.join(trackDir, `retrospective-${trackId}-${date}.md`);
  
  const content = `# Retrospective Report: ${trackId} (${date})

## Summary
- Findings Extracted: ${findings.length}
- New Shenanigans Inducted: ${inductedCount}
- Skills Updated: ${inductedCount > 0 ? 1 : 0}

## Extracted Findings
${findings.map(f => `- [${f.severity}] **${f.title}**: ${f.description}`).join('\n')}
`;
  fs.writeFileSync(reportPath, content, 'utf-8');
}

if (typeof require !== 'undefined' && require.main === module) {
  const args = process.argv.slice(2);
  let trackId = '';
  let artifactsDir = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--track') trackId = args[i + 1];
    if (args[i] === '--artifacts-dir') artifactsDir = args[i + 1];
  }

  if (!trackId) {
    console.error('❌ --track is required');
    process.exit(1);
  }

  if (!artifactsDir) {
    const brainDir = path.join(os.homedir(), '.gemini/antigravity-cli/brain');
    if (fs.existsSync(brainDir)) {
      const convos = fs.readdirSync(brainDir).filter(f => fs.statSync(path.join(brainDir, f)).isDirectory());
      convos.sort((a, b) => fs.statSync(path.join(brainDir, b)).mtimeMs - fs.statSync(path.join(brainDir, a)).mtimeMs);
      if (convos.length > 0) {
        artifactsDir = path.join(brainDir, convos[0]);
      }
    }
  }

  if (!artifactsDir) {
    console.error('❌ Could not determine artifacts directory');
    process.exit(1);
  }

  console.log(`✅ Scanning artifacts directory: ${artifactsDir}`);
  const findings = scanArtifacts(artifactsDir);
  console.log(`✅ Extracted ${findings.length} findings`);

  const auditFile = path.join(__dirname, '..', 'skills', 'code-review-skill', 'reference', 'cross-cutting', 'adversarial-audit.md');
  const date = new Date().toISOString().split('T')[0];
  
  const inductedCount = appendShenanigan(auditFile, findings, trackId, date);
  if (inductedCount > 0) {
    console.log(`✅ ${inductedCount} new pattern(s) inducted`);
  } else {
    console.log(`⚠️ 0 new patterns inducted`);
  }

  const skillFilePath = path.join(os.homedir(), '.gemini/config/plugins/superconductor/skills/standalone-review/SKILL.md');
  const skillUpdated = syncStandaloneReviewSkill(skillFilePath, findings);
  if (skillUpdated > 0) {
    console.log(`✅ Updated standalone-review skill with ${skillUpdated} new pattern(s)`);
  } else {
    console.log(`✅ Standalone-review skill up to date`);
  }

  const trackDir = path.join(__dirname, '..', 'superconductor', 'tracks', trackId);
  if (!fs.existsSync(trackDir)) {
    fs.mkdirSync(trackDir, { recursive: true });
  }
  
  writeRetrospectiveReport(trackDir, trackId, date, findings, inductedCount);
  console.log(`✅ Retrospective report written to ${trackDir}`);
}

