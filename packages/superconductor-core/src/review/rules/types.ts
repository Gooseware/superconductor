export interface UxReviewInput {
  content: string; // text content to review (markdown, CLI output, code comments, prompt)
  filePath?: string;
  targetType?: 'cli_output' | 'skill_instruction' | 'mcp_schema' | 'code_comments';
  mode?: 'quorum' | 'processor';
}

export interface Finding {
  id: string; // e.g. UX-OUT-01, UX-TRM-01
  severity: 'CRITICAL' | 'HIGH' | 'ADVISORY';
  ruleGroup: string;
  description: string;
  line?: number;
  remediation: string;
}

export interface UxReviewReport {
  verdict: 'PASS' | 'NEEDS_FIXES';
  findings: Finding[];
  coverage_manifest: string[];
  summary: {
    totalRulesChecked: number;
    passedRules: number;
    failedRules: number;
  };
}

export interface UxRule {
  id: string; // e.g. UX-OUT-01
  name: string;
  ruleGroup: string;
  severity: 'CRITICAL' | 'HIGH' | 'ADVISORY';
  description: string;
  heuristic: string; // Generative heuristic for processor mode
  evaluate: (input: UxReviewInput) => Finding[];
}
