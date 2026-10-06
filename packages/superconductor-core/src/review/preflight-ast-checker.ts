import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import { Project, SyntaxKind, SourceFile, CallExpression } from 'ts-morph';
import { GitDiffInspector, FileDiff, DiffHunk } from '../utils/git-diff-inspector.js';
import { isCodeFile } from './quorum-composition-resolver.js';

export interface PreflightViolation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

export interface PreflightCheckResult {
  valid: boolean;
  violations: PreflightViolation[];
}

export const RULE_TEST_FIXTURE_AUTOGEN = 'forbidden-test-fixture-generation';
export const RULE_CF_WORKER_WAITUNTIL = 'cf-worker-missing-waituntil';
export const RULE_RELAXED_TIMING = 'no-relaxed-timing-assertions';
export const RULE_SWALLOWED_EXCEPTIONS = 'no-swallowed-exceptions';


export function isTestOrFixtureFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    /\.(test|spec)\.[jt]sx?$/i.test(normalized) ||
    /(?:^|\/)(?:__tests__|tests|test)\/.*fixture/i.test(normalized) ||
    /(?:fixture-helper|fixtures|test-helper|test-utils)/i.test(normalized) ||
    /(?:^|\/)(?:fixtures?|test-helpers?)\//i.test(normalized)
  );
}

interface TimingThreshold {
  type: 'toBeLessThan' | 'timeout';
  value: number;
  line: number;
}

function extractTimingThresholds(text: string, baseLine = 1): TimingThreshold[] {
  const thresholds: TimingThreshold[] = [];
  const lines = text.split(/\r?\n/);

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNum = baseLine + idx;

    // toBeLessThan(123) or toBeLessThanOrEqual(123)
    const lessThanRegex = /toBeLessThan(?:OrEqual)?\s*\(\s*(\d+(?:\.\d+)?)\s*\)/g;
    let match;
    while ((match = lessThanRegex.exec(line)) !== null) {
      thresholds.push({
        type: 'toBeLessThan',
        value: parseFloat(match[1]),
        line: lineNum,
      });
    }

    // timeout: 123
    const timeoutRegex = /timeout\s*:\s*(\d+)/g;
    while ((match = timeoutRegex.exec(line)) !== null) {
      thresholds.push({
        type: 'timeout',
        value: parseInt(match[1], 10),
        line: lineNum,
      });
    }

    // it('...', fn, 1000) or test('...', fn, 1000)
    const testTimeoutRegex = /(?:it|test)\s*\([^,]+,[^,]+,\s*(\d+)\s*\)/g;
    while ((match = testTimeoutRegex.exec(line)) !== null) {
      thresholds.push({
        type: 'timeout',
        value: parseInt(match[1], 10),
        line: lineNum,
      });
    }
  }

  return thresholds;
}

