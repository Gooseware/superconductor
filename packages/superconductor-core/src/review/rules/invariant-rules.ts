import { Project, SyntaxKind, Node } from 'ts-morph';

export interface RuleEvaluationFile {
  path: string;
  content: string;
  diff?: string;
}

export interface RuleEvaluationContext {
  files: RuleEvaluationFile[];
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'high' | 'medium';
  file: string;
  line?: number;
  column?: number;
  message: string;
  snippet?: string;
}

export interface InvariantRule {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium';
  evaluate(input: RuleEvaluationContext): RuleViolation[];
}

export interface InvariantEvaluationResult {
  passed: boolean;
  violations: RuleViolation[];
  summary: {
    totalFiles: number;
    totalViolations: number;
    criticalViolations: number;
    highViolations: number;
    mediumViolations: number;
  };
}

export const TEST_FIXTURE_TAMPER_MESSAGE =
  'Test fixture tampering detected: auto-generating or mutating fixture files within test suite is prohibited. Missing fixtures must fail immediately.';

export const CLOUDFLARE_LIFECYCLE_MESSAGE =
  'Cloudflare isolate lifecycle violation: async operations must invoke ctx.waitUntil(promise); dropping unawaited promises on bare env is prohibited.';

export const SILENT_DEGRADATION_MESSAGE =
  'Silent degradation defect: empty catch block swallows errors without logging or re-throwing.';

export const DEFENSIVE_NULLING_MESSAGE =
  'Defensive nulling defect: consumer-site fallback operator masks uninitialized state. Fix state at inception point.';

/**
 * Creates an in-memory ts-morph Project instance for fast AST analysis.
 */
function createInMemoryProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      jsx: 1, // Preserve
    },
    skipAddingFilesFromTsConfig: true,
  });
}

function isTestFilePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    /(?:^|\/)(?:test|tests|__tests__|fixtures?)\//i.test(normalized) ||
    /\.(?:test|spec)\.[a-zA-Z0-9]+$/i.test(normalized)
  );
}

/**
 * Rule 1: TestFixtureTamperRule
 * Triggers when files under test directories contain writeFileSync, writeFile,
 * or dynamic fixture generation during test execution.
 */
function evaluateTestFixtureTamper(input: RuleEvaluationContext): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const file of input.files) {
    if (!isTestFilePath(file.path)) {
      continue;
    }

    let analyzedWithAst = false;

    try {
      const project = createInMemoryProject();
      const ext = file.path.endsWith('.tsx') ? 'test.tsx' : 'test.ts';
      const sourceFile = project.createSourceFile(ext, file.content, { overwrite: true });

      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of callExpressions) {
        const expr = call.getExpression();
        const callText = expr.getText();

        const isWriteCall =
          /(\b|\.)(writeFileSync|writeFile)\b/.test(callText) ||
          (Node.isPropertyAccessExpression(expr) && ['writeFileSync', 'writeFile'].includes(expr.getName())) ||
          (Node.isIdentifier(expr) && ['writeFileSync', 'writeFile'].includes(expr.getText()));

        if (isWriteCall) {
          violations.push({
            ruleId: TestFixtureTamperRule.id,
            ruleName: TestFixtureTamperRule.name,
            severity: TestFixtureTamperRule.severity,
            file: file.path,
            line: call.getStartLineNumber(),
            message: TEST_FIXTURE_TAMPER_MESSAGE,
            snippet: call.getText().split('\n')[0].slice(0, 120),
          });
        }
      }

      analyzedWithAst = true;
    } catch {
      // Fall through to regex scanning if AST parsing fails
    }

    if (!analyzedWithAst) {
      const lines = file.content.split('\n');
      let inBlockComment = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith('/*')) inBlockComment = true;
        if (inBlockComment) {
          if (trimmed.includes('*/')) inBlockComment = false;
          continue;
        }
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        if (/\b(?:fs\.)?(?:promises\.)?(?:writeFileSync|writeFile)\s*\(/.test(line)) {
          violations.push({
            ruleId: TestFixtureTamperRule.id,
            ruleName: TestFixtureTamperRule.name,
            severity: TestFixtureTamperRule.severity,
            file: file.path,
            line: i + 1,
            message: TEST_FIXTURE_TAMPER_MESSAGE,
            snippet: line.trim().slice(0, 120),
          });
        }
      }
    }
  }

  return violations;
}

