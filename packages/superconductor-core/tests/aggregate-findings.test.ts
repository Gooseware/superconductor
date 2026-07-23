import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { aggregateFindings, ReviewFinding } from '../src/review/aggregate-findings.js';

describe('aggregateFindings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-findings-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should parse L-prefix and l-prefix line ranges and deduplicate close line ranges', () => {
    const rawText1 = `
\`\`\`review-findings
[
  {
    "finding_id": "F1",
    "reviewer_id": "rev1",
    "file": "src/app.ts",
    "line_range": "L10-L15",
    "severity": "high",
    "category": "correctness",
    "description": "Bug 1",
    "recommendation": "Fix 1",
    "is_security_critical": false
  }
]
\`\`\`
`;

    const rawText2 = `
\`\`\`review-findings
[
  {
    "finding_id": "F2",
    "reviewer_id": "rev2",
    "file": "src/app.ts",
    "line_range": "l12-l18",
    "severity": "medium",
    "category": "correctness",
    "description": "Bug 1 duplicate",
    "recommendation": "Fix 1 duplicate",
    "is_security_critical": false
  }
]
\`\`\`
`;

    const result = aggregateFindings([
      { reviewer_id: 'rev1', raw_text: rawText1 },
      { reviewer_id: 'rev2', raw_text: rawText2 }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/app.ts');
    expect(result[0].agreement_count).toBe(2);
    expect(result[0].reviewer_ids).toEqual(['rev1', 'rev2']);
  });

  it('should enforce schema guard rejecting objects missing required string fields', () => {
    const invalidRawText = `
\`\`\`review-findings
[
  {
    "finding_id": "F1",
    "severity": "high"
  },
  {
    "finding_id": "F2",
    "severity": "high",
    "category": "security",
    "file": "src/index.ts",
    "description": "Valid finding",
    "recommendation": "Fix it",
    "line_range": "10-20",
    "is_security_critical": true
  }
]
\`\`\`
`;

    const result = aggregateFindings([
      { reviewer_id: 'rev1', raw_text: invalidRawText }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].finding_id).toBe('F2');
    expect(result[0].file).toBe('src/index.ts');
  });

  it('should fall back to Tier 2 disk artifact if Tier 1 fails or is missing', () => {
    const artifactPath = path.join(tmpDir, 'rev1-findings.json');
    const validFinding: ReviewFinding = {
      finding_id: 'F-DISK',
      reviewer_id: 'rev1',
      file: 'src/disk.ts',
      line_range: '5-10',
      severity: 'low',
      category: 'style',
      description: 'Disk finding',
      recommendation: 'Fix disk',
      is_security_critical: false
    };
    fs.writeFileSync(artifactPath, JSON.stringify([validFinding]), 'utf-8');

    const result = aggregateFindings(
      [{ reviewer_id: 'rev1', raw_text: 'No fenced block here' }],
      tmpDir
    );

    expect(result).toHaveLength(1);
    expect(result[0].finding_id).toBe('F-DISK');
  });

  it('should fall back to Tier 3 unstructured finding when Tier 1 & 2 yield no valid findings', () => {
    const result = aggregateFindings([
      { reviewer_id: 'rev1', raw_text: 'Unstructured reviewer message without findings' }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].finding_id).toBe('UNSTRUCTURED-rev1');
    expect(result[0].file).toBe('unknown');
    expect(result[0].line_range).toBe('all');
  });
});
