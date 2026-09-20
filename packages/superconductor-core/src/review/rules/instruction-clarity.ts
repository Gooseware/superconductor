import { Finding, UxReviewInput, UxRule } from './types.js';

export const instructionClarityRules: UxRule[] = [
  {
    id: 'UX-INS-01',
    name: 'Active Voice Detection',
    ruleGroup: 'Instruction Clarity & Atomicity',
    severity: 'CRITICAL',
    description: 'Write instructions and status messages in active voice.',
    heuristic: 'Avoid passive voice; state the actor and action clearly (e.g. "Failed to load", not "Loading was failed").',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');

      const passivePatterns = [
        /\b(?:is|are|was|were|be|been|being)\s+(?:[a-z]+ed|[a-z]+en)\s+by\b/i,
        /\bwas failed\b/i,
        /\bis processed by\b/i,
        /\bhas been deleted by\b/i,
        /\bwas executed by\b/i,
        /\bwas created by\b/i,
        /\bis required to be\s+[a-z]+ed\b/i
      ];

      lines.forEach((line, idx) => {
        // Don't flag in rule descriptions or definitions
        if (line.includes('UX-INS-01') || line.includes('ruleGroup') || input.filePath?.endsWith('processor-heuristics.md') || input.content.includes('# Processor Heuristics')) return;

        for (const pattern of passivePatterns) {
          if (pattern.test(line)) {
            findings.push({
              id: 'UX-INS-01',
              severity: 'CRITICAL',
              ruleGroup: 'Instruction Clarity & Atomicity',
              description: `Passive voice detected at line ${idx + 1}.`,
              line: idx + 1,
              remediation: 'Rewrite in active voice (e.g., "The agent creates the branch" instead of "The branch was created by the agent").'
            });
            break;
          }
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-INS-02',
    name: 'Front-Load Conditions',
    ruleGroup: 'Instruction Clarity & Atomicity',
    severity: 'HIGH',
    description: 'Front-load conditions (e.g., "To exit, press Q" instead of "Press Q to exit").',
    heuristic: 'State the goal or condition before the action (e.g. "To abort, press Ctrl+C").',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const actionBeforeConditionRegex = /^\s*Press\s+[A-Z0-9+]+\s+to\s+[a-z]+/i;

      lines.forEach((line, idx) => {
        if (actionBeforeConditionRegex.test(line)) {
          findings.push({
            id: 'UX-INS-02',
            severity: 'HIGH',
            ruleGroup: 'Instruction Clarity & Atomicity',
            description: `Instruction at line ${idx + 1} does not front-load the condition.`,
            line: idx + 1,
            remediation: 'Front-load the condition (e.g., "To exit, press Q" instead of "Press Q to exit").'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-INS-03',
    name: 'RFC 2119 Uppercase Check',
    ruleGroup: 'Instruction Clarity & Atomicity',
    severity: 'HIGH',
    description: 'Normative instructions must use uppercase RFC 2119 keywords (MUST, SHOULD, MUST NOT, SHOULD NOT, SHALL).',
    heuristic: 'Always capitalize normative requirements: MUST, SHOULD, MUST NOT.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // Only check instructions, skills, or prompt markdown
      if (input.targetType === 'code_comments') return findings;

      const lines = input.content.split('\n');
      const lowercaseRfcRegex = /\b(?:the\s+agent\s+|subagent\s+|caller\s+|you\s+|orchestrator\s+|subsystem\s+|function\s+)(must|should|must not|should not|shall)\b/i;

      lines.forEach((line, idx) => {
        // Skip quotes, links, and rule definitions
        if (line.includes('UX-INS-03') || line.includes('```')) return;
        const match = lowercaseRfcRegex.exec(line);
        if (match && match[1] === match[1].toLowerCase()) {
          findings.push({
            id: 'UX-INS-03',
            severity: 'HIGH',
            ruleGroup: 'Instruction Clarity & Atomicity',
            description: `Lowercase RFC 2119 keyword "${match[1]}" found at line ${idx + 1}.`,
            line: idx + 1,
            remediation: `Capitalize RFC 2119 keyword to "${match[1].toUpperCase()}".`
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-INS-04',
    name: 'Avoid Filler Words',
    ruleGroup: 'Instruction Clarity & Atomicity',
    severity: 'ADVISORY',
    description: 'Avoid polite conversational filler words (please, kindly) in procedural instructions.',
    heuristic: 'State commands crisply without polite fillers.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const fillerRegex = /^\s*(?:[-*]|\d+\.)?\s*(?:Please|Kindly)\s+/i;

      lines.forEach((line, idx) => {
        if (fillerRegex.test(line)) {
          findings.push({
            id: 'UX-INS-04',
            severity: 'ADVISORY',
            ruleGroup: 'Instruction Clarity & Atomicity',
            description: `Filler word found at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Remove conversational filler words like "please" or "kindly" to make instructions crisp and direct.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-INS-05',
    name: 'Never Blame The User',
    ruleGroup: 'Instruction Clarity & Atomicity',
    severity: 'CRITICAL',
    description: 'Never blame the user; frame errors objectively around missing input or system state.',
    heuristic: 'Never frame failures as user faults ("you forgot to", "you made an error").',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const blameRegex = /\b(?:you failed to|you made an error|your mistake|you forgot to|user error)\b/i;

      lines.forEach((line, idx) => {
        if (blameRegex.test(line)) {
          findings.push({
            id: 'UX-INS-05',
            severity: 'CRITICAL',
            ruleGroup: 'Instruction Clarity & Atomicity',
            description: `User-blaming language detected at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Rephrase to state the missing parameter or system condition without accusing the user.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-INS-06',
    name: 'Step Atomicity',
    ruleGroup: 'Instruction Clarity & Atomicity',
    severity: 'HIGH',
    description: 'Instruction steps must be atomic; do not combine multiple distinct operations in a single step.',
    heuristic: 'Each procedural step must represent one atomic action.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const compoundStepRegex = /^\s*(?:[-*]|\d+\.)\s+.*?\b(?:and then also|and after that run|and then immediately run)\b/i;

      lines.forEach((line, idx) => {
        if (compoundStepRegex.test(line)) {
          findings.push({
            id: 'UX-INS-06',
            severity: 'HIGH',
            ruleGroup: 'Instruction Clarity & Atomicity',
            description: `Compound non-atomic step detected at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Split compound step into distinct, atomic numbered or bulleted items.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-INS-07',
    name: 'Code Blocks For Commands',
    ruleGroup: 'Instruction Clarity & Atomicity',
    severity: 'HIGH',
    description: 'Use code blocks or inline backticks for copy-pasteable commands.',
    heuristic: 'Always format shell commands in backticks or code blocks.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const bareCommandRegex = /^\s*(?:npm (?:run|test|build)|git (?:commit|checkout|push)|npx (?:vitest|tsc)|node dist\/)\b/;

      let inCodeBlock = false;
      lines.forEach((line, idx) => {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          return;
        }
        if (!inCodeBlock && bareCommandRegex.test(line) && !line.includes('`')) {
          findings.push({
            id: 'UX-INS-07',
            severity: 'HIGH',
            ruleGroup: 'Instruction Clarity & Atomicity',
            description: `Unformatted shell command detected at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Wrap copy-pasteable command in backticks or a fenced code block.'
          });
        }
      });
      return findings;
    }
  }
];
