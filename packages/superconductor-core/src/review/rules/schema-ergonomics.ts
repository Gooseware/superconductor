import { Finding, UxReviewInput, UxRule } from './types.js';

export const schemaErgonomicsRules: UxRule[] = [
  {
    id: 'UX-SCH-01',
    name: '7-Element Diagnostic Model',
    ruleGroup: 'Schema & API Ergonomics',
    severity: 'CRITICAL',
    description: 'Structured diagnostic errors must contain actionable elements (code, headline, coordinates, remediation).',
    heuristic: 'Adhere to structured diagnostic reporting for all errors.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // When content defines error diagnostics or error schema
      if (input.content.includes('class ') && input.content.includes('Error extends Error')) {
        if (!input.content.includes('code') && !input.content.includes('remediation')) {
          findings.push({
            id: 'UX-SCH-01',
            severity: 'CRITICAL',
            ruleGroup: 'Schema & API Ergonomics',
            description: 'Custom Error class does not implement standard diagnostic fields (code, remediation).',
            line: 1,
            remediation: 'Implement structured error properties: code, headline, cause, and remediation.'
          });
        }
      }
      return findings;
    }
  },
  {
    id: 'UX-SCH-02',
    name: 'Searchable Error IDs',
    ruleGroup: 'Schema & API Ergonomics',
    severity: 'HIGH',
    description: 'Error IDs must be uniquely searchable (e.g. UX-OUT-01, ERR_CONFIG_MISSING).',
    heuristic: 'Use structured, prefixed codes for all error definitions.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const unsearchableErrorRegex = /\b(?:code|errorId|id)\s*:\s*['"](?:error|err|fail|\d+)['"]/i;

      lines.forEach((line, idx) => {
        if (unsearchableErrorRegex.test(line)) {
          findings.push({
            id: 'UX-SCH-02',
            severity: 'HIGH',
            ruleGroup: 'Schema & API Ergonomics',
            description: `Generic or unsearchable error identifier found at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Assign a structured, searchable error identifier (e.g., UX-OUT-01 or ERR_INVALID_SNAPSHOT).'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-SCH-03',
    name: 'Executable Remediation Steps',
    ruleGroup: 'Schema & API Ergonomics',
    severity: 'CRITICAL',
    description: 'Remediation steps must be executable or concrete (e.g. copy-pasteable commands).',
    heuristic: 'Always provide copy-pasteable commands or explicit actions in remediation advice.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const vagueRemediationRegex = /\bremediation\s*:\s*['"](?:fix it|try again|contact support|resolve the error|check logs)['"]/i;

      lines.forEach((line, idx) => {
        if (vagueRemediationRegex.test(line)) {
          findings.push({
            id: 'UX-SCH-03',
            severity: 'CRITICAL',
            ruleGroup: 'Schema & API Ergonomics',
            description: `Vague or non-executable remediation at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Provide an exact command or concrete action in the remediation advice.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-SCH-04',
    name: 'User vs System Failure Distinction',
    ruleGroup: 'Schema & API Ergonomics',
    severity: 'HIGH',
    description: 'Clearly distinguish user input mistakes from internal system failures.',
    heuristic: 'Classify errors explicitly as either UserError or SystemError.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // Check if error output conflates internal exception with invalid user argument
      if (input.content.includes('Invalid user input: NullPointerException') || input.content.includes('User error: ECONNREFUSED')) {
        findings.push({
          id: 'UX-SCH-04',
          severity: 'HIGH',
          ruleGroup: 'Schema & API Ergonomics',
          description: 'Internal system failure incorrectly categorized as a user error.',
          line: 1,
          remediation: 'Classify internal system exceptions separately from user validation failures.'
        });
      }
      return findings;
    }
  },
  {
    id: 'UX-SCH-05',
    name: 'Log To Disk With Concise CLI Output',
    ruleGroup: 'Schema & API Ergonomics',
    severity: 'ADVISORY',
    description: 'Log detailed errors to disk and show concise error references in CLI.',
    heuristic: 'Direct full diagnostics to log files and output a short summary with the log file URI.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      if (input.targetType === 'cli_output' && input.content.split('\n').length > 40 && input.content.includes('Error:')) {
        if (!input.content.includes('.log') && !input.content.includes('file://')) {
          findings.push({
            id: 'UX-SCH-05',
            severity: 'ADVISORY',
            ruleGroup: 'Schema & API Ergonomics',
            description: 'Large error diagnostic dumped to CLI without disk log file reference.',
            line: 1,
            remediation: 'Write verbose diagnostic output to a log file and display: "Logs available at: <logPath>".'
          });
        }
      }
      return findings;
    }
  },
  {
    id: 'UX-SCH-06',
    name: 'MCP Tool Description Check',
    ruleGroup: 'Schema & API Ergonomics',
    severity: 'HIGH',
    description: 'MCP tools and parameters must provide non-empty description fields.',
    heuristic: 'Every MCP tool and input property must document its purpose in description.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      if (input.targetType === 'mcp_schema' || input.content.includes('CallToolRequestSchema') || input.content.includes('ListToolsRequestSchema')) {
        // Look for tool declarations with empty or missing descriptions
        const emptyDescRegex = /description\s*:\s*['"]\s*['"]/;
        const lines = input.content.split('\n');
        lines.forEach((line, idx) => {
          if (emptyDescRegex.test(line)) {
            findings.push({
              id: 'UX-SCH-06',
              severity: 'HIGH',
              ruleGroup: 'Schema & API Ergonomics',
              description: `Empty MCP schema description at line ${idx + 1}.`,
              line: idx + 1,
              remediation: 'Provide a meaningful description explaining the tool or parameter purpose.'
            });
          }
        });
      }
      return findings;
    }
  },
  {
    id: 'UX-SCH-07',
    name: 'Parameters Null Check',
    ruleGroup: 'Schema & API Ergonomics',
    severity: 'CRITICAL',
    description: 'MCP tool handlers and schemas must explicitly handle null/undefined parameters.',
    heuristic: 'Guard parameter destructuring with null/undefined checks.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      // Look for unsafe parameter access without guard: request.params.arguments.x without check
      const unsafeParamsRegex = /request\.params\.arguments\.([a-zA-Z0-9_]+)/;

      lines.forEach((line, idx) => {
        if (unsafeParamsRegex.test(line) && !line.includes('?.') && !input.content.includes('if (!request.params.arguments)')) {
          findings.push({
            id: 'UX-SCH-07',
            severity: 'CRITICAL',
            ruleGroup: 'Schema & API Ergonomics',
            description: `Unsafe parameter access without null guard at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Use optional chaining (?.) or validate that request.params.arguments is non-null.'
          });
        }
      });
      return findings;
    }
  }
];
