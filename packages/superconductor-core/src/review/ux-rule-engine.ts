import {
  UxReviewInput,
  Finding,
  UxReviewReport,
  UxRule,
  ALL_UX_RULES
} from './rules/index.js';

export {
  UxReviewInput,
  Finding,
  UxReviewReport,
  UxRule
} from './rules/index.js';

export class UxRuleEngine {
  private rules: UxRule[];

  constructor(customRules?: UxRule[]) {
    this.rules = customRules ?? [...ALL_UX_RULES];
  }

  /**
   * Return all rules registered in the engine.
   */
  public getRules(): UxRule[] {
    return this.rules;
  }

  /**
   * Retrieve a specific rule by ID.
   */
  public getRule(id: string): UxRule | undefined {
    return this.rules.find(r => r.id === id);
  }

  /**
   * Return all active generative heuristics (for PROCESSOR mode pre-loading).
   */
  public getHeuristics(): Array<{ id: string; ruleGroup: string; heuristic: string }> {
    return this.rules.map(r => ({
      id: r.id,
      ruleGroup: r.ruleGroup,
      heuristic: r.heuristic
    }));
  }

  /**
   * Evaluates input content against all registered UX rules.
   */
  public evaluate(input: UxReviewInput): UxReviewReport {
    const findings: Finding[] = [];
    const coverage_manifest: string[] = [];
    let failedRulesCount = 0;

    const effectiveTargetType = input.targetType ?? (
      input.filePath?.endsWith('.md') ? 'skill_instruction' :
      input.filePath?.endsWith('.json') ? 'mcp_schema' :
      (input.filePath?.endsWith('.ts') || input.filePath?.endsWith('.js')) ? 'code_comments' :
      undefined
    );
    const resolvedInput = effectiveTargetType !== input.targetType ? { ...input, targetType: effectiveTargetType } : input;

    for (const rule of this.rules) {
      coverage_manifest.push(rule.id);
      try {
        const ruleFindings = rule.evaluate(resolvedInput);
        if (ruleFindings && ruleFindings.length > 0) {
          failedRulesCount++;
          findings.push(...ruleFindings);
        }
      } catch (err: any) {
        // Fallback safety if a predicate throws
        failedRulesCount++;
        findings.push({
          id: rule.id,
          severity: 'HIGH',
          ruleGroup: rule.ruleGroup,
          description: `Rule evaluation failed: ${err.message ?? String(err)}`,
          remediation: 'Inspect input content and rule predicate.'
        });
      }
    }

    const totalRulesChecked = this.rules.length;
    const passedRules = totalRulesChecked - failedRulesCount;

    // In QUORUM mode, non-advisory findings (CRITICAL or HIGH) block with NEEDS_FIXES
    const hasBlockingFindings = findings.some(
      f => f.severity === 'CRITICAL' || f.severity === 'HIGH'
    );
    const verdict: 'PASS' | 'NEEDS_FIXES' = hasBlockingFindings ? 'NEEDS_FIXES' : 'PASS';

    return {
      verdict,
      findings,
      coverage_manifest,
      summary: {
        totalRulesChecked,
        passedRules,
        failedRules: failedRulesCount
      }
    };
  }

  /**
   * Static convenience evaluator using standard 56 rules.
   */
  public static evaluate(input: UxReviewInput): UxReviewReport {
    const engine = new UxRuleEngine();
    return engine.evaluate(input);
  }

  /**
   * Static access to default rule registry.
   */
  public static getRules(): UxRule[] {
    return [...ALL_UX_RULES];
  }

  /**
   * Static access to retrieve a rule by ID.
   */
  public static getRule(id: string): UxRule | undefined {
    return ALL_UX_RULES.find(r => r.id === id);
  }

  /**
   * Static access to generative heuristics for processor mode.
   */
  public static getHeuristics(): Array<{ id: string; ruleGroup: string; heuristic: string }> {
    return ALL_UX_RULES.map(r => ({
      id: r.id,
      ruleGroup: r.ruleGroup,
      heuristic: r.heuristic
    }));
  }
}