export class TestFixtureTamperRule implements InvariantRule {
  readonly id = 'INVARIANT-FIXTURE-TAMPER';
  readonly name = 'TestFixtureTamperRule';
  readonly severity = 'critical' as const;

  static readonly id = 'INVARIANT-FIXTURE-TAMPER';
  static readonly severity = 'critical' as const;

  evaluate(input: RuleEvaluationContext): RuleViolation[] {
    return evaluateTestFixtureTamper(input);
  }

  static evaluate(input: RuleEvaluationContext): RuleViolation[] {
    return evaluateTestFixtureTamper(input);
  }
}

/**
 * Rule 2: CloudflareLifecycleRule
 * Detects worker handlers or async service calls taking bare env without ctx
 * or dropping promises without ctx.waitUntil in Cloudflare Worker / isolate contexts.
 */
function evaluateCloudflareLifecycle(input: RuleEvaluationContext): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const file of input.files) {
    let analyzedWithAst = false;

    try {
      const project = createInMemoryProject();
      const ext = file.path.endsWith('.tsx') ? 'worker.tsx' : 'worker.ts';
      const sourceFile = project.createSourceFile(ext, file.content, { overwrite: true });

      // Check 1: Worker handlers (fetch, scheduled, queue, etc.) taking bare env without ctx
      const methodDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
      const functionDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
      const propertyAssignments = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment);

      const allHandlers: Array<{
        name: string;
        params: Node[];
        startLine: number;
        node: Node;
      }> = [];
      const flaggedFunctions = new Set<Node>();

      for (const m of methodDeclarations) {
        allHandlers.push({
          name: m.getName(),
          params: m.getParameters(),
          startLine: m.getStartLineNumber(),
          node: m,
        });
      }

      for (const f of functionDeclarations) {
        allHandlers.push({
          name: f.getName() || '',
          params: f.getParameters(),
          startLine: f.getStartLineNumber(),
          node: f,
        });
      }

      for (const p of propertyAssignments) {
        const init = p.getInitializer();
        if (init && (Node.isFunctionExpression(init) || Node.isArrowFunction(init))) {
          allHandlers.push({
            name: p.getName(),
            params: init.getParameters(),
            startLine: p.getStartLineNumber(),
            node: init,
          });
        }
      }

      for (const handler of allHandlers) {
        const paramNames = handler.params.map(p => p.getText().toLowerCase());
        const hasEnv = paramNames.some(p => p.includes('env'));
        const hasCtx = paramNames.some(p => p.includes('ctx') || p.includes('context'));

        const isWorkerMethod = ['fetch', 'scheduled', 'queue', 'tail', 'trace', 'email'].includes(
          handler.name.toLowerCase()
        );

        if (isWorkerMethod && hasEnv && !hasCtx) {
          violations.push({
            ruleId: CloudflareLifecycleRule.id,
            ruleName: CloudflareLifecycleRule.name,
            severity: CloudflareLifecycleRule.severity,
            file: file.path,
            line: handler.startLine,
            message: CLOUDFLARE_LIFECYCLE_MESSAGE,
            snippet: handler.node.getText().split('\n')[0].slice(0, 120),
          });
        }

        // Check async functions with bare env without ctx that perform calls
        if (!isWorkerMethod && hasEnv && !hasCtx) {
          const callExprs = handler.node.getDescendantsOfKind(SyntaxKind.CallExpression);
          if (callExprs.length > 0) {
            violations.push({
              ruleId: CloudflareLifecycleRule.id,
              ruleName: CloudflareLifecycleRule.name,
              severity: CloudflareLifecycleRule.severity,
              file: file.path,
              line: handler.startLine,
              message: CLOUDFLARE_LIFECYCLE_MESSAGE,
              snippet: handler.node.getText().split('\n')[0].slice(0, 120),
            });
            flaggedFunctions.add(handler.node);
          }
        }
      }

      // Check 2: Dropping unawaited promises inside handlers where ctx is present
      const expressionStatements = sourceFile.getDescendantsOfKind(SyntaxKind.ExpressionStatement);
      for (const stmt of expressionStatements) {
        const expr = stmt.getExpression();
        if (Node.isCallExpression(expr)) {
          const callText = expr.getText();
          // Skip calls wrapped in ctx.waitUntil or context.waitUntil
          if (/^(?:ctx|context)\.waitUntil\s*\(/.test(callText)) {
            continue;
          }

          // Check if parent contains ctx or env
          const enclosingFn = stmt.getFirstAncestor(
            node => Node.isMethodDeclaration(node) || Node.isFunctionDeclaration(node) || Node.isArrowFunction(node)
          );

          if (enclosingFn && !flaggedFunctions.has(enclosingFn)) {
            const isBackgroundCall =
              callText.includes('env') ||
              /^(?:track|log|send|dispatch|record|sync|emit|post|fetch|push)/i.test(callText);

            const enclosingText = enclosingFn.getText();
            if (enclosingText.includes('env') && isBackgroundCall) {
              violations.push({
                ruleId: CloudflareLifecycleRule.id,
                ruleName: CloudflareLifecycleRule.name,
                severity: CloudflareLifecycleRule.severity,
                file: file.path,
                line: stmt.getStartLineNumber(),
                message: CLOUDFLARE_LIFECYCLE_MESSAGE,
                snippet: stmt.getText().split('\n')[0].slice(0, 120),
              });
            }
          }
        }
      }

      analyzedWithAst = true;
    } catch {
      // Fall through to regex scanning
    }

    if (!analyzedWithAst) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/(?:fetch|scheduled|queue)\s*\([^,)]+,\s*env(?:\s*:\s*[^,)]+)?\s*\)/i.test(line) && !line.includes('ctx')) {
          violations.push({
            ruleId: CloudflareLifecycleRule.id,
            ruleName: CloudflareLifecycleRule.name,
            severity: CloudflareLifecycleRule.severity,
            file: file.path,
            line: i + 1,
            message: CLOUDFLARE_LIFECYCLE_MESSAGE,
            snippet: line.trim().slice(0, 120),
          });
        }
      }
    }
  }

  // Deduplicate violations by file and line
  return deduplicateViolations(violations);
}

