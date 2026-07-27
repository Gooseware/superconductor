import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface ABITweak {
  filename: string;
  description: string;
  search: string;
  replace: string;
}

export interface ABIReport {
  primaryTweak: ABITweak | null;
  candidateTweaks: ABITweak[];
  retryCount: number;
  criticalFindings: string[];
  advisoryFindings: string[];
}

export class ABIPostMortem {
  /**
   * Parses swarm_log.md content for CRITICAL/ADVISORY patterns and retry counts.
   * Produces a structured ABIReport with one primary tweak and ranked secondary candidates.
   */
  static analyzeSwarmLog(logContent: string): ABIReport {
    const retryMatches = [...logContent.matchAll(/retry/gi)];
    const criticalMatches = [...logContent.matchAll(/CRITICAL:\s*(.+)/gi)];
    const advisoryMatches = [...logContent.matchAll(/ADVISORY:\s*(.+)/gi)];

    const report: ABIReport = {
      primaryTweak: null,
      candidateTweaks: [],
      retryCount: retryMatches.length,
      criticalFindings: criticalMatches.map(m => m[1].trim()),
      advisoryFindings: advisoryMatches.map(m => m[1].trim()),
    };

    if (report.criticalFindings.length > 0 || report.retryCount > 0) {
      const allFindings = report.criticalFindings.join(' ').toLowerCase();
      let targetFile = 'coding-agent/SKILL.md';
      
      if (allFindings.includes('security') || allFindings.includes('injection') || allFindings.includes('vulnerab')) {
        targetFile = 'security-reviewer/SKILL.md';
      } else if (allFindings.includes('correctness') || allFindings.includes('bounds') || allFindings.includes('off-by-one')) {
        targetFile = 'correctness-reviewer/SKILL.md';
      } else if (allFindings.includes('phantom') || allFindings.includes('shenanigan')) {
        targetFile = 'adversarial-reviewer/SKILL.md';
      }

      const issueDescription = report.criticalFindings.length > 0 ? report.criticalFindings[0] : 'High retry count without resolution';

      report.primaryTweak = {
        filename: targetFile,
        description: `Mitigate: ${issueDescription}`,
        search: '# Instructions',
        replace: `# Instructions\n\nCRITICAL FIX: ${issueDescription}`
      };
    }

    return report;
  }
}

export class ABI {
  /**
   * Applies the primary tweak to the appropriate skill file in $HOME/.superconductor/skills/
   * Ensures atomic writes and makes a git commit.
   */
  static applySkillTweak(report: ABIReport, homeDir = process.env.HOME || ''): void {
    if (!report.primaryTweak) {
      return;
    }

    const scDir = path.join(homeDir, '.superconductor');
    const skillsDir = path.join(scDir, 'skills');
    const targetFile = path.join(skillsDir, report.primaryTweak.filename);

    // Schema validation implicitly through interface typing and logic checks here
    if (!report.primaryTweak.search || !report.primaryTweak.replace) {
      throw new Error('Invalid ABI tweak schema: search and replace must be defined.');
    }

    if (!path.resolve(targetFile).startsWith(path.resolve(skillsDir))) {
      throw new Error(`Path traversal detected: ${targetFile}`);
    }

    if (!fs.existsSync(targetFile)) {
      throw new Error(`Target skill file not found: ${targetFile}`);
    }

    const originalContent = fs.readFileSync(targetFile, 'utf-8');

    // Idempotency: if already applied or search string not found, return
    if (!originalContent.includes(report.primaryTweak.search) || originalContent.includes(report.primaryTweak.replace)) {
      return;
    }

    const newContent = originalContent.replace(
      report.primaryTweak.search,
      report.primaryTweak.replace
    );

    // Atomic write
    const tempFile = `${targetFile}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, newContent, 'utf-8');
    fs.renameSync(tempFile, targetFile);

    // Commit in $HOME/.superconductor/ (or skillsDir if scDir is not a repo)
    const candidatesStr = report.candidateTweaks.map(t => `- ${t.filename}: ${t.description}`).join('\n');
    const commitMsg = `abi(skill/${path.basename(report.primaryTweak.filename)}): ${report.primaryTweak.description}\n\nCANDIDATE_TWEAKS:\n${candidatesStr}`;

    try {
      const gitCwd = fs.existsSync(path.join(scDir, '.git')) ? scDir : skillsDir;
      
      execFileSync('git', ['add', targetFile], { cwd: gitCwd, stdio: 'ignore', timeout: 10000 });
      execFileSync('git', ['commit', '-m', commitMsg], { cwd: gitCwd, stdio: 'ignore', timeout: 10000 });
    } catch (e) {
      // Partial failure recovery: swallow git errors if it fails to commit (e.g. no git initialized)
      console.warn('ABI partial failure recovery: failed to commit skill tweak to git.', e);
    }
  }
}
