/**
 * TranscriptParser
 *
 * Ingests and parses agent execution transcripts (transcript.jsonl), extracting
 * discrete tool calls, test runs, assertion failures, and failure-remediation pairs.
 *
 * Invariant: Transcript parser MUST extract real tool calls and redact credentials
 * via TrajectorySanitizer.
 */

import { ExecutionStep, RemediationPair } from './types.js';
import { TrajectorySanitizer } from './sanitizer.js';

export class TranscriptParser {
  /**
   * Parses JSONL content from a transcript into sanitized ExecutionStep array.
   */
  public static parseTranscript(transcriptContent: string): ExecutionStep[] {
    if (typeof transcriptContent !== 'string' || !transcriptContent.trim()) {
      return [];
    }

    const lines = transcriptContent.split(/\r?\n/);
    const steps: ExecutionStep[] = [];
    const pendingCalls = new Map<string, { step: ExecutionStep; timestamp?: number }>();
    const unkeyedPending: ExecutionStep[] = [];
    let stepCounter = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Skip malformed JSON lines
        continue;
      }

      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      // Check if this line is a tool response / result reconciling a pending call
      const isResponse =
        parsed.type === 'tool_response' ||
        parsed.type === 'TOOL_RESPONSE' ||
        parsed.type === 'tool_result' ||
        parsed.tool_call_id !== undefined ||
        parsed.call_id !== undefined;

      if (isResponse) {
        const callId = parsed.tool_call_id ?? parsed.call_id ?? parsed.id;
        let matched: ExecutionStep | undefined;

        if (callId && pendingCalls.has(callId)) {
          matched = pendingCalls.get(callId)?.step;
          pendingCalls.delete(callId);
        } else if (unkeyedPending.length > 0) {
          matched = unkeyedPending.shift();
        }

        if (matched) {
          const rawOutput =
            parsed.output !== undefined
              ? parsed.output
              : parsed.result !== undefined
              ? parsed.result
              : parsed.response !== undefined
              ? parsed.response
              : parsed.content;

          matched.output = TrajectorySanitizer.sanitizeObject(rawOutput);
          matched.status = this.determineStatus(
            parsed.status ?? matched.status,
            parsed.error,
            parsed.is_error ?? parsed.isError,
            parsed.exitCode,
            rawOutput
          );
          if (typeof parsed.durationMs === 'number') {
            matched.durationMs = parsed.durationMs;
          }
          steps.push(matched);
        }
        continue;
      }

      // Check if this line contains tool_calls (e.g. PLANNER_RESPONSE)
      const rawCalls =
        parsed.tool_calls ??
        parsed.toolCalls ??
        parsed.functionCalls ??
        parsed.calls ??
        parsed.tools;

      if (Array.isArray(rawCalls) && rawCalls.length > 0) {
        for (const call of rawCalls) {
          if (!call || typeof call !== 'object') continue;

          const tool = String(
            call.name ??
              call.tool ??
              call.toolName ??
              call.function?.name ??
              parsed.name ??
              parsed.tool ??
              'unknown_tool'
          );

          let input = call.args ?? call.input ?? call.parameters;
          if (input === undefined && call.function?.arguments !== undefined) {
            if (typeof call.function.arguments === 'string') {
              try {
                input = JSON.parse(call.function.arguments);
              } catch {
                input = call.function.arguments;
              }
            } else {
              input = call.function.arguments;
            }
          }

          const rawOutput =
            call.output !== undefined
              ? call.output
              : call.result !== undefined
              ? call.result
              : call.response;

          const status = this.determineStatus(
            call.status ?? parsed.status,
            call.error ?? parsed.error,
            call.is_error ?? call.isError ?? parsed.is_error ?? parsed.isError,
            call.exitCode ?? parsed.exitCode,
            rawOutput
          );

          const stepIndex =
            typeof call.stepIndex === 'number'
              ? call.stepIndex
              : typeof call.step_index === 'number'
              ? call.step_index
              : typeof parsed.stepIndex === 'number'
              ? parsed.stepIndex
              : typeof parsed.step_index === 'number'
              ? parsed.step_index
              : stepCounter++;

          const sanitizedInput = TrajectorySanitizer.sanitizeObject(input);
          const sanitizedOutput = TrajectorySanitizer.sanitizeObject(rawOutput);

          const step: ExecutionStep = {
            stepIndex,
            tool,
            input: sanitizedInput,
            output: sanitizedOutput,
            status,
            durationMs:
              typeof call.durationMs === 'number'
                ? call.durationMs
                : typeof parsed.durationMs === 'number'
                ? parsed.durationMs
                : undefined,
          };

          if (rawOutput !== undefined || call.status !== undefined) {
            steps.push(step);
          } else if (call.id) {
            pendingCalls.set(call.id, { step });
          } else {
            unkeyedPending.push(step);
          }
        }
        continue;
      }

