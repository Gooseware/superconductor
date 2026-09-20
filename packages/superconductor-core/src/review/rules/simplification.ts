import { Finding, UxReviewInput, UxRule } from './types.js';

export const simplificationRules: UxRule[] = [
  {
    id: 'UX-SMP-01',
    name: 'Terminology Lexicon Compliance',
    ruleGroup: 'Simplification / Do More With Less',
    severity: 'CRITICAL',
    description: 'Adhere strictly to the canonical Terminology Lexicon (track, spec, implementation, quorum, skill).',
    heuristic: 'Never use prohibited synonyms (ticket, task card, dev work, review board).',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');

      const prohibitedLexicon = [
        { regex: /\b(?:review\s+panel|review\s+board)\b/i, term: 'review board', canonical: 'quorum' },
        { regex: /\bdev\s+work\b/i, term: 'dev work', canonical: 'implementation' },
        { regex: /\brequirement\s+document\b/i, term: 'requirement document', canonical: 'spec' }
      ];

      lines.forEach((line, idx) => {
        if (line.includes('UX-SMP-01')) return;

        const trimmed = line.trim();
        // Skip lines if they are part of a terminology definition table
        if (
          trimmed.startsWith('|') &&
          (trimmed.includes('Canonical') ||
            trimmed.includes('Prohibited') ||
            trimmed.includes('| track |') ||
            trimmed.includes('| spec |') ||
            trimmed.includes('| implementation |') ||
            trimmed.includes('| quorum |') ||
            trimmed.includes('| skill |') ||
            trimmed.includes('| track') ||
            trimmed.includes('| spec') ||
            trimmed.includes('| implementation') ||
            trimmed.includes('| quorum') ||
            trimmed.includes('| skill') ||
            trimmed.includes('`track`') ||
            trimmed.includes('`spec`') ||
            trimmed.includes('`implementation`') ||
            trimmed.includes('`quorum`') ||
            trimmed.includes('`ticket`') ||
            trimmed.includes('`issue`') ||
            trimmed.includes('`task card`') ||
            trimmed.includes('`dev work`') ||
            trimmed.includes('`review board`') ||
            trimmed.includes('`review panel`') ||
            trimmed.includes('`requirement document`'))
        ) {
          return;
        }

        for (const item of prohibitedLexicon) {
          if (item.regex.test(line)) {
            findings.push({
              id: 'UX-SMP-01',
              severity: 'CRITICAL',
              ruleGroup: 'Simplification / Do More With Less',
              description: `Prohibited terminology "${item.term}" found at line ${idx + 1}.`,
              line: idx + 1,
              remediation: `Replace "${item.term}" with canonical term "${item.canonical}".`
            });
          }
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-SMP-02',
    name: 'Throat-Clearing Removal',
    ruleGroup: 'Simplification / Do More With Less',
    severity: 'HIGH',
    description: 'Eliminate conversational throat-clearing phrases that delay high-signal content.',
    heuristic: 'State the rule or instruction directly; remove phrases like "Needless to say", "In this section we will".',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');

      const throatClearingPatterns = [
        /\bIn this section\b/i,
        /\bAs mentioned previously\b/i,
        /\bNeedless to say\b/i,
        /\bIt goes without saying\b/i,
        /\bFirst and foremost\b/i,
        /\bIt should be noted that\b/i,
        /\bIn order to\b/i
      ];

      lines.forEach((line, idx) => {
        if (line.includes('UX-SMP-02') || line.includes('throatClearingPatterns')) return;
        for (const pattern of throatClearingPatterns) {
          if (pattern.test(line)) {
            findings.push({
              id: 'UX-SMP-02',
              severity: 'HIGH',
              ruleGroup: 'Simplification / Do More With Less',
              description: `Throat-clearing conversational filler detected at line ${idx + 1}.`,
              line: idx + 1,
              remediation: 'Remove throat-clearing introductory phrase and state the point directly.'
            });
            break;
          }
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-SMP-03',
    name: 'Combine Redundant Status Messages',
    ruleGroup: 'Simplification / Do More With Less',
    severity: 'ADVISORY',
    description: 'Combine consecutive redundant status messages into a single concise update.',
    heuristic: 'Consolidate multiple adjacent progress messages into one informative line.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      let prevStatus = '';

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('⏳') || trimmed.startsWith('[superconductor]')) {
          if (trimmed === prevStatus) {
            findings.push({
              id: 'UX-SMP-03',
              severity: 'ADVISORY',
              ruleGroup: 'Simplification / Do More With Less',
              description: `Duplicate consecutive status message at line ${idx + 1}.`,
              line: idx + 1,
              remediation: 'Combine or deduplicate consecutive status messages.'
            });
          }
          prevStatus = trimmed;
        } else if (trimmed.length > 0) {
          prevStatus = '';
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-SMP-04',
    name: 'Do Not Ask For Deducible Information',
    ruleGroup: 'Simplification / Do More With Less',
    severity: 'HIGH',
    description: 'Do not prompt the user for information the system can deduce automatically.',
    heuristic: 'Detect environment, project root, and git branch programmatically rather than prompting.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const askDeducibleRegex = /\b(?:Please enter|What is)\s+(?:your\s+)?(?:project root|git root|current directory|workspace path)\b/i;

      lines.forEach((line, idx) => {
        if (askDeducibleRegex.test(line)) {
          findings.push({
            id: 'UX-SMP-04',
            severity: 'HIGH',
            ruleGroup: 'Simplification / Do More With Less',
            description: `Prompt requests deducible system information at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Derive project root automatically via `git rev-parse --show-toplevel` instead of prompting.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-SMP-05',
    name: 'Single Primary Outcome Per Command',
    ruleGroup: 'Simplification / Do More With Less',
    severity: 'CRITICAL',
    description: 'One command must map to one primary outcome; do not chain unrelated actions.',
    heuristic: 'Ensure each command does one thing well.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const overloadedCommandRegex = /\b(?:runs\s+tests\s+and\s+deploys\s+to\s+prod|compiles\s+and\s+publishes\s+and\s+notifies)\b/i;

      lines.forEach((line, idx) => {
        if (overloadedCommandRegex.test(line)) {
          findings.push({
            id: 'UX-SMP-05',
            severity: 'CRITICAL',
            ruleGroup: 'Simplification / Do More With Less',
            description: `Command specification combines multiple unrelated outcomes at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Separate independent operations into distinct commands or stages.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-SMP-06',
    name: 'Verbosity and Redundant Parentheticals Check',
    ruleGroup: 'Simplification / Do More With Less',
    severity: 'HIGH',
    description: 'Remove redundant parenthetical explanations that restate what the code or identifier already conveys.',
    heuristic: 'Avoid parentheticals that merely echo the variable or command name.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      // Look for redundant parentheticals like `foo()` (which calls foo) or `path` (the path to the file)
      const redundantParenRegex = /`?([a-zA-Z0-9_]+)(?:\(\))?`?\s*\(\s*(?:which\s+(?:calls|runs|is|executes)|the\s+[a-zA-Z0-9_]+\s+of\b)/i;

      lines.forEach((line, idx) => {
        if (line.includes('UX-SMP-06') || line.includes('redundantParenRegex')) return;
        const match = redundantParenRegex.exec(line);
        if (match) {
          findings.push({
            id: 'UX-SMP-06',
            severity: 'HIGH',
            ruleGroup: 'Simplification / Do More With Less',
            description: `Redundant parenthetical explanation found at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Remove the redundant parenthetical that echoes the code or identifier.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-SMP-07',
    name: 'Pre-Render Validation Check',
    ruleGroup: 'Simplification / Do More With Less',
    severity: 'CRITICAL',
    description: 'Ensure output satisfies UX-Reviewer constraints before rendering; detect unresolved template placeholders.',
    heuristic: 'Never output unrendered template tags ({{...}}) or TODO placeholders to the user.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const unresolvedPlaceholderRegex = /\{\{[a-zA-Z0-9_]+\}\}|<TODO:\s*[^>]+>|TODO:\s*fill in/i;

      lines.forEach((line, idx) => {
        if (line.includes('UX-SMP-07') || line.includes('unresolvedPlaceholderRegex')) return;
        // In skill instructions or documentation, backticked template parameters or {{args}} are documentation, not unrendered leaks
        if (input.targetType === 'skill_instruction' && (line.includes('{{args}}') || line.includes('`{{'))) return;
        if (unresolvedPlaceholderRegex.test(line)) {
          findings.push({
            id: 'UX-SMP-07',
            severity: 'CRITICAL',
            ruleGroup: 'Simplification / Do More With Less',
            description: `Unrendered placeholder or template tag detected at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Resolve or replace template placeholders before rendering output.'
          });
        }
      });
      return findings;
    }
  }
];