export class CloudflareLifecycleRule implements InvariantRule {
  readonly id = 'INVARIANT-CLOUDFLARE-LIFECYCLE';
  readonly name = 'CloudflareLifecycleRule';
  readonly severity = 'critical' as const;

  static readonly id = 'INVARIANT-CLOUDFLARE-LIFECYCLE';
  static readonly severity = 'critical' as const;

  evaluate(input: RuleEvaluationContext): RuleViolation[] {
    return evaluateCloudflareLifecycle(input);
  }

  static evaluate(input: RuleEvaluationContext): RuleViolation[] {
    return evaluateCloudflareLifecycle(input);
  }
}

/**
 * Rule 3: SilentDegradationRule
 * Detects empty catch blocks (catch {}, catch (e) {}, catch (_) {}) that swallow exceptions
 * without re-throwing or diagnostic logging.
 */
function evaluateSilentDegradation(input: RuleEvaluationContext): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const file of input.files) {
    let analyzedWithAst = false;

    try {
      const project = createInMemoryProject();
      const ext = file.path.endsWith('.tsx') ? 'file.tsx' : 'file.ts';
      const sourceFile = project.createSourceFile(ext, file.content, { overwrite: true });

      const catchClauses = sourceFile.getDescendantsOfKind(SyntaxKind.CatchClause);
      for (const catchClause of catchClauses) {
        const block = catchClause.getBlock();
        const statements = block.getStatements();

        if (statements.length === 0) {
          violations.push({
            ruleId: SilentDegradationRule.id,
            ruleName: SilentDegradationRule.name,
            severity: SilentDegradationRule.severity,
            file: file.path,
            line: catchClause.getStartLineNumber(),
            message: SILENT_DEGRADATION_MESSAGE,
            snippet: catchClause.getText().split('\n')[0].slice(0, 120),
          });
          continue;
        }

        const blockText = block.getText();
        const hasThrow = block.getDescendantsOfKind(SyntaxKind.ThrowStatement).length > 0;
        const hasLogging = /\b(?:console\.(?:error|warn|log|info|debug)|logger\.|log\.|reporter\.)/.test(blockText);

        if (!hasThrow && !hasLogging) {
          violations.push({
            ruleId: SilentDegradationRule.id,
            ruleName: SilentDegradationRule.name,
            severity: SilentDegradationRule.severity,
            file: file.path,
            line: catchClause.getStartLineNumber(),
            message: SILENT_DEGRADATION_MESSAGE,
            snippet: catchClause.getText().split('\n')[0].slice(0, 120),
          });
        }
      }

      analyzedWithAst = true;
    } catch {
      // Fall through to regex scanning
    }

    if (!analyzedWithAst) {
      const catchRegex = /catch\s*(?:\([^)]*\))?\s*\{([^}]*)\}/g;
      let match: RegExpExecArray | null;
      while ((match = catchRegex.exec(file.content)) !== null) {
        const body = match[1];
        const cleaned = body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const hasThrow = /\bthrow\b/.test(cleaned);
        const hasLogging = /\b(?:console\.(?:error|warn|log|info|debug)|logger\.|log\.|reporter\.)/.test(cleaned);

        if (!hasThrow && !hasLogging) {
          const line = file.content.slice(0, match.index).split('\n').length;
          violations.push({
            ruleId: SilentDegradationRule.id,
            ruleName: SilentDegradationRule.name,
            severity: SilentDegradationRule.severity,
            file: file.path,
            line,
            message: SILENT_DEGRADATION_MESSAGE,
            snippet: match[0].split('\n')[0].slice(0, 120),
          });
        }
      }
    }
  }

  return deduplicateViolations(violations);
}