      // Check if this line is a standalone tool invocation step
      const isToolStep =
        parsed.tool !== undefined ||
        parsed.toolName !== undefined ||
        parsed.type === 'tool_call' ||
        parsed.type === 'tool_execution' ||
        parsed.type === 'step' ||
        (parsed.name && (parsed.args !== undefined || parsed.input !== undefined));

      if (isToolStep) {
        const tool = String(
          parsed.tool ?? parsed.toolName ?? parsed.name ?? 'unknown_tool'
        );
        let input = parsed.input ?? parsed.args ?? parsed.parameters;
        if (input === undefined && parsed.function?.arguments !== undefined) {
          if (typeof parsed.function.arguments === 'string') {
            try {
              input = JSON.parse(parsed.function.arguments);
            } catch {
              input = parsed.function.arguments;
            }
          } else {
            input = parsed.function.arguments;
          }
        }

        const rawOutput =
          parsed.output !== undefined
            ? parsed.output
            : parsed.result !== undefined
            ? parsed.result
            : parsed.response;

        const status = this.determineStatus(
          parsed.status,
          parsed.error,
          parsed.is_error ?? parsed.isError,
          parsed.exitCode,
          rawOutput
        );

        const stepIndex =
          typeof parsed.stepIndex === 'number'
            ? parsed.stepIndex
            : typeof parsed.step_index === 'number'
            ? parsed.step_index
            : stepCounter++;

        const sanitizedInput = TrajectorySanitizer.sanitizeObject(input);
        const sanitizedOutput = TrajectorySanitizer.sanitizeObject(rawOutput);

        const step: ExecutionStep = {
          stepIndex,
          tool,
          input: sanitizedInput,
          output: sanitizedOutput,
          status,
          durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : undefined,
        };

        if (parsed.type === 'tool_call' && rawOutput === undefined && (parsed.id || parsed.call_id)) {
          const callId = parsed.id ?? parsed.call_id;
          pendingCalls.set(callId, { step });
        } else {
          steps.push(step);
        }
      }
    }

    // Flush any unresolved pending calls (completed with undefined output)
    for (const { step } of pendingCalls.values()) {
      steps.push(step);
    }
    for (const step of unkeyedPending) {
      steps.push(step);
    }

    // Sort steps strictly by stepIndex
    steps.sort((a, b) => a.stepIndex - b.stepIndex);

    return steps;
  }

  /**
   * Extracts failure-remediation pairs from a sequence of execution steps.
   * Detects error steps followed by subsequent successful resolution steps.
   */
  public static extractFailureRemediationPairs(steps: ExecutionStep[]): RemediationPair[] {
    const pairs: RemediationPair[] = [];
    let i = 0;

    while (i < steps.length) {
      const step = steps[i];
      if (step.status === 'error') {
        const failureStep = step;
        const resolutionSteps: ExecutionStep[] = [];
        let j = i + 1;

        while (j < steps.length && steps[j].status === 'success') {
          resolutionSteps.push(steps[j]);
          j++;
        }

        if (resolutionSteps.length > 0) {
          const errorSummary = this.extractCleanErrorSummary(failureStep);
          let diffHunk: string | undefined;

          // Attempt to extract diff hunk from resolution steps if file edits occurred
          for (const resStep of resolutionSteps) {
            if (
              resStep.tool === 'replace_file_content' &&
              typeof resStep.input === 'object' &&
              resStep.input !== null
            ) {
              const inp = resStep.input as Record<string, any>;
              if (inp.TargetFile && inp.TargetContent && inp.ReplacementContent) {
                diffHunk = `--- a/${inp.TargetFile}\n+++ b/${inp.TargetFile}\n- ${inp.TargetContent}\n+ ${inp.ReplacementContent}`;
                break;
              }
            }
          }

          pairs.push({
            id: `rem-${failureStep.stepIndex}`,
            failureStep,
            errorSummary,
            resolutionSteps,
            ...(diffHunk ? { diffHunk } : {}),
          });

          i = j;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }

    return pairs;
  }

  /**
   * Helper to determine step status ('success' | 'error').
   */
  private static determineStatus(
    statusVal: unknown,
    errorVal: unknown,
    isErrorVal: unknown,
    exitCodeVal: unknown,
    outputVal: unknown
  ): 'success' | 'error' {
    if (
      statusVal === 'error' ||
      statusVal === 'ERROR' ||
      statusVal === 'fail' ||
      statusVal === 'failure'
    ) {
      return 'error';
    }

    if (isErrorVal === true) {
      return 'error';
    }

    if (errorVal !== undefined && errorVal !== null && errorVal !== false) {
      return 'error';
    }

    if (typeof exitCodeVal === 'number' && exitCodeVal !== 0) {
      return 'error';
    }

    if (typeof outputVal === 'object' && outputVal !== null) {
      const outObj = outputVal as Record<string, any>;
      if (outObj.status === 'error' || outObj.isError === true) return 'error';
      if (outObj.error !== undefined && outObj.error !== null && outObj.error !== false) return 'error';
      if (typeof outObj.exitCode === 'number' && outObj.exitCode !== 0) return 'error';
      if (typeof outObj.code === 'number' && outObj.code !== 0) return 'error';
      if (typeof outObj.stderr === 'string' && this.hasErrorIndicators(outObj.stderr)) return 'error';
      if (typeof outObj.stdout === 'string' && this.hasErrorIndicators(outObj.stdout)) return 'error';
    }

    if (typeof outputVal === 'string' && this.hasErrorIndicators(outputVal)) {
      return 'error';
    }

    return 'success';
  }

  /**
   * Checks if string text exhibits error/failure patterns (test failures, assertion errors, exit codes).
   */
  private static hasErrorIndicators(text: string): boolean {
    const errorRegexes = [
      /\bAssertionError\b/i,
      /\bAssertion failed\b/i,
      /\bTests?\s+failed\b/i,
      /\bTest Suites?:\s*.*failed\b/i,
      /\bFAIL\s+.*(?:\.test\.|\.spec\.)/i,
      /(?:^|\n)\s*FAIL(?:\s|:)/,
      /\bnpm ERR!\b/,
      /\bCommand failed(?::|\s+with\s+exit\s+code)/i,
      /\bprocess exited with code [1-9]\b/i,
      /\bexit code:? [1-9]\b/i,
    ];

    return errorRegexes.some(rx => rx.test(text));
  }

  /**
   * Formulates a clean, concise error summary string from a failure step.
   */
  private static extractCleanErrorSummary(step: ExecutionStep): string {
    if (typeof step.output === 'string') {
      const scrubbed = step.output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      const lines = scrubbed
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      const keyLines = lines.filter(l =>
        /\b(?:AssertionError|Error|Exception|FAIL|FAILED|npm ERR!|failed with exit code)\b/i.test(l)
      );

      if (keyLines.length > 0) {
        return keyLines.slice(0, 2).join(': ').slice(0, 300);
      }

      if (lines.length > 0) {
        return lines[0].slice(0, 300);
      }
    }

    if (typeof step.output === 'object' && step.output !== null) {
      const out = step.output as Record<string, any>;
      if (typeof out.error === 'string') return out.error.slice(0, 300);
      if (out.error && typeof out.error.message === 'string') return out.error.message.slice(0, 300);
      if (typeof out.stderr === 'string' && out.stderr.trim()) {
        const lines = out.stderr
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);
        const keyLines = lines.filter(l =>
          /\b(?:AssertionError|Error|Exception|FAIL|FAILED|npm ERR!)\b/i.test(l)
        );
        if (keyLines.length > 0) return keyLines.slice(0, 2).join(': ').slice(0, 300);
        return lines[0].slice(0, 300);
      }
      if (typeof out.message === 'string') return out.message.slice(0, 300);
    }

    if (typeof step.input === 'object' && step.input !== null) {
      const inp = step.input as Record<string, any>;
      if (typeof inp.CommandLine === 'string') {
        return `Command failed: ${inp.CommandLine}`;
      }
    }

    return `${step.tool} failed with status: error`;
  }
}
