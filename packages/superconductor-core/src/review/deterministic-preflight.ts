import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { evaluateInvariantRules, RuleViolation } from './rules/index.js';

export interface PreflightResult {
  status: 'passed' | 'failed' | 'skipped';
  tool_used?: string;
  short_circuit: boolean;
  diagnostics: string;
  violations?: RuleViolation[];
}

export interface DeterministicPreflightOptions {
  files?: Array<{ path: string; content: string; diff?: string }>;
  staged?: boolean;
}

/**
 * Detects the primary programming language of a project.
 * First checks superconductor/tech-stack.md for explicit mentions,
 * then falls back to the presence of well-known root config files.
 * Returns 'typescript' | 'python' | 'go' | 'rust' | 'unknown'.
 */
function detectFromTechStack(content: string): string | null {
  if (content.includes('typescript') || content.includes('tsconfig')) return 'typescript';
  if (content.includes('python') || content.includes('pyproject') || content.includes('requirements.txt')) return 'python';
  if (content.includes('go.mod') || content.includes('golang') || content.includes(' go ')) return 'go';
  if (content.includes('cargo.toml') || content.includes('rust')) return 'rust';
  return null;
}

function detectFromFiles(projectDir: string): string {
  if (fs.existsSync(path.join(projectDir, 'tsconfig.json')) || fs.existsSync(path.join(projectDir, 'package.json'))) return 'typescript';
  if (fs.existsSync(path.join(projectDir, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) return 'rust';
  if (fs.existsSync(path.join(projectDir, 'pyproject.toml')) || fs.existsSync(path.join(projectDir, 'requirements.txt'))) return 'python';
  return 'unknown';
}

export function detectProjectLanguage(projectDir: string): string {
  const techStackPath = path.join(projectDir, 'superconductor', 'tech-stack.md');
  if (fs.existsSync(techStackPath)) {
    const content = fs.readFileSync(techStackPath, 'utf-8').toLowerCase();
    return detectFromTechStack(content) || 'unknown';
  }
  return detectFromFiles(projectDir);
}

/**
 * Returns the CLI diagnostic command for a detected language,
 * or undefined when no tool is configured for that language.
 */
export function getDiagnosticCommand(lang: string): string | undefined {
  const commands: Record<string, string> = {
    typescript: 'npx tsc --noEmit',
    python: 'pyright .',
    go: 'go vet ./...',
    rust: 'cargo check',
  };
  return commands[lang];
}

/**
 * Runs the given diagnostic command inside projectDir and maps the
 * outcome to a PreflightResult. A non-zero exit short-circuits the review.
 */
function executeDiagnosticCommand(command: string, projectDir: string): PreflightResult {
  try {
    const output = execSync(command, {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000 // 30s timeout to prevent hanging execution
    });
    return {
      status: 'passed',
      tool_used: command,
      short_circuit: false,
      diagnostics: output
    };
  } catch (err: any) {
    const stderr = err.stderr || err.stdout || err.message;
    return {
      status: 'failed',
      tool_used: command,
      short_circuit: true, // Non-zero exit with stderr triggers short-circuit
      diagnostics: stderr
    };
  }
}

function getGitChangedFiles(
  projectDir: string,
  stagedOnly = false
): Array<{ path: string; content: string; diff?: string }> {
  try {
    const gitStatusCmd = 'git status --porcelain';
    const statusOutput = execSync(gitStatusCmd, {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();

    if (!statusOutput) {
      return [];
    }

    const lines = statusOutput.split('\n');
    const files: Array<{ path: string; content: string; diff?: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const stagedStatus = line[0];
      const unstagedStatus = line[1];

      // If stagedOnly is true, only include files with changes staged in git index
      if (stagedOnly && (stagedStatus === ' ' || stagedStatus === '?')) {
        continue;
      }

      // Porcelain format: XY PATH or XY "PATH" or XY ORIG -> NEW
      const filePathPart = line.slice(2).trim();
      const actualPath = filePathPart.includes('->')
        ? filePathPart.split('->').pop()!.trim().replace(/^["']|["']$/g, '')
        : filePathPart.replace(/^["']|["']$/g, '');

      if (!/\.(?:[jt]sx?|[cm][jt]s)$/i.test(actualPath)) {
        continue;
      }

      const fullPath = path.isAbsolute(actualPath) ? actualPath : path.join(projectDir, actualPath);
      let content = '';
      if (fs.existsSync(fullPath)) {
        try {
          content = fs.readFileSync(fullPath, 'utf-8');
        } catch (err) {
          if (process.env.DEBUG) console.debug('Failed to read file content:', err);
        }
      }

      let diff = '';
      try {
        const diffCmd = stagedOnly
          ? `git diff --cached -- "${actualPath}"`
          : `git diff HEAD -- "${actualPath}"`;
        diff = execSync(diffCmd, {
          cwd: projectDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 10000,
        });
      } catch (err) {
        if (process.env.DEBUG) console.debug('Failed git diff HEAD:', err);
        try {
          diff = execSync(`git diff -- "${actualPath}"`, {
            cwd: projectDir,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 10000,
          });
        } catch (fallbackErr) {
          if (process.env.DEBUG) console.debug('Failed fallback git diff:', fallbackErr);
        }
      }

      files.push({
        path: actualPath,
        content,
        diff: diff || undefined,
      });
    }

    return files;
  } catch (err) {
    if (process.env.DEBUG) console.debug('Failed to inspect git status:', err);
    return [];
  }
}

function formatViolationsDiagnostics(violations: RuleViolation[]): string {
  return violations
    .map(v => {
      const loc = v.line ? `:${v.line}${v.column ? `:${v.column}` : ''}` : '';
      let msg = `[${v.ruleId}] [${v.severity.toUpperCase()}] ${v.file}${loc} - ${v.message}`;
      if (v.snippet) {
        msg += `\n  Snippet: ${v.snippet}`;
      }
      return msg;
    })
    .join('\n\n');
}

export function runDeterministicPreflight(
  projectDir: string,
  options?: DeterministicPreflightOptions
): PreflightResult {
  const filesToEvaluate = options?.files ?? getGitChangedFiles(projectDir, options?.staged);

  if (filesToEvaluate && filesToEvaluate.length > 0) {
    const evalResult = evaluateInvariantRules({ files: filesToEvaluate });
    if (!evalResult.passed && evalResult.violations.length > 0) {
      return {
        status: 'failed',
        tool_used: 'invariant-rules-engine',
        short_circuit: true,
        diagnostics: formatViolationsDiagnostics(evalResult.violations),
        violations: evalResult.violations,
      };
    }
  }

  const lang = detectProjectLanguage(projectDir);
  const command = getDiagnosticCommand(lang);
  if (!command) {
    return { status: 'skipped', short_circuit: false, diagnostics: `No diagnostic tool configured for language: ${lang}` };
  }
  return executeDiagnosticCommand(command, projectDir);
}


