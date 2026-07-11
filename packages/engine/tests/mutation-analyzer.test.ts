import { describe, it, expect, vi } from 'vitest';
import { MutationAnalyzer } from '../src/verification/mutation-analyzer.js';

describe('Mutation Analyzer', () => {
  const mockStrykerOutput = {
    files: {
      'src/my-file.ts': {
        mutants: [
          {
            id: '1',
            mutatorName: 'BinaryOperator',
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } },
            replacement: '-',
            status: 'Killed'
          },
          {
            id: '2',
            mutatorName: 'StringLiteral',
            location: { start: { line: 2, column: 1 }, end: { line: 2, column: 5 } },
            replacement: '""',
            status: 'Survived'
          }
        ]
      }
    }
  };

  it('Compute mutation score from Stryker JSON output', async () => {
    const analyzer = new MutationAnalyzer(80); // 80% threshold (meaning <20% survived)
    
    // Mock the actual execution to return our JSON
    analyzer.runStryker = vi.fn().mockResolvedValue(mockStrykerOutput);

    const report = await analyzer.analyzeFile('src/my-file.ts');

    expect(report.score.total).toBe(2);
    expect(report.score.killed).toBe(1);
    expect(report.score.survived).toBe(1);
    expect(report.score.score).toBe(50); // 1 / 2 * 100
    expect(report.survivingMutants.length).toBe(1);
    expect(report.survivingMutants[0].mutatorName).toBe('StringLiteral');
  });

  it('Reject test suite with mutation score below threshold', async () => {
    const analyzer = new MutationAnalyzer(80);
    analyzer.runStryker = vi.fn().mockResolvedValue(mockStrykerOutput);

    const result = await analyzer.verifyThreshold('src/my-file.ts');
    
    expect(result.passed).toBe(false);
    expect(result.report.score.score).toBe(50); // 50 < 80, so it fails
    expect(result.feedback).toContain('Mutation score 50% is below the required threshold of 80%');
  });

  it('Accept test suite with mutation score above threshold', async () => {
    const passingOutput = {
      files: {
        'src/my-file.ts': {
          mutants: [
            { id: '1', status: 'Killed' },
            { id: '2', status: 'Killed' }
          ]
        }
      }
    };

    const analyzer = new MutationAnalyzer(80);
    analyzer.runStryker = vi.fn().mockResolvedValue(passingOutput);

    const result = await analyzer.verifyThreshold('src/my-file.ts');
    
    expect(result.passed).toBe(true);
    expect(result.report.score.score).toBe(100);
  });
});
