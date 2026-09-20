import { Finding, UxReviewInput, UxRule } from './types.js';

export const visualHierarchyRules: UxRule[] = [
  {
    id: 'UX-VIS-01',
    name: 'Dim Secondary Information',
    ruleGroup: 'Visual Hierarchy & Formatting',
    severity: 'HIGH',
    description: 'Dim secondary information such as timestamps, thread IDs, or background details.',
    heuristic: 'Format secondary metadata with dim colors or parenthetical annotations.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // In cli_output, check if raw timestamps/hashes dominate primary text
      if (input.targetType === 'cli_output') {
        const lines = input.content.split('\n');
        lines.forEach((line, idx) => {
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s+[A-Z]+\s+\[[a-f0-9]{32,}\]/.test(line)) {
            findings.push({
              id: 'UX-VIS-01',
              severity: 'HIGH',
              ruleGroup: 'Visual Hierarchy & Formatting',
              description: `Un-dimmed raw timestamp and internal hash on line ${idx + 1}.`,
              line: idx + 1,
              remediation: 'Dim or abbreviate secondary timestamps and hashes in primary CLI output.'
            });
          }
        });
      }
      return findings;
    }
  },
  {
    id: 'UX-VIS-02',
    name: 'Highlight Variables, Paths, and URLs',
    ruleGroup: 'Visual Hierarchy & Formatting',
    severity: 'CRITICAL',
    description: 'Highlight variables, paths, and CLI flags with inline backticks.',
    heuristic: 'Wrap all file paths, variables, and flags in backticks.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      // Look for naked file paths in markdown text outside code blocks
      const nakedPathRegex = /(?:^|\s)(packages\/[a-zA-Z0-9_\-\/]+\.[a-z]+|\/(?:[a-zA-Z0-9_\-]+\/)+[a-zA-Z0-9_\-]+\.[a-z]+|\.\/[a-zA-Z0-9_\-\/]+\.[a-z]+)(?:\s|$|[.,;:])/;

      let inCodeBlock = false;
      lines.forEach((line, idx) => {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          return;
        }
        if (!inCodeBlock && !line.includes('`') && !line.startsWith('//') && !line.startsWith('*')) {
          const match = nakedPathRegex.exec(line);
          if (match) {
            findings.push({
              id: 'UX-VIS-02',
              severity: 'CRITICAL',
              ruleGroup: 'Visual Hierarchy & Formatting',
              description: `Un-highlighted file path "${match[1]}" found at line ${idx + 1}.`,
              line: idx + 1,
              remediation: `Wrap the path in backticks: \`${match[1]}\`.`
            });
          }
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-VIS-03',
    name: 'Fenced Code Block Language Tag Check',
    ruleGroup: 'Visual Hierarchy & Formatting',
    severity: 'HIGH',
    description: 'Fenced code blocks must specify an explicit language tag.',
    heuristic: 'Always specify the language tag on opening fenced code blocks (e.g., ```typescript).',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');

      let inBlock = false;
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('```')) {
          if (!inBlock) {
            // Opening fence
            inBlock = true;
            const lang = trimmed.slice(3).trim();
            if (lang.length === 0) {
              findings.push({
                id: 'UX-VIS-03',
                severity: 'HIGH',
                ruleGroup: 'Visual Hierarchy & Formatting',
                description: `Fenced code block at line ${idx + 1} is missing a language tag.`,
                line: idx + 1,
                remediation: 'Add a language identifier to the code fence (e.g. ```typescript, ```bash, ```json).'
              });
            }
          } else {
            // Closing fence
            inBlock = false;
          }
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-VIS-04',
    name: 'Frame Summary Outputs',
    ruleGroup: 'Visual Hierarchy & Formatting',
    severity: 'ADVISORY',
    description: 'Frame summary outputs in boxes or blockquotes if longer than 3 lines.',
    heuristic: 'Use a visual container (border or blockquote) for multi-line summary reports.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // If content contains a multi-line summary section that is unadorned
      if (input.content.includes('Summary:') && !input.content.includes('> [!') && !input.content.includes('```')) {
        const lines = input.content.split('\n');
        const summaryIdx = lines.findIndex(l => l.trim().startsWith('Summary:'));
        if (summaryIdx >= 0 && lines.slice(summaryIdx).filter(l => l.trim().length > 0).length > 4) {
          findings.push({
            id: 'UX-VIS-04',
            severity: 'ADVISORY',
            ruleGroup: 'Visual Hierarchy & Formatting',
            description: `Multi-line summary at line ${summaryIdx + 1} is unadorned.`,
            line: summaryIdx + 1,
            remediation: 'Frame summary outputs in blockquotes or structured boxes.'
          });
        }
      }
      return findings;
    }
  },
  {
    id: 'UX-VIS-05',
    name: 'Heading Hierarchy Jump Check',
    ruleGroup: 'Visual Hierarchy & Formatting',
    severity: 'HIGH',
    description: 'Heading levels must not skip increments (e.g., # to ### without ##).',
    heuristic: 'Maintain continuous heading hierarchy (do not jump heading levels).',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      let previousLevel = 0;

      let inCodeBlock = false;
      lines.forEach((line, idx) => {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          return;
        }
        if (inCodeBlock) return;

        const headingMatch = /^(#{1,6})\s+/.exec(line);
        if (headingMatch) {
          const currentLevel = headingMatch[1].length;
          if (previousLevel > 0 && currentLevel > previousLevel + 1) {
            findings.push({
              id: 'UX-VIS-05',
              severity: 'HIGH',
              ruleGroup: 'Visual Hierarchy & Formatting',
              description: `Heading level jumped from h${previousLevel} to h${currentLevel} at line ${idx + 1}.`,
              line: idx + 1,
              remediation: `Use heading level h${previousLevel + 1} instead of skipping to h${currentLevel}.`
            });
          }
          previousLevel = currentLevel;
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-VIS-06',
    name: 'Operation Summary Line',
    ruleGroup: 'Visual Hierarchy & Formatting',
    severity: 'HIGH',
    description: 'Provide a summary line at the end of large operations.',
    heuristic: 'Always summarize final operation results in the concluding output line.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // For cli_output with multiple steps, check if end line contains summary/concluding status
      if (input.targetType === 'cli_output') {
        const nonBlankLines = input.content.trim().split('\n').filter(l => l.trim().length > 0);
        if (nonBlankLines.length > 8) {
          const lastLine = nonBlankLines[nonBlankLines.length - 1];
          const hasConclusion = /(?:Summary|Completed|Finished|Done|Success|Failed|Passed|Result|Total)/i.test(lastLine);
          if (!hasConclusion) {
            findings.push({
              id: 'UX-VIS-06',
              severity: 'HIGH',
              ruleGroup: 'Visual Hierarchy & Formatting',
              description: 'Large operation output ends without a concluding summary line.',
              line: nonBlankLines.length,
              remediation: 'Provide a final summary line concluding the operation results.'
            });
          }
        }
      }
      return findings;
    }
  },
  {
    id: 'UX-VIS-07',
    name: 'Verified Success Banners Only',
    ruleGroup: 'Visual Hierarchy & Formatting',
    severity: 'CRITICAL',
    description: 'Never emit success banners (✅, ✔) for attempted, in-progress, or unverified actions.',
    heuristic: 'Only display success banner (✅) after completion and positive verification.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const unverifiedSuccessRegex = /(?:✅|✔)\s+.*?\b(?:attempting|starting|trying|will establish|in progress|initiating)\b/i;

      lines.forEach((line, idx) => {
        if (unverifiedSuccessRegex.test(line)) {
          findings.push({
            id: 'UX-VIS-07',
            severity: 'CRITICAL',
            ruleGroup: 'Visual Hierarchy & Formatting',
            description: `Success banner used for unverified/attempted action at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Only show success banner (✅) after action completion has been verified.'
          });
        }
      });
      return findings;
    }
  }
];
