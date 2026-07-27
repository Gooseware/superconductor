import { describe, it, expect } from 'vitest';
import { extractFencedBlock } from '../src/review/extract-fenced-block.js';

describe('extractFencedBlock', () => {
  it('should extract JSON block with identifier e.g. json:review-findings', () => {
    const text = `
Here is my review output:

\`\`\`json:review-findings
[
  {
    "finding_id": "F1",
    "severity": "CRITICAL",
    "category": "SECURITY",
    "file": "src/auth.ts"
  }
]
\`\`\`

End of output.
`;

    const parsed = extractFencedBlock<any[]>(text, 'review-findings');
    expect(parsed).toEqual([
      {
        finding_id: 'F1',
        severity: 'critical',
        category: 'security',
        file: 'src/auth.ts'
      }
    ]);
  });

  it('should normalize coverage-manifest block fields into arrays', () => {
    const text = `
\`\`\`coverage-manifest
{
  "reviewer_id": "rev1"
}
\`\`\`
`;

    const parsed = extractFencedBlock<any>(text, 'coverage-manifest');
    expect(parsed).toEqual({
      reviewer_id: 'rev1',
      examined: [],
      skimmed: [],
      not_examined: []
    });
  });

  it('should return null when block is missing or JSON is invalid', () => {
    expect(extractFencedBlock('', 'review-findings')).toBeNull();
    expect(extractFencedBlock('No code blocks here', 'review-findings')).toBeNull();

    const invalidJsonText = `
\`\`\`review-findings
[ invalid json content
\`\`\`
`;
    expect(extractFencedBlock(invalidJsonText, 'review-findings')).toBeNull();
  });
});
