import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EphemeralProcessSandbox,
  type EphemeralExecutionResult,
  type EphemeralProcessOptions,
  type SandboxRuntime,
} from './ephemeral-sandbox.js';

export interface ExecutionProofOptions {
  /**
   * Working directory to execute the script in (e.g. the worktree root).
   */
  cwd?: string;

  /**
   * Execution timeout in milliseconds (default: 10000).
   */
  timeoutMs?: number;

  /**
   * Explicit runtime override ('node', 'tsx', or 'bash').
   * If omitted, auto-detected from file extension or content.
   */
  runtime?: SandboxRuntime;

  /**
   * Whether the reproduction script is expected to fail (default: true).
   * Reviewer reproduction scripts prove a flaw by producing non-zero exit or error traces.
   */
  expectedToFail?: boolean;

  /**
   * Additional environment variables for the sandbox.
   */
  env?: NodeJS.ProcessEnv;

  /**
   * CLI arguments to pass to the script.
   */
  args?: string[];
}

export interface ExecutionProofResult {
  verified: boolean;
  errorTrace?: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  reproPath?: string;
}

/**
 * ExecutionProofRunner executes reviewer-supplied `.repro.ts` / shell reproduction
 * scripts inside an EphemeralProcessSandbox and verifies whether the defect reproduces
 * with non-empty error traces.
 */
export class ExecutionProofRunner {
  private sandbox: EphemeralProcessSandbox;

  constructor(sandbox?: EphemeralProcessSandbox) {
    this.sandbox = sandbox ?? new EphemeralProcessSandbox();
  }

  /**
   * Executes a reproduction script (file path or inline code snippet) and returns
   * a structured execution proof result.
   */
  public async execute(
    scriptOrSnippet: string,
    options: ExecutionProofOptions = {}
  ): Promise<ExecutionProofResult> {
    const cwd = options.cwd ?? process.cwd();
    const timeoutMs = options.timeoutMs ?? 10000;
    const expectedToFail = options.expectedToFail ?? true;

    const isFile = this.isExistingFile(scriptOrSnippet, cwd);
    const runtime = options.runtime ?? this.detectRuntime(scriptOrSnippet, isFile);

    let rawResult: EphemeralExecutionResult;
    let reproPath: string | undefined;

    if (isFile) {
      reproPath = path.isAbsolute(scriptOrSnippet)
        ? scriptOrSnippet
        : path.resolve(cwd, scriptOrSnippet);

      rawResult = await this.sandbox.runScript(reproPath, {
        cwd,
        timeoutMs,
        runtime,
        env: options.env,
        args: options.args,
      });
    } else {
      rawResult = await this.sandbox.runInline(scriptOrSnippet, runtime, {
        cwd,
        timeoutMs,
        env: options.env,
        args: options.args,
      });
    }

    const exitCode = rawResult.exitCode ?? (rawResult.timedOut ? 124 : 1);
    const errorTrace = this.extractErrorTrace(rawResult, timeoutMs);

    let verified = false;
    if (expectedToFail) {
      // Invariant: Repro script must execute against worktree and produce non-empty error traces
      const failed = exitCode !== 0 || rawResult.timedOut;
      const hasErrorTrace = typeof errorTrace === 'string' && errorTrace.trim().length > 0;
      verified = failed && hasErrorTrace;
    } else {
      verified = exitCode === 0 && !rawResult.timedOut;
    }

    return {
      verified,
      errorTrace,
      exitCode,
      durationMs: rawResult.durationMs,
      stdout: rawResult.stdout,
      stderr: rawResult.stderr,
      timedOut: rawResult.timedOut,
      reproPath,
    };
  }

  /**
   * Formats execution proof results into a standardized Markdown section
   * suitable for inclusion in review findings and PR summaries.
   */
  public static formatProofMarkdown(result: ExecutionProofResult): string {
    const statusIcon = result.verified ? '✅' : '❌';
    const statusLabel = result.verified
      ? 'Verified Failure (Defect Successfully Reproduced)'
      : 'Unverified (Did Not Reproduce Failure)';

    let md = `### 🔬 Ephemeral Execution Proof\n\n`;
    md += `- **Status**: ${statusIcon} ${statusLabel}\n`;
    md += `- **Exit Code**: \`${result.exitCode}\`\n`;
    md += `- **Duration**: \`${result.durationMs}ms\`\n`;
    md += `- **Timed Out**: \`${result.timedOut}\`\n`;

    if (result.reproPath) {
      md += `- **Repro Target**: \`${result.reproPath}\`\n`;
    }

    md += `\n#### Error Trace\n`;
    if (result.errorTrace && result.errorTrace.trim().length > 0) {
      md += '```text\n' + result.errorTrace.trim() + '\n```\n';
    } else {
      md += '_No error trace captured._\n';
    }

    return md;
  }

  private isExistingFile(input: string, cwd: string): boolean {
    if (input.includes('\n')) return false;
    const resolved = path.isAbsolute(input) ? input : path.resolve(cwd, input);
    try {
      return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
    } catch {
      return false;
    }
  }

  private detectRuntime(input: string, isFile: boolean): SandboxRuntime {
    if (isFile) {
      const ext = path.extname(input).toLowerCase();
      if (ext === '.ts' || ext === '.tsx') return 'tsx';
      if (ext === '.sh' || ext === '.bash') return 'bash';
      return 'node';
    }

    // Inline content inspection
    if (
      input.startsWith('#!/bin/bash') ||
      input.startsWith('#!/bin/sh') ||
      /^(set -e|curl |npm |git )/m.test(input)
    ) {
      return 'bash';
    }

    if (
      input.includes('import ') ||
      input.includes('export ') ||
      /:\s*(string|number|boolean|any)\b/.test(input) ||
      input.includes('interface ') ||
      input.includes('type ')
    ) {
      return 'tsx';
    }

    return 'node';
  }

  private extractErrorTrace(
    raw: EphemeralExecutionResult,
    timeoutMs: number
  ): string | undefined {
    const traces: string[] = [];

    if (raw.timedOut) {
      traces.push(`[TIMEOUT_EXCEEDED] Execution exceeded timeout of ${timeoutMs}ms and was killed.`);
    }

    if (raw.stderr && raw.stderr.trim()) {
      traces.push(raw.stderr.trim());
    }

    if (raw.error) {
      traces.push(raw.error.stack || raw.error.message);
    }

    // If stderr is empty, inspect stdout for stack traces or error outputs
    if (!raw.stderr || !raw.stderr.trim()) {
      const errorLines = raw.stdout
        .split('\n')
        .filter((line) =>
          /(Error:|Exception:|AssertionError|FAILED|SyntaxError|TypeError|ReferenceError)/i.test(line)
        );
      if (errorLines.length > 0) {
        traces.push(errorLines.join('\n'));
      }
    }

    if (traces.length === 0 && raw.exitCode !== null && raw.exitCode !== 0) {
      traces.push(`Process terminated with non-zero exit code (${raw.exitCode}).`);
    }

    return traces.length > 0 ? traces.join('\n\n') : undefined;
  }
}
