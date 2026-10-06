import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { GitDiffInspector, type ParsedGitDiff } from '../utils/git-diff-inspector.js';
import { DomainClassifier, type Finding } from './domain-classifier.js';

export type DiffRegressionCategory =
  | 'scope_creep'
  | 'swallowed_error'
  | 'defensive_nulling'
  | 'syntax_error'
  | 'test_failure';

export interface DiffOnDiffAuditorOptions {
  cwd?: string;
  diffRange?: string; // e.g. 'HEAD~1..HEAD'
  rawDiff?: string;
  expectedFiles?: string[];
  targetFindings?: Finding[];
  allowRelatedTests?: boolean;
  testRunner?: () => Promise<{ success: boolean; output: string; failures?: string[] }> | { success: boolean; output: string; failures?: string[] };
  testOutput?: string;
  syntaxCheck?: boolean;
  fileReader?: (filePath: string) => string | null;
  execFn?: (cmd: string, options?: any) => string | Buffer;
}

export interface DiffAuditResult {
  passed: boolean;
  secondaryFindings: Finding[];
  auditedFiles: string[];
  summary?: string;
}

export class DiffOnDiffAuditor {
  private defaultOptions: DiffOnDiffAuditorOptions;

  constructor(defaultOptions: DiffOnDiffAuditorOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  public async audit(options: DiffOnDiffAuditorOptions = {}): Promise<DiffAuditResult> {
    const opts: DiffOnDiffAuditorOptions = {
      ...this.defaultOptions,
      ...options,
    };

    // Obtain git diff inspector
    let inspector: GitDiffInspector;
    if (opts.rawDiff !== undefined) {
      inspector = new GitDiffInspector(opts.rawDiff);
    } else {
      const range = opts.diffRange || 'HEAD~1..HEAD';
      inspector = GitDiffInspector.fromCommitRange(range, {
        cwd: opts.cwd,
        execFn: opts.execFn,
      });
    }

    const auditedFiles = inspector.getModifiedFiles();
    const secondaryFindings: Finding[] = [];

    // If there are no modified files, passes cleanly
    if (auditedFiles.length === 0) {
      return {
        passed: true,
        secondaryFindings: [],
        auditedFiles: [],
        summary: 'No changes detected in diff.',
      };
    }

    // 1. Check Scope Creep (unrequested file modifications outside finding's domain/scope)
    const scopeCreepFindings = this.checkScope(inspector, opts);
    secondaryFindings.push(...scopeCreepFindings);

    // 2. Check Swallowed Errors (newly added empty catch blocks or catch blocks that only log)
    const swallowedErrors = this.detectSwallowedErrors(inspector);
    secondaryFindings.push(...swallowedErrors);

    // 3. Check Defensive Nulling (?? 0, || [], || '', etc.)
    const defensiveNulling = this.detectDefensiveNulling(inspector);
    secondaryFindings.push(...defensiveNulling);

    // 4. Check Secondary Syntax Failures
    if (opts.syntaxCheck !== false) {
      const syntaxErrors = this.checkSyntax(inspector, opts);
      secondaryFindings.push(...syntaxErrors);
    }

    // 5. Check Secondary Test Failures
    if (opts.testRunner) {
      try {
        const testRes = await opts.testRunner();
        if (!testRes.success) {
          secondaryFindings.push({
            id: `diff-reg-test-${Date.now()}`,
            file: testRes.failures?.[0] || 'test_suite',
            ruleId: 'DIFF_REGRESSION',
            type: 'DIFF_REGRESSION',
            category: 'test_failure',
            severity: 'CRITICAL',
            description: `[DIFF_REGRESSION] Secondary test failure detected during diff scrutiny: ${testRes.output || 'Test execution failed'}`,
            output: testRes.output,
            status: 'OPEN',
          });
        }
      } catch (e: any) {
        secondaryFindings.push({
          id: `diff-reg-test-err-${Date.now()}`,
          file: 'test_suite',
          ruleId: 'DIFF_REGRESSION',
          type: 'DIFF_REGRESSION',
          category: 'test_failure',
          severity: 'CRITICAL',
          description: `[DIFF_REGRESSION] Secondary test runner execution failed: ${e.message}`,
          status: 'OPEN',
        });
      }
    } else if (opts.testOutput) {
      if (/FAIL\s+|Tests:\s+.*failed|AssertionError/i.test(opts.testOutput)) {
        secondaryFindings.push({
          id: `diff-reg-test-out-${Date.now()}`,
          file: 'test_suite',
          ruleId: 'DIFF_REGRESSION',
          type: 'DIFF_REGRESSION',
          category: 'test_failure',
          severity: 'CRITICAL',
          description: `[DIFF_REGRESSION] Secondary test failure detected in output: ${opts.testOutput.slice(0, 300)}`,
          status: 'OPEN',
        });
      }
    }

    const passed = secondaryFindings.length === 0;
    const summary = passed
      ? `Diff-on-diff scrutiny passed across ${auditedFiles.length} file(s).`
      : `Diff-on-diff scrutiny failed: ${secondaryFindings.length} secondary regression(s) detected.`;

    return {
      passed,
      secondaryFindings,
      auditedFiles,
      summary,
    };
  }

  public static async audit(options: DiffOnDiffAuditorOptions = {}): Promise<DiffAuditResult> {
    const auditor = new DiffOnDiffAuditor(options);
    return auditor.audit(options);
  }

  public formatLog(result: DiffAuditResult, cycle?: number): string {
    const cycleText = cycle !== undefined ? ` (Cycle ${cycle})` : '';
    let log = `### Diff-on-Diff Scrutiny Report${cycleText}\n`;
    log += `- Status: ${result.passed ? 'PASSED' : 'FAILED'}\n`;
    log += `- Audited Files: ${result.auditedFiles.join(', ') || 'None'}\n`;
    log += `- Secondary Regressions Detected: ${result.secondaryFindings.length}\n`;

    if (result.secondaryFindings.length > 0) {
      log += `\n#### Regressions:\n`;
      for (const f of result.secondaryFindings) {
        const lineInfo = f.line_range ? `:${f.line_range[0]}` : '';
        log += `- [${f.ruleId || 'DIFF_REGRESSION'}] (${f.category || 'unknown'}) ${f.file}${lineInfo}: ${f.description}\n`;
      }
    }

    return log;
  }

  private checkScope(inspector: GitDiffInspector, opts: DiffOnDiffAuditorOptions): Finding[] {
    const findings: Finding[] = [];
    const classifier = new DomainClassifier();

    const allowedFiles = new Set<string>();
    const allowedDomains = new Set<string>();

    if (opts.expectedFiles) {
      for (const f of opts.expectedFiles) {
        if (f) allowedFiles.add(GitDiffInspector.normalizePath(f));
      }
    }

    if (opts.targetFindings && opts.targetFindings.length > 0) {
      for (const f of opts.targetFindings) {
        const filePath = f.file || f.filePath;
        if (filePath) {
          allowedFiles.add(GitDiffInspector.normalizePath(filePath));
        }
        const dom = f.domain || (filePath ? classifier.classify(filePath) : '');
        if (dom && dom !== 'general-remediator') {
          allowedDomains.add(dom);
        }
      }
    }

    if (allowedFiles.size === 0 && allowedDomains.size === 0) {
      return [];
    }

    if (opts.allowRelatedTests !== false) {
      for (const src of Array.from(allowedFiles)) {
        if (!src.includes('.test.') && !src.includes('.spec.')) {
          const parsed = path.parse(src);
          allowedFiles.add(`${parsed.dir}/${parsed.name}.test${parsed.ext}`);
          allowedFiles.add(`${parsed.dir}/${parsed.name}.spec${parsed.ext}`);
          allowedFiles.add(`tests/${parsed.name}.test${parsed.ext}`);
          allowedFiles.add(`tests/${parsed.name}.spec${parsed.ext}`);
        }
      }
    }

    const modifiedFiles = inspector.getModifiedFiles();
    const normalizedExpected = Array.from(allowedFiles).map((p) => GitDiffInspector.normalizePath(p));

    for (const file of modifiedFiles) {
      const normFile = GitDiffInspector.normalizePath(file);
      const fileDomain = classifier.classify(normFile);

      const fileMatches = normalizedExpected.some((expected) => {
        return normFile === expected || normFile.endsWith(`/${expected}`) || expected.endsWith(`/${normFile}`);
      });

      const domainMatches = allowedDomains.size > 0 && allowedDomains.has(fileDomain);

      const inScope = (opts.targetFindings && opts.targetFindings.length > 0)
        ? (fileMatches || domainMatches)
        : fileMatches;

      if (!inScope) {
        const expectedDesc = opts.expectedFiles
          ? `[${opts.expectedFiles.join(', ')}]`
          : `domain(s) [${Array.from(allowedDomains).join(', ')}]`;
        findings.push({
          id: `diff-reg-scope-${file}-${Date.now()}`,
          file,
          ruleId: 'DIFF_REGRESSION',
          type: 'DIFF_REGRESSION',
          category: 'scope_creep',
          severity: 'CRITICAL',
          description: `[DIFF_REGRESSION] Unrequested file modification outside finding scope: "${file}". Expected scope: ${expectedDesc}`,
          status: 'OPEN',
        });
      }
    }

    return findings;
  }


  private detectSwallowedErrors(inspector: GitDiffInspector): Finding[] {
    const findings: Finding[] = [];
    const parsed = inspector.getParsed();

    for (const file of parsed) {
      const addedLines = file.addedLines;
      if (addedLines.length === 0) continue;

      let idx = 0;
      while (idx < addedLines.length) {
        const lineEntry = addedLines[idx];
        const content = lineEntry.content;

        // Check for catch statement starting on this line
        const catchMatch = content.match(/catch\s*(?:\([^)]*\))?\s*\{/);
        if (catchMatch) {
          const catchStartLine = lineEntry.line;
          const openBracePos = catchMatch.index! + catchMatch[0].length - 1;

          // Collect body text between { and matching }
          let depth = 1;
          let bodyText = content.slice(openBracePos + 1);
          let endLine = catchStartLine;
          let foundClosing = false;

          // Check if closing brace is on the same line
          for (let c = 0; c < bodyText.length; c++) {
            if (bodyText[c] === '{') depth++;
            else if (bodyText[c] === '}') {
              depth--;
              if (depth === 0) {
                bodyText = bodyText.slice(0, c);
                foundClosing = true;
                break;
              }
            }
          }

          // Scan subsequent lines if not closed on same line
          let scanIdx = idx + 1;
          while (!foundClosing && scanIdx < addedLines.length) {
            const nextLine = addedLines[scanIdx];
            endLine = nextLine.line;
            const lineStr = nextLine.content;

            for (let c = 0; c < lineStr.length; c++) {
              if (lineStr[c] === '{') depth++;
              else if (lineStr[c] === '}') {
                depth--;
                if (depth === 0) {
                  bodyText += '\n' + lineStr.slice(0, c);
                  foundClosing = true;
                  break;
                }
              }
            }

            if (!foundClosing) {
              bodyText += '\n' + lineStr;
            }
            scanIdx++;
          }

          if (this.isSwallowedCatchBody(bodyText)) {
            findings.push({
              id: `diff-reg-swallowed-${file.path}-${catchStartLine}`,
              file: file.path,
              ruleId: 'DIFF_REGRESSION',
              type: 'DIFF_REGRESSION',
              category: 'swallowed_error',
              severity: 'CRITICAL',
              line_range: [catchStartLine, endLine],
              description: `[DIFF_REGRESSION] Swallowed error detected in catch block at ${file.path}:${catchStartLine}. Catch blocks must not silently discard errors or only log them without propagation.`,
              status: 'OPEN',
            });
          }
        }

        idx++;
      }
    }

    return findings;
  }

  private isSwallowedCatchBody(body: string): boolean {
    // Strip comments
    const stripped = body
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    // 1. Completely empty catch block
    if (stripped === '' || stripped === ';') {
      return true;
    }

    // 2. Catch block that only logs and does nothing else
    const statements = stripped
      .split(/;|\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (statements.length === 0) return true;

    // Check if it contains throw, return, reject, or process.exit
    const hasControlFlow = /(?:throw\b|return\b|reject\b|process\.exit|panic\b)/.test(stripped);
    if (hasControlFlow) {
      return false;
    }

    const isLogStatement = (stmt: string): boolean => {
      return /^(?:console|logger|this\.logger|log)\.(?:log|warn|error|info|debug|trace)\s*\(.*?\)$/s.test(
        stmt
      );
    };

    const allLogging = statements.every(isLogStatement);
    return allLogging;
  }

  private detectDefensiveNulling(inspector: GitDiffInspector): Finding[] {
    const findings: Finding[] = [];
    const parsed = inspector.getParsed();

    // Regex matching defensive nulling patterns: ?? 0, || [], || '', ?? [], ?? '', ?? null, etc.
    const nullingPattern = /(?:\?\?|\|\|)\s*(?:0\b|\[\s*\]|['"]['"]|\{\s*\}|null\b|false\b)/g;

    for (const file of parsed) {
      for (const lineEntry of file.addedLines) {
        // Strip single-line comments
        const cleanLine = lineEntry.content.replace(/\/\/.*$/, '');
        let match: RegExpExecArray | null;

        while ((match = nullingPattern.exec(cleanLine)) !== null) {
          const matchedText = match[0].trim();
          findings.push({
            id: `diff-reg-nulling-${file.path}-${lineEntry.line}`,
            file: file.path,
            ruleId: 'DIFF_REGRESSION',
            type: 'DIFF_REGRESSION',
            category: 'defensive_nulling',
            severity: 'CRITICAL',
            line_range: [lineEntry.line, lineEntry.line],
            description: `[DIFF_REGRESSION] Introduced defensive nulling pattern "${matchedText}" detected in "${file.path}:${lineEntry.line}". Invariant-first dogma forbids local defensive fallback patching at point of consumption.`,
            status: 'OPEN',
          });
        }
      }
    }

    return findings;
  }

  private checkSyntax(inspector: GitDiffInspector, opts: DiffOnDiffAuditorOptions): Finding[] {
    const findings: Finding[] = [];
    const parsed = inspector.getParsed();

    for (const file of parsed) {
      if (file.status === 'deleted') continue;

      let fileContent: string | null = null;
      if (opts.fileReader) {
        fileContent = opts.fileReader(file.path);
      } else {
        const fullPath = opts.cwd ? path.resolve(opts.cwd, file.path) : path.resolve(file.path);
        if (fs.existsSync(fullPath)) {
          try {
            fileContent = fs.readFileSync(fullPath, 'utf8');
          } catch {}
        }
      }

      if (!fileContent) continue;

      // JSON syntax validation
      if (file.path.endsWith('.json')) {
        try {
          JSON.parse(fileContent);
        } catch (e: any) {
          findings.push({
            id: `diff-reg-syntax-${file.path}`,
            file: file.path,
            ruleId: 'DIFF_REGRESSION',
            type: 'DIFF_REGRESSION',
            category: 'syntax_error',
            severity: 'CRITICAL',
            description: `[DIFF_REGRESSION] Secondary syntax error in "${file.path}": ${e.message}`,
            status: 'OPEN',
          });
        }
      }

      // TypeScript / JavaScript syntax validation
      if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file.path)) {
        try {
          const sourceFile = ts.createSourceFile(
            file.path,
            fileContent,
            ts.ScriptTarget.Latest,
            true
          );
          const diagnostics = (sourceFile as any).parseDiagnostics;
          if (diagnostics && diagnostics.length > 0) {
            const first = diagnostics[0];
            const msg =
              typeof first.messageText === 'string'
                ? first.messageText
                : first.messageText?.messageText || 'Syntax error';
            findings.push({
              id: `diff-reg-syntax-${file.path}`,
              file: file.path,
              ruleId: 'DIFF_REGRESSION',
              type: 'DIFF_REGRESSION',
              category: 'syntax_error',
              severity: 'CRITICAL',
              description: `[DIFF_REGRESSION] Secondary syntax error in "${file.path}": ${msg}`,
              status: 'OPEN',
            });
          }
        } catch (e: any) {
          findings.push({
            id: `diff-reg-syntax-${file.path}`,
            file: file.path,
            ruleId: 'DIFF_REGRESSION',
            type: 'DIFF_REGRESSION',
            category: 'syntax_error',
            severity: 'CRITICAL',
            description: `[DIFF_REGRESSION] Secondary syntax parser error in "${file.path}": ${e.message}`,
            status: 'OPEN',
          });
        }
      }
    }

    return findings;
  }
}