function findGitRoot(startDir: string): string {
  try {
    return child_process
      .execSync('git rev-parse --show-toplevel', {
        cwd: startDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      .trim();
  } catch {
    return startDir;
  }
}

export class PreflightASTChecker {
  private project: Project;

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        jsx: 1, // JsxEmit.Preserve
      },
    });
  }

  /**
   * Scans a TypeScript/JavaScript AST SourceFile for forbidden patterns.
   */
  private scanSourceFile(sourceFile: SourceFile, filePath: string): PreflightViolation[] {
    const violations: PreflightViolation[] = [];

    // 1. Test Snapshot / Fixture Auto-generation
    if (isTestOrFixtureFile(filePath)) {
      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of callExpressions) {
        const expr = call.getExpression().getText();
        if (
          expr === 'writeFileSync' ||
          expr.endsWith('.writeFileSync') ||
          expr === 'writeFile' ||
          expr.endsWith('.writeFile')
        ) {
          violations.push({
            file: filePath,
            line: call.getStartLineNumber(),
            rule: RULE_TEST_FIXTURE_AUTOGEN,
            message:
              'Calls to writeFileSync or fs.writeFile within test files or fixture helpers are forbidden (prevent auto-fixture generation).',
          });
        }
      }
    }

    // 2. Cloudflare Workers Missing ctx.waitUntil
    const fetchNodes: any[] = [];
    for (const m of sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration)) {
      if (m.getName() === 'fetch') fetchNodes.push(m);
    }
    for (const f of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
      if (f.getName() === 'fetch') fetchNodes.push(f);
    }
    for (const p of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
      if (p.getName() === 'fetch') {
        const init = p.getInitializer();
        if (
          init &&
          (init.getKind() === SyntaxKind.ArrowFunction ||
            init.getKind() === SyntaxKind.FunctionExpression)
        ) {
          fetchNodes.push(init);
        }
      }
    }

    for (const node of fetchNodes) {
      const params = node.getParameters ? node.getParameters() : [];
      const paramNames = params.map((p: any) => p.getName());
      const hasEnv =
        paramNames.includes('env') || paramNames.some((n: string) => /env/i.test(n));
      const hasCtx =
        paramNames.includes('ctx') ||
        paramNames.includes('context') ||
        paramNames.some((n: string) => /ctx|context/i.test(n));

      const isWorkerHandler =
        hasEnv || paramNames.length >= 2 || filePath.toLowerCase().includes('worker');
      if (!isWorkerHandler) continue;

      const body = node.getBody ? node.getBody() : null;
      const bodyText = body ? body.getText() : node.getText();

      // Case A: Missing ctx parameter while accessing env or doing work
      if (!hasCtx) {
        if (hasEnv || bodyText.includes('env.') || bodyText.includes('env[')) {
          violations.push({
            file: filePath,
            line: node.getStartLineNumber(),
            rule: RULE_CF_WORKER_WAITUNTIL,
            message:
              'Cloudflare Worker fetch handler uses bare env without ctx parameter or ctx.waitUntil.',
          });
          continue;
        }
      }

      // Case B: ctx parameter present, but unawaited background operations exist without ctx.waitUntil
      const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
      const hasWaitUntil = calls.some((c: CallExpression) => {
        const callee = c.getExpression().getText();
        return (
          callee === 'ctx.waitUntil' ||
          callee === 'context.waitUntil' ||
          callee.endsWith('.waitUntil')
        );
      });

      for (const call of calls) {
        const parent = call.getParent();
        if (!parent) continue;

        // Check if wrapped in ctx.waitUntil
        let p: any = parent;
        let wrappedInWaitUntil = false;
        while (p && p !== node) {
          if (p.getKind() === SyntaxKind.CallExpression) {
            const callee = p.getExpression().getText();
            if (
              callee === 'ctx.waitUntil' ||
              callee === 'context.waitUntil' ||
              callee.endsWith('.waitUntil')
            ) {
              wrappedInWaitUntil = true;
              break;
            }
          }
          p = p.getParent();
        }
        if (wrappedInWaitUntil) continue;

        // Check unawaited ExpressionStatement
        if (parent.getKind() === SyntaxKind.ExpressionStatement) {
          const callee = call.getExpression().getText();
          if (
            callee.startsWith('console.') ||
            callee.startsWith('headers.') ||
            callee === 'clearTimeout' ||
            callee === 'clearInterval'
          ) {
            continue;
          }

          if (
            callee.startsWith('env.') ||
            callee.startsWith('env[') ||
            callee === 'fetch' ||
            !hasWaitUntil
          ) {
            violations.push({
              file: filePath,
              line: call.getStartLineNumber(),
              rule: RULE_CF_WORKER_WAITUNTIL,
              message:
                'Cloudflare Workers: unawaited async operation or bare env usage without ctx.waitUntil.',
            });
          }
        }
      }
    }

    // 4. Swallowed Exceptions
    const catchClauses = sourceFile.getDescendantsOfKind(SyntaxKind.CatchClause);
    for (const cc of catchClauses) {
      const block = cc.getBlock();
      const statements = block.getStatements();
      const param = cc.getVariableDeclaration()?.getName();

      const effectiveStatements = statements.filter(
        s => s.getKind() !== SyntaxKind.EmptyStatement
      );

      // Condition 1: Empty catch block
      if (effectiveStatements.length === 0) {
        violations.push({
          file: filePath,
          line: cc.getStartLineNumber(),
          rule: RULE_SWALLOWED_EXCEPTIONS,
          message: 'Empty catch block without rethrow or handling is forbidden.',
        });
        continue;
      }

      // Condition 2: catch (_) without rethrow or handling
      if (param === '_') {
        const hasThrow = block.getDescendantsOfKind(SyntaxKind.ThrowStatement).length > 0;
        const blockText = block.getText();
        const hasHandling =
          hasThrow ||
          blockText.includes('console.') ||
          blockText.includes('logger.') ||
          blockText.includes('log.');

        if (!hasHandling) {
          violations.push({
            file: filePath,
            line: cc.getStartLineNumber(),
            rule: RULE_SWALLOWED_EXCEPTIONS,
            message:
              'Swallowed exception: catch (_) without rethrow or handling is forbidden.',
          });
        }
      }
    }

    return violations;
  }

  /**
   * Scans in-memory string content for forbidden patterns.
   */
  scanContent(content: string, filePath: string, oldContent?: string): PreflightCheckResult {
    if (!isCodeFile(filePath)) {
      return { valid: true, violations: [] };
    }

    const violations: PreflightViolation[] = [];

    // AST scan
    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.ts`;
    const sourceFile = this.project.createSourceFile(tempFileName, content, {
      overwrite: true,
    });

    try {
      violations.push(...this.scanSourceFile(sourceFile, filePath));
    } finally {
      this.project.removeSourceFile(sourceFile);
    }

    // Timing assertions check
    if (oldContent && isTestOrFixtureFile(filePath)) {
      const oldThresholds = extractTimingThresholds(oldContent);
      const newThresholds = extractTimingThresholds(content);

      for (const n of newThresholds) {
        const relaxedFrom = oldThresholds.find(
          o => o.type === n.type && n.value > o.value
        );
        if (relaxedFrom) {
          violations.push({
            file: filePath,
            line: n.line,
            rule: RULE_RELAXED_TIMING,
            message: `Relaxed timing assertion: threshold increased from ${relaxedFrom.value} to ${n.value} in test file.`,
          });
        }
      }
    }

    const deduplicated = this.deduplicateViolations(violations);
    return {
      valid: deduplicated.length === 0,
      violations: deduplicated,
    };
  }

  /**
   * Scans a file on disk.
   */
  scanFile(filePath: string, content?: string, oldContent?: string): PreflightCheckResult {
    if (!isCodeFile(filePath)) {
      return { valid: true, violations: [] };
    }

    const resolvedPath = path.resolve(filePath);
    const fileContent =
      content !== undefined
        ? content
        : fs.existsSync(resolvedPath)
        ? fs.readFileSync(resolvedPath, 'utf-8')
        : '';

    let previousContent = oldContent;
    if (previousContent === undefined && fs.existsSync(resolvedPath)) {
      // Try fetching previous content from git HEAD
      try {
        const gitRoot = findGitRoot(path.dirname(resolvedPath));
        const relPath = path.relative(gitRoot, resolvedPath).replace(/\\/g, '/');
        previousContent = child_process.execSync(`git show HEAD:${relPath}`, {
          cwd: gitRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        previousContent = undefined;
      }
    }

    return this.scanContent(fileContent, filePath, previousContent);
  }

  /**
   * Scans a unified git diff for forbidden anti-patterns.
   */
  scanDiff(diffText: string, projectDir?: string): PreflightCheckResult {
    const fileDiffs = GitDiffInspector.parse(diffText);
    const violations: PreflightViolation[] = [];

    for (const fileDiff of fileDiffs) {
      if (!fileDiff.newPath) continue;

      const filePath = fileDiff.newPath;
      if (!isCodeFile(filePath)) continue;

      const isTest = isTestOrFixtureFile(filePath);

      // Check Timing Assertions across hunks
      if (isTest) {
        for (const hunk of fileDiff.hunks) {
          const removedText = hunk.removedLines.map(l => l.content).join('\n');
          const removedThresholds = extractTimingThresholds(removedText);

          for (const addedLine of hunk.addedLines) {
            const addedThresholds = extractTimingThresholds(
              addedLine.content,
              addedLine.lineNumber
            );
            for (const added of addedThresholds) {
              const relaxedFrom = removedThresholds.find(
                rem => rem.type === added.type && added.value > rem.value
              );
              if (relaxedFrom) {
                violations.push({
                  file: filePath,
                  line: addedLine.lineNumber,
                  rule: RULE_RELAXED_TIMING,
                  message: `Relaxed timing assertion: threshold increased from ${relaxedFrom.value} to ${added.value} in test file.`,
                });
              }
            }
          }
        }
      }

      // Check AST patterns (Auto-fixtures, Worker waitUntil, Swallowed Exceptions)
      const addedLinesMap = new Map<number, string>();
      for (const hunk of fileDiff.hunks) {
        for (const addedLine of hunk.addedLines) {
          addedLinesMap.set(addedLine.lineNumber, addedLine.content);
        }
      }
      const addedLineNumbers = new Set(addedLinesMap.keys());

      // Attempt resolving full path against git root or projectDir
      let fullDiskPath = path.resolve(filePath);
      if (projectDir) {
        const gitRoot = findGitRoot(projectDir);
        const candidateGitRoot = path.resolve(gitRoot, filePath);
        const candidateProject = path.resolve(projectDir, filePath);
        if (fs.existsSync(candidateGitRoot)) {
          fullDiskPath = candidateGitRoot;
        } else if (fs.existsSync(candidateProject)) {
          fullDiskPath = candidateProject;
        }
      }

      let checkedOnDisk = false;
      if (fs.existsSync(fullDiskPath) && fs.statSync(fullDiskPath).isFile()) {
        try {
          const fullContent = fs.readFileSync(fullDiskPath, 'utf-8');
          const tempFile = `disk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.ts`;
          const sourceFile = this.project.createSourceFile(tempFile, fullContent, {
            overwrite: true,
          });
          try {
            const diskViolations = this.scanSourceFile(sourceFile, filePath);
            for (const v of diskViolations) {
              if (addedLineNumbers.has(v.line)) {
                violations.push(v);
              }
            }
            checkedOnDisk = true;
          } finally {
            this.project.removeSourceFile(sourceFile);
          }
        } catch {
          checkedOnDisk = false;
        }
      }

      // If file not on disk or to catch diff-only hunks (e.g. mock diffs in tests)
      if (!checkedOnDisk) {
        for (const hunk of fileDiff.hunks) {
          if (hunk.addedLines.length === 0) continue;

          // Check AST on hunk added code
          const hunkCode = hunk.addedLines.map(l => l.content).join('\n');
          const tempFile = `hunk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.ts`;
          try {
            const hunkSource = this.project.createSourceFile(tempFile, hunkCode, {
              overwrite: true,
            });
            try {
              const hunkViolations = this.scanSourceFile(hunkSource, filePath);
              for (const v of hunkViolations) {
                const relativeIdx = Math.max(0, v.line - 1);
                const actualLine =
                  hunk.addedLines[relativeIdx]?.lineNumber ||
                  hunk.newStart + relativeIdx;
                violations.push({
                  ...v,
                  line: actualLine,
                });
              }
            } finally {
              this.project.removeSourceFile(hunkSource);
            }
          } catch {
            // Fallback to regex if hunk is not a standalone valid AST
          }

          // Single-line patterns directly on addedLines as safety net
          for (const added of hunk.addedLines) {
            // Rule 1: writeFileSync / writeFile in test files
            if (
              isTest &&
              /\b(writeFileSync|writeFile)\b/.test(added.content) &&
              !/['"`].*?(writeFileSync|writeFile).*?['"`]/.test(added.content)
            ) {
              violations.push({
                file: filePath,
                line: added.lineNumber,
                rule: RULE_TEST_FIXTURE_AUTOGEN,
                message:
                  'Calls to writeFileSync or fs.writeFile within test files or fixture helpers are forbidden (prevent auto-fixture generation).',
              });
            }

            // Rule 4: Empty catch
            if (
              (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(added.content) ||
                /catch\s*\(\s*_\s*\)\s*\{[^}]*\}/.test(added.content)) &&
              !/['"`].*?catch.*?['"`]/.test(added.content)
            ) {
              const hasThrow = /throw\b/.test(added.content);
              const hasLog = /console\.|logger\.|log\./.test(added.content);
              if (!hasThrow && !hasLog) {
                violations.push({
                  file: filePath,
                  line: added.lineNumber,
                  rule: RULE_SWALLOWED_EXCEPTIONS,
                  message:
                    'Empty catch block or swallowed exception without rethrow or handling is forbidden.',
                });
              }
            }
          }
        }
      }
    }

    const deduplicated = this.deduplicateViolations(violations);
    return {
      valid: deduplicated.length === 0,
      violations: deduplicated,
    };
  }

  /**
   * Runs git diff on the target projectDir and scans the output.
   */
  scanGitDiff(options?: {
    projectDir?: string;
    staged?: boolean;
    head?: string;
  }): PreflightCheckResult {
    const cwd = options?.projectDir || process.cwd();
    const stagedFlag = options?.staged ? '--cached' : '';
    const headRef = options?.head && !options.staged ? options.head : '';

    let diffOutput = '';
    try {
      const gitCmd = `git diff ${stagedFlag} ${headRef}`.trim();
      diffOutput = child_process.execSync(gitCmd, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      return {
        valid: false,
        violations: [
          {
            file: 'git',
            line: 0,
            rule: 'git-diff-error',
            message: `Failed to execute git diff: ${err?.message || String(err)}`,
          },
        ],
      };
    }

    if (!diffOutput || !diffOutput.trim()) {
      return {
        valid: true,
        violations: [],
      };
    }

    return this.scanDiff(diffOutput, cwd);
  }

  private deduplicateViolations(violations: PreflightViolation[]): PreflightViolation[] {
    const seen = new Set<string>();
    return violations.filter(v => {
      const key = `${v.file}:${v.line}:${v.rule}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