export class SilentDegradationRule implements InvariantRule {
  readonly id = 'INVARIANT-SILENT-DEGRADATION';
  readonly name = 'SilentDegradationRule';
  readonly severity = 'high' as const;

  static readonly id = 'INVARIANT-SILENT-DEGRADATION';
  static readonly severity = 'high' as const;

  evaluate(input: RuleEvaluationContext): RuleViolation[] {
    return evaluateSilentDegradation(input);
  }

  static evaluate(input: RuleEvaluationContext): RuleViolation[] {
    return evaluateSilentDegradation(input);
  }
}

/**
 * Rule 4: DefensiveNullingRule
 * Evaluates code additions/diffs for consumer-site fallback operators
 * (?? 0, ?? "", ?? [], || [], || {}, ?? {}, ?? false) that mask missing or uninitialized state.
 */
const DEFENSIVE_FALLBACK_PATTERN = /(?:\?\?|\|\|)\s*(?:0\b|false\b|""|''|``|\[\]|\{\})/i;

function evaluateDefensiveNulling(input: RuleEvaluationContext): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const file of input.files) {
    if (file.diff && file.diff.trim().length > 0) {
      // Evaluate diff additions
      const diffLines = file.diff.split('\n');
      let currentLineInFile = 1;

      for (let i = 0; i < diffLines.length; i++) {
        const rawLine = diffLines[i];

        // Track diff hunk line numbers if available
        const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
        if (hunkMatch) {
          currentLineInFile = parseInt(hunkMatch[1], 10);
          continue;
        }

        // Only evaluate added lines (+)
        if (!rawLine.startsWith('+') || rawLine.startsWith('+++')) {
          if (!rawLine.startsWith('-')) {
            currentLineInFile++;
          }
          continue;
        }

        const line = rawLine.slice(1);
        const codeWithoutComment = line.replace(/\/\/.*$/, '').trim();

        if (
          codeWithoutComment.length > 0 &&
          !codeWithoutComment.startsWith('*') &&
          !codeWithoutComment.startsWith('/*') &&
          DEFENSIVE_FALLBACK_PATTERN.test(codeWithoutComment)
        ) {
          violations.push({
            ruleId: DefensiveNullingRule.id,
            ruleName: DefensiveNullingRule.name,
            severity: DefensiveNullingRule.severity,
            file: file.path,
            line: currentLineInFile,
            message: DEFENSIVE_NULLING_MESSAGE,
            snippet: line.trim().slice(0, 120),
          });
        }

        currentLineInFile++;
      }
    } else if (file.content) {
      // Evaluate whole content line by line
      const lines = file.content.split('\n');
      let inBlockComment = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith('/*')) inBlockComment = true;
        if (inBlockComment) {
          if (trimmed.includes('*/')) inBlockComment = false;
          continue;
        }
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        const codeWithoutComment = line.replace(/\/\/.*$/, '').trim();
        if (codeWithoutComment.length > 0 && DEFENSIVE_FALLBACK_PATTERN.test(codeWithoutComment)) {
          violations.push({
            ruleId: DefensiveNullingRule.id,
            ruleName: DefensiveNullingRule.name,
            severity: DefensiveNullingRule.severity,
            file: file.path,
            line: i + 1,
            message: DEFENSIVE_NULLING_MESSAGE,
            snippet: line.trim().slice(0, 120),
          });
        }
      }
    }
  }

  return violations;
}

