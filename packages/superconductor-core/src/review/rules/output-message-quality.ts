import { Finding, UxReviewInput, UxRule } from './types.js';

export const outputMessageQualityRules: UxRule[] = [
  {
    id: 'UX-OUT-01',
    name: 'No Naked Print Statements',
    ruleGroup: 'Output Message Quality',
    severity: 'CRITICAL',
    description: 'No naked print statements. All outputs must route through UI layer or structured logger.',
    heuristic: 'Route all outputs through the UI layer or structured logger.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const nakedPrintRegex = /\b(?:console\.(?:log|error|warn|info)|print|fmt\.Println)\s*\(/;

      lines.forEach((line, idx) => {
        // Only flag if code/cli context or explicit print statement found outside markdown code comments
        if (input.targetType === 'code_comments' || input.targetType === 'cli_output' || !input.targetType) {
          if (nakedPrintRegex.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
            findings.push({
              id: 'UX-OUT-01',
              severity: 'CRITICAL',
              ruleGroup: 'Output Message Quality',
              description: `Naked print statement detected at line ${idx + 1}.`,
              line: idx + 1,
              remediation: 'Route output through the structured UI layer or logger instead of bare print statements.'
            });
          }
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-OUT-02',
    name: 'Terminal Line Length Limit',
    ruleGroup: 'Output Message Quality',
    severity: 'HIGH',
    description: 'Max 80 characters per line in terminal outputs.',
    heuristic: 'Wrap CLI text at 80 characters.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // Apply primarily when targetType is cli_output or default
      if (input.targetType !== 'cli_output' && input.targetType !== undefined) {
        return findings;
      }
      const lines = input.content.split('\n');
      lines.forEach((line, idx) => {
        // Ignore table rows, URLs, or markdown fences
        if (line.includes('http://') || line.includes('https://') || line.trim().startsWith('|') || line.trim().startsWith('```')) {
          return;
        }
        if (line.length > 80) {
          findings.push({
            id: 'UX-OUT-02',
            severity: 'HIGH',
            ruleGroup: 'Output Message Quality',
            description: `Line ${idx + 1} exceeds terminal limit of 80 characters (${line.length} chars).`,
            line: idx + 1,
            remediation: 'Wrap line to at most 80 characters.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-OUT-03',
    name: 'Whitespace Chunking',
    ruleGroup: 'Output Message Quality',
    severity: 'HIGH',
    description: 'Use whitespace to chunk logical blocks; avoid long unseparated walls of text.',
    heuristic: 'Chunk logical blocks with blank lines.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      if (input.targetType !== 'cli_output' && input.targetType !== undefined) {
        return findings;
      }
      const lines = input.content.split('\n');
      let consecutiveNonEmpty = 0;
      let startLine = 1;
      let inCodeBlock = false;

      lines.forEach((line, idx) => {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          consecutiveNonEmpty = 0;
          return;
        }
        if (inCodeBlock) return;

        if (line.trim().length > 0) {
          if (consecutiveNonEmpty === 0) startLine = idx + 1;
          consecutiveNonEmpty++;
          if (consecutiveNonEmpty > 15) {
            findings.push({
              id: 'UX-OUT-03',
              severity: 'HIGH',
              ruleGroup: 'Output Message Quality',
              description: `Dense block of ${consecutiveNonEmpty} consecutive lines without whitespace chunking starting at line ${startLine}.`,
              line: startLine,
              remediation: 'Insert empty lines to visually chunk logical blocks.'
            });
            consecutiveNonEmpty = 0; // reset to avoid repeating for every line
          }
        } else {
          consecutiveNonEmpty = 0;
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-OUT-04',
    name: 'Strip Trailing Whitespace',
    ruleGroup: 'Output Message Quality',
    severity: 'ADVISORY',
    description: 'Strip trailing whitespace from lines.',
    heuristic: 'Ensure all lines have trailing whitespace stripped.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      lines.forEach((line, idx) => {
        if (/[ \t]+$/.test(line)) {
          findings.push({
            id: 'UX-OUT-04',
            severity: 'ADVISORY',
            ruleGroup: 'Output Message Quality',
            description: `Trailing whitespace found on line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Remove trailing spaces or tabs.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-OUT-05',
    name: 'Raw Stack Traces Leakage',
    ruleGroup: 'Output Message Quality',
    severity: 'CRITICAL',
    description: 'Never output raw stack traces directly to the user.',
    heuristic: 'Catch internal errors and present human-readable diagnostic messages instead of raw stack traces.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const stackTraceRegex = /^\s*at\s+(?:.+?\s+\()?.+?:\d+:\d+\)?$/;
      const pythonTracebackRegex = /^Traceback \(most recent call last\):/;

      lines.forEach((line, idx) => {
        if (stackTraceRegex.test(line) || pythonTracebackRegex.test(line)) {
          findings.push({
            id: 'UX-OUT-05',
            severity: 'CRITICAL',
            ruleGroup: 'Output Message Quality',
            description: `Raw stack trace detected at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Format error into a user-friendly diagnostic message; hide raw stack traces behind a --verbose flag.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-OUT-06',
    name: 'Actionable Error Check With Remediation',
    ruleGroup: 'Output Message Quality',
    severity: 'HIGH',
    description: 'Error messages must include an actionable remediation step.',
    heuristic: 'Pair every failure or error indicator with a clear remediation step.',
    evaluate: (input: UxReviewInput): Finding[] => {
      if (input.filePath?.endsWith('processor-heuristics.md') || input.content.includes('# Processor Heuristics')) {
        return [];
      }
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const errorIndicatorRegex = /\b(?:Error:|FAILED|FAILURE|Failed to|❌|✖|\[FAIL\])/i;
      const remediationKeywords = /(?:^|\s)(?:Run:|To fix:|Remediation:|Try:|Fix:|Suggested fix:|Usage:)/i;

      // If the content contains an error indicator, check if remediation is present
      let hasError = false;
      let errorLine = 1;
      lines.forEach((line, idx) => {
        if (errorIndicatorRegex.test(line) && !line.includes('UX-') && !line.includes('ruleGroup')) {
          if (!hasError) {
            hasError = true;
            errorLine = idx + 1;
          }
        }
      });

      if (hasError && !remediationKeywords.test(input.content)) {
        findings.push({
          id: 'UX-OUT-06',
          severity: 'HIGH',
          ruleGroup: 'Output Message Quality',
          description: `Error message detected around line ${errorLine} without an actionable remediation step.`,
          line: errorLine,
          remediation: 'Provide an actionable remediation step (e.g. "Run: <command> to fix").'
        });
      }
      return findings;
    }
  },
  {
    id: 'UX-OUT-07',
    name: 'Single-Line Glancability',
    ruleGroup: 'Output Message Quality',
    severity: 'HIGH',
    description: 'Respect quiet mode and provide single-line glancability for status outputs.',
    heuristic: 'Provide a concise single-line glancable status block for operations.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      if (input.targetType === 'cli_output') {
        const lines = input.content.trim().split('\n').filter(l => l.trim().length > 0);
        // If output has multiple lines but lacks any status or summary headline
        const hasSummaryOrStatus = lines.some(l => 
          l.startsWith('[') || l.startsWith('✔') || l.startsWith('✖') || 
          l.startsWith('✅') || l.startsWith('❌') || l.includes('Status:') || l.includes('Summary:')
        );
        if (lines.length > 5 && !hasSummaryOrStatus) {
          findings.push({
            id: 'UX-OUT-07',
            severity: 'HIGH',
            ruleGroup: 'Output Message Quality',
            description: 'Multi-line CLI output lacks a concise single-line glancable status block.',
            line: 1,
            remediation: 'Include a single-line glancable status indicator (e.g., "[superconductor] Status: ...").'
          });
        }
      }
      return findings;
    }
  }
];
