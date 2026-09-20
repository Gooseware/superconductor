import { Finding, UxReviewInput, UxRule } from './types.js';

export const terminologyConsistencyRules: UxRule[] = [
  {
    id: 'UX-TRM-01',
    name: 'Structured Status Line Format',
    ruleGroup: 'Terminology & Naming Consistency',
    severity: 'CRITICAL',
    description: 'Follow UX-2 Structured Status Line Format precisely: [ICON] [MODULE]: [Action in present progressive]... [Details]',
    heuristic: 'Format status lines as: [ICON] [MODULE]: [Action in present progressive]... [Details]',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      
      // Check for malformed status lines in status reporting
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Look for candidate status line attempts that deviate
        if (
          (trimmed.startsWith('[superconductor]') || trimmed.startsWith('⏳') || trimmed.startsWith('✔') || trimmed.startsWith('❌')) &&
          !trimmed.startsWith('[superconductor] Intelligence:') &&
          !trimmed.startsWith('[superconductor] Status:')
        ) {
          // If it starts with icon but lacks MODULE: Action... format
          const standardUx2Regex = /^(?:⏳|✔|✖|⚠️|ℹ️|🔍|📓|✅|❌|\b[A-Z0-9_-]+)\s+[A-Z0-9_-]+:\s+[A-Z][a-z]+ing\b/;
          const superconductorHeaderRegex = /^\[superconductor(?::[a-z_-]+)?\]\s+.+$/;
          if (!standardUx2Regex.test(trimmed) && !superconductorHeaderRegex.test(trimmed)) {
            // Check if it's an attempted status line
            if (trimmed.includes('...') || trimmed.endsWith('.') || trimmed.includes(':')) {
              findings.push({
                id: 'UX-TRM-01',
                severity: 'CRITICAL',
                ruleGroup: 'Terminology & Naming Consistency',
                description: `Status line at line ${idx + 1} does not conform to UX-2 format.`,
                line: idx + 1,
                remediation: 'Format status line as: [ICON] [MODULE]: [Action in present progressive]... [Details] (e.g. "⏳ CORE: Bootstrapping environment... (pid 1234)").'
              });
            }
          }
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-TRM-02',
    name: 'Terminal Color Stripping',
    ruleGroup: 'Terminology & Naming Consistency',
    severity: 'HIGH',
    description: 'Support terminal color stripping (NO_COLOR env var); avoid unescaped ANSI codes.',
    heuristic: 'Respect NO_COLOR environment variable and strip ANSI escapes when color is disabled.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const rawAnsiRegex = /\x1b\[[0-9;]*m/;

      lines.forEach((line, idx) => {
        if (rawAnsiRegex.test(line)) {
          findings.push({
            id: 'UX-TRM-02',
            severity: 'HIGH',
            ruleGroup: 'Terminology & Naming Consistency',
            description: `Raw ANSI escape sequence detected at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Ensure output strips ANSI colors when NO_COLOR environment variable is set.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-TRM-03',
    name: 'Interactive Spinners For Long Operations',
    ruleGroup: 'Terminology & Naming Consistency',
    severity: 'HIGH',
    description: 'Provide interactive spinners for processes taking > 1 second.',
    heuristic: 'Display an interactive spinner with active status text for operations > 1s.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // In code_comments or skill_instruction, check if long running sync steps lack spinner guidance
      if (input.targetType === 'skill_instruction') {
        const lines = input.content.split('\n');
        lines.forEach((line, idx) => {
          if (/\b(?:wait|sleep|long-running|background task)\b/i.test(line) && !/spinner|progress|status line/i.test(input.content)) {
            findings.push({
              id: 'UX-TRM-03',
              severity: 'HIGH',
              ruleGroup: 'Terminology & Naming Consistency',
              description: `Long operation described at line ${idx + 1} without spinner or progress indicator specification.`,
              line: idx + 1,
              remediation: 'Specify an interactive spinner or progress indicator for long operations.'
            });
          }
        });
      }
      return findings;
    }
  },
  {
    id: 'UX-TRM-04',
    name: 'Spinner Cleanup On Exit',
    ruleGroup: 'Terminology & Naming Consistency',
    severity: 'ADVISORY',
    description: 'Clean up spinners on exit or process interruption.',
    heuristic: 'Always stop or clear spinners in finally blocks or SIGINT handlers.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const spinnerStartRegex = /\b(?:spinner|ora|spin)\.start\(/;
      if (spinnerStartRegex.test(input.content) && !input.content.includes('.stop()') && !input.content.includes('.succeed(') && !input.content.includes('.fail(')) {
        findings.push({
          id: 'UX-TRM-04',
          severity: 'ADVISORY',
          ruleGroup: 'Terminology & Naming Consistency',
          description: 'Spinner started without corresponding stop, succeed, or fail cleanup handler.',
          line: 1,
          remediation: 'Ensure spinner is cleanly stopped or cleared upon completion or error.'
        });
      }
      return findings;
    }
  },
  {
    id: 'UX-TRM-05',
    name: 'Safe Choice Prompt Defaults',
    ruleGroup: 'Terminology & Naming Consistency',
    severity: 'HIGH',
    description: 'Ensure destructive prompts default to safe choices (e.g., [y/N] where N is safe non-destructive).',
    heuristic: 'Default prompts to non-destructive choices ([y/N] for destructive actions).',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const destructivePromptRegex = /\b(?:delete|destroy|remove|drop|purge|overwrite|reset)\b.*?\[Y\/n\]/i;

      lines.forEach((line, idx) => {
        if (destructivePromptRegex.test(line)) {
          findings.push({
            id: 'UX-TRM-05',
            severity: 'HIGH',
            ruleGroup: 'Terminology & Naming Consistency',
            description: `Destructive prompt at line ${idx + 1} defaults to affirmative [Y/n].`,
            line: idx + 1,
            remediation: 'Default destructive action prompts to safe choice [y/N].'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-TRM-06',
    name: 'Banned Synonyms and Brand Capitalization',
    ruleGroup: 'Terminology & Naming Consistency',
    severity: 'CRITICAL',
    description: 'Adhere strictly to canonical terminology (prohibited synonyms: ticket, issue, task card -> track; story -> track; dev work -> implementation) and correct brand capitalization (TypeScript, GitHub, Node.js).',
    heuristic: 'Use canonical terms (track, spec, implementation) and exact brand capitalization (TypeScript, GitHub, Node.js).',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');

      const bannedSynonyms: Array<{ pattern: RegExp; canonical: string; termName: string }> = [
        { pattern: /\b(?:ticket|tickets)\b(?!\s+(?:tracker|service))/i, canonical: 'track', termName: 'ticket' },
        { pattern: /\btask\s+card\b/i, canonical: 'track', termName: 'task card' },
        { pattern: /\bdev\s+work\b/i, canonical: 'implementation', termName: 'dev work' },
        { pattern: /\brequirement\s+document\b/i, canonical: 'spec', termName: 'requirement document' }
      ];

      const brandCapitalizations: Array<{ pattern: RegExp; correct: string }> = [
        { pattern: /\bTypescript\b/, correct: 'TypeScript' },
        { pattern: /\bGithub\b/, correct: 'GitHub' },
        { pattern: /\b(?:Nodejs|Node\.JS)\b/, correct: 'Node.js' },
        { pattern: /\bJavascript\b/, correct: 'JavaScript' }
      ];

      lines.forEach((line, idx) => {
        // Skip markdown links or external tracker references if any
        if (line.includes('github.com/') || line.includes('file://')) return;

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
            trimmed.includes('`review board`'))
        ) {
          return;
        }

        for (const { pattern, canonical, termName } of bannedSynonyms) {
          if (pattern.test(line)) {
            findings.push({
              id: 'UX-TRM-06',
              severity: 'CRITICAL',
              ruleGroup: 'Terminology & Naming Consistency',
              description: `Prohibited synonym "${termName}" found at line ${idx + 1}.`,
              line: idx + 1,
              remediation: `Use canonical term "${canonical}" instead of "${termName}".`
            });
          }
        }

        for (const { pattern, correct } of brandCapitalizations) {
          if (pattern.test(line)) {
            findings.push({
              id: 'UX-TRM-06',
              severity: 'CRITICAL',
              ruleGroup: 'Terminology & Naming Consistency',
              description: `Incorrect brand capitalization at line ${idx + 1}.`,
              line: idx + 1,
              remediation: `Use canonical brand capitalization "${correct}".`
            });
          }
        }
      });

      return findings;
    }
  },
  {
    id: 'UX-TRM-07',
    name: 'Clear Screen Scope',
    ruleGroup: 'Terminology & Naming Consistency',
    severity: 'HIGH',
    description: 'Clear screen only when launching full-screen apps, not inline CLI commands.',
    heuristic: 'Do not clear terminal screen in non-fullscreen CLI executions.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const clearScreenRegex = /\b(?:console\.clear\(\)|\x1b\[2J)\b/;

      lines.forEach((line, idx) => {
        if (clearScreenRegex.test(line)) {
          findings.push({
            id: 'UX-TRM-07',
            severity: 'HIGH',
            ruleGroup: 'Terminology & Naming Consistency',
            description: `Inline clear screen invocation detected at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Only clear screen when launching dedicated full-screen TUI apps.'
          });
        }
      });
      return findings;
    }
  }
];
