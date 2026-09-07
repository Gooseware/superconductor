import { describe, it, expect } from 'vitest';
import { TranscriptParser } from '../transcript-parser.js';
import { ExecutionStep } from '../types.js';

describe('TranscriptParser', () => {
  describe('parseTranscript', () => {
    it('parses standard single-line ExecutionStep JSONL entries', () => {
      const jsonl = [
        JSON.stringify({
          stepIndex: 0,
          tool: 'view_file',
          input: { AbsolutePath: '/workspace/src/auth.ts' },
          output: 'export function verify() {}',
          status: 'success',
        }),
        JSON.stringify({
          stepIndex: 1,
          tool: 'run_command',
          input: { CommandLine: 'npm test' },
          output: 'PASS src/auth.test.ts',
          status: 'success',
        }),
      ].join('\n');

      const steps = TranscriptParser.parseTranscript(jsonl);

      expect(steps).toHaveLength(2);
      expect(steps[0]).toEqual({
        stepIndex: 0,
        tool: 'view_file',
        input: { AbsolutePath: '/workspace/src/auth.ts' },
        output: 'export function verify() {}',
        status: 'success',
      });
      expect(steps[1]).toEqual({
        stepIndex: 1,
        tool: 'run_command',
        input: { CommandLine: 'npm test' },
        output: 'PASS src/auth.test.ts',
        status: 'success',
      });
    });

    it('parses PLANNER_RESPONSE events with nested tool_calls', () => {
      const jsonl = JSON.stringify({
        type: 'PLANNER_RESPONSE',
        stepIndex: 0,
        tool_calls: [
          {
            id: 'call_1',
            name: 'run_command',
            args: { CommandLine: 'npm test' },
            output: 'FAIL: AssertionError: expected 401 to be 200',
            status: 'error',
          },
          {
            id: 'call_2',
            name: 'view_file',
            args: { AbsolutePath: '/workspace/src/index.ts' },
            output: 'const x = 1;',
            status: 'success',
          },
        ],
      });

      const steps = TranscriptParser.parseTranscript(jsonl);

      expect(steps).toHaveLength(2);
      expect(steps[0].tool).toBe('run_command');
      expect(steps[0].input).toEqual({ CommandLine: 'npm test' });
      expect(steps[0].output).toContain('AssertionError');
      expect(steps[0].status).toBe('error');

      expect(steps[1].tool).toBe('view_file');
      expect(steps[1].input).toEqual({ AbsolutePath: '/workspace/src/index.ts' });
      expect(steps[1].status).toBe('success');
    });

    it('reconciles separate tool_call and tool_response lines by ID', () => {
      const jsonl = [
        JSON.stringify({
          type: 'tool_call',
          id: 'call_abc_123',
          name: 'run_command',
          args: { CommandLine: 'npm test' },
        }),
        JSON.stringify({
          type: 'tool_response',
          tool_call_id: 'call_abc_123',
          output: 'All 15 tests passed',
          status: 'success',
        }),
      ].join('\n');

      const steps = TranscriptParser.parseTranscript(jsonl);

      expect(steps).toHaveLength(1);
      expect(steps[0].tool).toBe('run_command');
      expect(steps[0].input).toEqual({ CommandLine: 'npm test' });
      expect(steps[0].output).toBe('All 15 tests passed');
      expect(steps[0].status).toBe('success');
    });

    it('parses tool calls with stringified function.arguments', () => {
      const jsonl = JSON.stringify({
        type: 'PLANNER_RESPONSE',
        tool_calls: [
          {
            id: 'call_fn_1',
            type: 'function',
            function: {
              name: 'replace_file_content',
              arguments: JSON.stringify({
                TargetFile: '/workspace/src/auth.ts',
                ReplacementContent: 'export const configValue = "configured";',
              }),
            },
            output: 'Successfully replaced content',
            status: 'success',
          },
        ],
      });

      const steps = TranscriptParser.parseTranscript(jsonl);

      expect(steps).toHaveLength(1);
      expect(steps[0].tool).toBe('replace_file_content');
      expect(steps[0].input).toEqual({
        TargetFile: '/workspace/src/auth.ts',
        ReplacementContent: 'export const configValue = "configured";',
      });
      expect(steps[0].status).toBe('success');
    });

    it('redacts sensitive credentials and tokens via TrajectorySanitizer in both input and output', () => {
      const jsonl = [
        JSON.stringify({
          stepIndex: 0,
          tool: 'run_command',
          input: {
            CommandLine: 'curl -H "Authorization: Bearer mySecretToken123456" https://api.example.com',
            API_KEY: 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz',
          },
          output: 'Connected with Bearer secretBearerToken123 and dfp_deerflowToken123456789',
          status: 'success',
        }),
      ].join('\n');

      const steps = TranscriptParser.parseTranscript(jsonl);

      expect(steps).toHaveLength(1);
      const input = steps[0].input as any;
      expect(input.CommandLine).not.toContain('mySecretToken123456');
      expect(input.CommandLine).toContain('[REDACTED]');
      expect(input.API_KEY).toBe('[REDACTED]');

      const output = steps[0].output as string;
      expect(output).not.toContain('secretBearerToken123');
      expect(output).not.toContain('dfp_deerflowToken123456789');
      expect(output).toContain('[REDACTED]');
    });

    it('detects error status from assertion errors, exit codes, and error indicators in output', () => {
      const jsonl = [
        JSON.stringify({
          stepIndex: 0,
          tool: 'run_command',
          input: { CommandLine: 'npm test' },
          output: 'FAIL src/auth.test.ts\nAssertionError: expected false to be true\n    at Object.<anonymous>',
        }),
        JSON.stringify({
          stepIndex: 1,
          tool: 'run_command',
          input: { CommandLine: 'node script.js' },
          output: { exitCode: 1, stderr: 'Command failed with exit code 1' },
        }),
      ].join('\n');

      const steps = TranscriptParser.parseTranscript(jsonl);

      expect(steps).toHaveLength(2);
      expect(steps[0].status).toBe('error');
      expect(steps[1].status).toBe('error');
    });

    it('skips malformed and empty lines gracefully without throwing', () => {
      const jsonl = `
        {"stepIndex": 0, "tool": "view_file", "input": {}, "output": "ok", "status": "success"}

        { this is not valid json }
        {"stepIndex": 1, "tool": "view_file", "input": {}, "output": "ok2", "status": "success"}
      `;

      const steps = TranscriptParser.parseTranscript(jsonl);

      expect(steps).toHaveLength(2);
      expect(steps[0].stepIndex).toBe(0);
      expect(steps[1].stepIndex).toBe(1);
    });
  });

  describe('extractFailureRemediationPairs', () => {
    it('extracts remediation pairs from a failed test run followed by successful fix steps', () => {
      const steps: ExecutionStep[] = [
        {
          stepIndex: 0,
          tool: 'run_command',
          input: { CommandLine: 'npm test' },
          output: 'FAIL src/jwt.test.ts\nAssertionError: expected 401 to be 200\n    at /src/jwt.test.ts:45',
          status: 'error',
        },
        {
          stepIndex: 1,
          tool: 'view_file',
          input: { AbsolutePath: '/src/jwt.ts' },
          output: 'const valid = false;',
          status: 'success',
        },
        {
          stepIndex: 2,
          tool: 'replace_file_content',
          input: {
            TargetFile: '/src/jwt.ts',
            TargetContent: 'const valid = false;',
            ReplacementContent: 'const valid = true;',
          },
          output: 'Replaced line',
          status: 'success',
        },
        {
          stepIndex: 3,
          tool: 'run_command',
          input: { CommandLine: 'npm test' },
          output: 'PASS src/jwt.test.ts (1 passed)',
          status: 'success',
        },
      ];

      const pairs = TranscriptParser.extractFailureRemediationPairs(steps);

      expect(pairs).toHaveLength(1);
      const pair = pairs[0];
      expect(pair.id).toBeDefined();
      expect(pair.failureStep?.stepIndex).toBe(0);
      expect(pair.errorSummary).toContain('AssertionError');
      expect(pair.errorSummary).toContain('expected 401 to be 200');
      expect(pair.resolutionSteps).toHaveLength(3);
      expect(pair.resolutionSteps.map(s => s.stepIndex)).toEqual([1, 2, 3]);
    });

    it('extracts multiple distinct remediation pairs across a multi-stage failure and fix session', () => {
      const steps: ExecutionStep[] = [
        // Failure 1
        {
          stepIndex: 0,
          tool: 'run_command',
          input: { CommandLine: 'npm run lint' },
          output: 'ESLint error: Unexpected any on line 12',
          status: 'error',
        },
        // Fix 1
        {
          stepIndex: 1,
          tool: 'replace_file_content',
          input: { TargetFile: 'types.ts' },
          output: 'fixed any type',
          status: 'success',
        },
        {
          stepIndex: 2,
          tool: 'run_command',
          input: { CommandLine: 'npm run lint' },
          output: 'Lint clean',
          status: 'success',
        },
        // Failure 2
        {
          stepIndex: 3,
          tool: 'run_command',
          input: { CommandLine: 'npm test' },
          output: 'FAIL src/calc.test.ts: AssertionError: expected 4 to equal 5',
          status: 'error',
        },
        // Fix 2
        {
          stepIndex: 4,
          tool: 'replace_file_content',
          input: { TargetFile: 'calc.ts' },
          output: 'fixed calculation',
          status: 'success',
        },
        {
          stepIndex: 5,
          tool: 'run_command',
          input: { CommandLine: 'npm test' },
          output: 'All tests passed',
          status: 'success',
        },
      ];

      const pairs = TranscriptParser.extractFailureRemediationPairs(steps);

      expect(pairs).toHaveLength(2);
      expect(pairs[0].failureStep?.stepIndex).toBe(0);
      expect(pairs[0].errorSummary).toContain('Unexpected any');
      expect(pairs[0].resolutionSteps.map(s => s.stepIndex)).toEqual([1, 2]);

      expect(pairs[1].failureStep?.stepIndex).toBe(3);
      expect(pairs[1].errorSummary).toContain('expected 4 to equal 5');
      expect(pairs[1].resolutionSteps.map(s => s.stepIndex)).toEqual([4, 5]);
    });

    it('returns empty array when there are no error steps', () => {
      const steps: ExecutionStep[] = [
        {
          stepIndex: 0,
          tool: 'view_file',
          input: {},
          output: 'code',
          status: 'success',
        },
        {
          stepIndex: 1,
          tool: 'run_command',
          input: {},
          output: 'pass',
          status: 'success',
        },
      ];

      const pairs = TranscriptParser.extractFailureRemediationPairs(steps);
      expect(pairs).toEqual([]);
    });

    it('returns empty array if an error step has no subsequent resolution steps', () => {
      const steps: ExecutionStep[] = [
        {
          stepIndex: 0,
          tool: 'run_command',
          input: {},
          output: 'FAIL',
          status: 'error',
        },
      ];

      const pairs = TranscriptParser.extractFailureRemediationPairs(steps);
      expect(pairs).toEqual([]);
    });
  });
});