export class DefensiveNullingRule implements InvariantRule {
  readonly id = 'INVARIANT-DEFENSIVE-NULLING';
  readonly name = 'DefensiveNullingRule';
  readonly severity = 'high' as const;

  static readonly id = 'INVARIANT-DEFENSIVE-NULLING';
  static readonly severity = 'high' as const;

  evaluate(input: RuleEvaluationContext): RuleViolation[] {
    return evaluateDefensiveNulling(input);
  }

  static evaluate(input: RuleEvaluationContext): RuleViolation[] {
    return evaluateDefensiveNulling(input);
  }
}

function deduplicateViolations(violations: RuleViolation[]): RuleViolation[] {
  const seen = new Set<string>();
  const deduped: RuleViolation[] = [];

  for (const v of violations) {
    const key = `${v.ruleId}:${v.file}:${v.line || 0}:${v.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(v);
    }
  }

  return deduped;
}

/**
 * Standard registry containing all built-in Invariant Rules.
 */
export const ALL_INVARIANT_RULES: InvariantRule[] = [
  new TestFixtureTamperRule(),
  new CloudflareLifecycleRule(),
  new SilentDegradationRule(),
  new DefensiveNullingRule(),
];

/**
 * Resolves an InvariantRule instance whether passed as an instantiated object or class constructor.
 */
function resolveRule(ruleOrClass: InvariantRule | (new () => InvariantRule)): InvariantRule {
  if (typeof ruleOrClass === 'function') {
    try {
      return new (ruleOrClass as new () => InvariantRule)();
    } catch {
      return ruleOrClass as unknown as InvariantRule;
    }
  }
  return ruleOrClass;
}

/**
 * Evaluates the set of invariant rules against files and their diffs.
 */
export function evaluateInvariantRules(
  context: { files: Array<{ path: string; content: string; diff?: string }> },
  rules: Array<InvariantRule | (new () => InvariantRule)> = ALL_INVARIANT_RULES
): InvariantEvaluationResult {
  const activeRules = rules.map(resolveRule);
  const allViolations: RuleViolation[] = [];

  for (const rule of activeRules) {
    const violations = rule.evaluate(context);
    allViolations.push(...violations);
  }

  const criticalViolations = allViolations.filter(v => v.severity === 'critical').length;
  const highViolations = allViolations.filter(v => v.severity === 'high').length;
  const mediumViolations = allViolations.filter(v => v.severity === 'medium').length;

  return {
    passed: allViolations.length === 0,
    violations: allViolations,
    summary: {
      totalFiles: context.files.length,
      totalViolations: allViolations.length,
      criticalViolations,
      highViolations,
      mediumViolations,
    },
  };
}
