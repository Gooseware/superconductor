import * as fs from 'node:fs';
import * as path from 'node:path';

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
  const lines = markdown.split('\n');
  for (const line of lines) {
    const match = line.match(/-\s*(🔴|🟡)\s*(?:`\[.*?\]`\s*)?\*\*([^*]+)\*\*:\s*(.*)/);
    if (match) {
      findings.push({
        severity: match[1],
        title: match[2].trim(),
        description: match[3].trim(),
        sourceTrack: trackId
      });
    }
  }
  return findings;
}

export function checkShenaniganExists(auditContent: string, finding: ReviewFinding): boolean {
  return auditContent.includes(`**${finding.title}**`);
}

export function appendShenanigan(auditFile: string, findings: ReviewFinding[], trackId: string, date: string): number {
  if (!fs.existsSync(auditFile)) return 0;
  
  let content = fs.readFileSync(auditFile, 'utf-8');
  let added = 0;
  
  let maxN = 0;
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\|\s*(\d+)\s*\|/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxN) maxN = n;
    }
  }

  for (const finding of findings) {
    if (!checkShenaniganExists(content, finding)) {
      maxN++;
      const trigger = `${finding.severity} finding`;
      const row = `| ${maxN} | **${finding.title}** | ${finding.description} | <!-- Inducted: ${trackId} — ${date} — ${trigger} -->`;
      if (!content.endsWith('\n')) content += '\n';
      content += row + '\n';
      added++;
    }
  }
  
  if (added > 0) {
    fs.writeFileSync(auditFile, content, 'utf-8');
  }
  return added;
}
