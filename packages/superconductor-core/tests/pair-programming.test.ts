import { describe, it, expect } from 'vitest';
import { runPairProgrammingLoop } from '../src/intelligence/pair-programming.js';

describe('Pair Programming Mode', () => {
  it('should PASS on the first attempt if no critical findings are returned', async () => {
    const result = await runPairProgrammingLoop({
      taskSpec: 'Test task',
      maxIterations: 2,
      onCodeIteration: async (attempt) => ({ diff: 'good diff', modifiedFiles: ['file.ts'] }),
      onReviewIteration: async () => {
        return [{
          reviewer_id: 'r1',
          raw_text: `\`\`\`review-findings\n[\n  { "finding_id": "1", "severity": "advisory", "category": "style", "file": "file.ts", "line_range": "all", "description": "d", "recommendation": "r", "is_security_critical": false }\n]\n\`\`\``
        }];
      }
    });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.gateResult.status).toBe('PASS');
  });

  it('should auto-remediate and PASS on the second attempt', async () => {
    let reviewCount = 0;
    const result = await runPairProgrammingLoop({
      taskSpec: 'Test task',
      maxIterations: 2,
      onCodeIteration: async (attempt) => ({ diff: 'diff', modifiedFiles: ['file.ts'] }),
      onReviewIteration: async () => {
        reviewCount++;
        if (reviewCount === 1) {
          return [{
            reviewer_id: 'r1',
            raw_text: `\`\`\`review-findings\n[\n  { "finding_id": "1", "severity": "critical", "category": "security", "file": "file.ts", "line_range": "all", "description": "d", "recommendation": "r", "is_security_critical": true }\n]\n\`\`\``
          }];
        }
        return [];
      }
    });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(2);
    expect(result.gateResult.status).toBe('PASS');
  });

  it('should ESCALATE if max iterations are reached with critical findings', async () => {
    const result = await runPairProgrammingLoop({
      taskSpec: 'Test task',
      maxIterations: 2,
      onCodeIteration: async (attempt) => ({ diff: 'diff', modifiedFiles: ['file.ts'] }),
      onReviewIteration: async () => {
        return [{
          reviewer_id: 'r1',
          raw_text: `\`\`\`review-findings\n[\n  { "finding_id": "1", "severity": "critical", "category": "security", "file": "file.ts", "line_range": "all", "description": "d", "recommendation": "r", "is_security_critical": true }\n]\n\`\`\``
        }];
      }
    });

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(3);
    expect(result.gateResult.status).toBe('ESCALATE');
  });
});
