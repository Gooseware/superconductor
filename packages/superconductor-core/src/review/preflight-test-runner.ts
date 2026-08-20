import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PreflightTestResult {
  exitCode: number;
  passed: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  testCount?: number;
  suiteCount?: number;
  command: string;
  markdown: string;
  timestamp: string;
}

export interface PreflightTestOptions {
  projectRoot?: string;
  command?: string;
  timeoutMs?: number;
  persist?: boolean;
}

/**
 * Parses test runner output to extract testCount and suiteCount if available.
 */
export function parseTestCounts(output: string): { testCount?: number; suiteCount?: number } {
  let testCount: number | undefined;
  let suiteCount: number | undefined;

  // Vitest / Jest style suites: "Test Suites: 2 passed, 2 total" or "Suites  2 passed (2)" or "Test Files  2 passed (2)"
  const suiteMatch =
    output.match(/(?:Test Suites?|Test Files?|Suites?):\s*(\d+)\s*passed/i) ||
    output.match(/(?:Test Suites?|Test Files?|Suites?)\s+(\d+)\s+passed/i) ||
    output.match(/(\d+)\s*suites/i);
  if (suiteMatch && suiteMatch[1]) {
    suiteCount = parseInt(suiteMatch[1], 10);
  }

  // Vitest / Jest / Mocha style tests: "Tests: 12 passed, 12 total" or "Tests  12 passed (12)" or "12 passed"
  const testMatch =
    output.match(/Tests?:\s*(\d+)\s*passed/i) ||
    output.match(/Tests?\s+(\d+)\s+passed/i) ||
    output.match(/(\d+)\s+passed/i) ||
    output.match(/(\d+)\s+tests?/i);
  if (testMatch && testMatch[1]) {
    testCount = parseInt(testMatch[1], 10);
  }

  return { testCount, suiteCount };
}

/**
 * Generates the standardized markdown block for preflight test execution evidence.
 */
export function formatPreflightMarkdown(result: {
  passed: boolean;
  exitCode: number;
  durationMs: number;
  command: string;
  stdout: string;
  stderr: string;
}): string {
  const status = result.passed ? 'PASSED' : 'FAILED';
  const durationSec = (result.durationMs / 1000).toFixed(1);
  const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  const snippet = combined.length > 8000 ? combined.slice(-8000) : (combined || '(no output)');

  return [
    '## Preflight Test Execution Evidence',
    `- Status: ${status}`,
    `- Exit Code: ${result.exitCode}`,
    `- Duration: ${durationSec}s`,
    `- Command: ${result.command}`,
    '```text',
    snippet,
    '```',
  ].join('\n');
}

/**
 * Detects the default test command for the project.
 */
export function detectTestCommand(projectRoot: string): string {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg?.scripts?.test) {
        return 'npm test';
      }
    } catch {
      // ignore parse errors and fallback
    }
  }
  return 'npm test';
}

export class QuorumPreflightTestRunner {
  private projectRoot: string;
  private command?: string;
  private timeoutMs: number;

  constructor(options: PreflightTestOptions = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.command = options.command;
    this.timeoutMs = options.timeoutMs ?? 120000;
  }

  /**
   * Executes the test command once in a child process, captures execution metrics,
   * generates standardized markdown evidence, and persists results.
   */
  public async runPreflightTests(options: PreflightTestOptions = {}): Promise<PreflightTestResult> {
    const projectRoot = options.projectRoot ?? this.projectRoot;
    const command = options.command ?? this.command ?? detectTestCommand(projectRoot);
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const persist = options.persist ?? true;

    const startTime = Date.now();

    const execution = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
      let stdout = '';
      let stderr = '';
      let finished = false;
      let timeoutHandle: NodeJS.Timeout | undefined;

      const proc = child_process.spawn(command, {
        cwd: projectRoot,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const finish = (code: number) => {
        if (finished) return;
        finished = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        resolve({ exitCode: code, stdout, stderr });
      };

      timeoutHandle = setTimeout(() => {
        stderr += `\n[Error: Preflight test execution timed out after ${timeoutMs}ms]`;
        try {
          proc.kill('SIGTERM');
        } catch {
          // ignore
        }
        finish(-1);
      }, timeoutMs);

      proc.on('close', (code, signal) => {
        finish(code ?? (signal ? -1 : 0));
      });

      proc.on('error', (err) => {
        stderr += `\n[Process Error: ${err.message}]`;
        finish(-1);
      });
    });

    const durationMs = Date.now() - startTime;
    const passed = execution.exitCode === 0;
    const timestamp = new Date().toISOString();

    const counts = parseTestCounts(`${execution.stdout}\n${execution.stderr}`);

    const markdown = formatPreflightMarkdown({
      passed,
      exitCode: execution.exitCode,
      durationMs,
      command,
      stdout: execution.stdout,
      stderr: execution.stderr,
    });

    const result: PreflightTestResult = {
      exitCode: execution.exitCode,
      passed,
      stdout: execution.stdout,
      stderr: execution.stderr,
      durationMs,
      testCount: counts.testCount,
      suiteCount: counts.suiteCount,
      command,
      markdown,
      timestamp,
    };

    if (persist) {
      try {
        const persistPath = path.join(projectRoot, '.superconductor', 'quorum', 'preflight-test-results.json');
        fs.mkdirSync(path.dirname(persistPath), { recursive: true });
        fs.writeFileSync(persistPath, JSON.stringify(result, null, 2), 'utf-8');
      } catch (err) {
        // Silently log or ignore persistence errors in restricted environments
      }
    }

    return result;
  }

  /**
   * Static helper for running preflight tests without creating an instance.
   */
  public static async runPreflightTests(options: PreflightTestOptions = {}): Promise<PreflightTestResult> {
    const runner = new QuorumPreflightTestRunner(options);
    return runner.runPreflightTests(options);
  }
}
