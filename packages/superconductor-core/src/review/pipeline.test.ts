import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ReviewFindingsPipeline,
  reviewFindingsPipeline,
  extractFencedBlock,
  aggregateFindings,
  type ReviewFinding,
  type AggregatedFindingsResult,
  type SeverityBreakdown,
  calculateSeverityBreakdown,
} from './pipeline.js';
import * as reviewBarrel from './index.js';
import * as coreBarrel from '../index.js';

describe('ReviewFindingsPipeline', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('extractFencedBlock', () => {
    it('should extract review-findings block with json: prefix and normalize severity/category', () => {
      const text = `
Header comment.
\`\`\`json:review-findings
[
  {
    "finding_id": "F1",
    "reviewer_id": "rev1",
    "file": "src/auth.ts",
    "line_range": "L10-L20",
    "severity": "CRITICAL",
    "category": "SECURITY",
    "description": "SQL Injection",
    "recommendation": "Use parameterised queries",
    "is_security_critical": true
  },
  {
    "finding_id": "F2",
    "reviewer_id": "rev1",
    "file": "src/style.ts",
    "line_range": "L1-L5",
    "severity": "INVALID_SEV",
    "category": "INVALID_CAT",
    "description": "Unknown formatting",
    "recommendation": "Format code",
    "is_security_critical": false
  }
]
\`\`\`
Footer comment.
`;
      const result = ReviewFindingsPipeline.extractFencedBlock<ReviewFinding[]>(text, 'review-findings');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0].severity).toBe('critical');
      expect(result![0].category).toBe('security');
      // Invalid severity and category should fallback to defaults
      expect(result![1].severity).toBe('medium');
      expect(result![1].category).toBe('correctness');
    });

    it('should extract review-findings without json: prefix', () => {
      const text = `
\`\`\`review-findings
[
  {
    "finding_id": "F1",
    "file": "src/index.ts",
    "severity": "high",
    "category": "correctness"
  }
]
\`\`\`
`;
      const result = ReviewFindingsPipeline.extractFencedBlock<any[]>(text, 'review-findings');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].finding_id).toBe('F1');
    });

    it('should extract coverage-manifest block and normalize examined/skimmed arrays', () => {
      const text = `
\`\`\`coverage-manifest
{
  "reviewer_id": "correctness-reviewer"
}
\`\`\`
`;
      const result = ReviewFindingsPipeline.extractFencedBlock<any>(text, 'coverage-manifest');
      expect(result).toEqual({
        reviewer_id: 'correctness-reviewer',
        examined: [],
        skimmed: [],
        not_examined: []
      });
    });

    it('should extract standard json block', () => {
      const text = `
Here is general JSON output:
\`\`\`json
{
  "metrics": { "coverage": 95.5 },
  "valid": true
}
\`\`\`
`;
      const result = ReviewFindingsPipeline.extractFencedBlock<{ metrics: { coverage: number }; valid: boolean }>(
        text,
        'json'
      );
      expect(result).not.toBeNull();
      expect(result?.valid).toBe(true);
      expect(result?.metrics.coverage).toBe(95.5);
    });

    it('should handle Windows CRLF line endings', () => {
      const crlfText = "```json:review-findings\r\n[\r\n  {\r\n    \"finding_id\": \"CRLF-1\",\r\n    \"severity\": \"low\"\r\n  }\r\n]\r\n```";
      const result = ReviewFindingsPipeline.extractFencedBlock<any[]>(crlfText, 'review-findings');
      expect(result).not.toBeNull();
      expect(result?.[0].finding_id).toBe('CRLF-1');
    });

    it('should return null on invalid JSON or malformed content', () => {
      expect(ReviewFindingsPipeline.extractFencedBlock('', 'review-findings')).toBeNull();
      expect(ReviewFindingsPipeline.extractFencedBlock('No code blocks here', 'review-findings')).toBeNull();
      expect(ReviewFindingsPipeline.extractFencedBlock('```review-findings\n[ invalid json \n```', 'review-findings')).toBeNull();
      expect(ReviewFindingsPipeline.extractFencedBlock('```review-findings\n"not an array"\n```', 'review-findings')).toBeNull();
    });

    it('should filter out primitive strings, nulls, booleans, and malformed non-object items in review-findings', () => {
      const text = `
\`\`\`review-findings
[
  "just a string",
  12345,
  null,
  true,
  false,
  ["nested", "array"],
  {
    "finding_id": "VALID-1",
    "severity": "high",
    "category": "correctness",
    "description": "Valid finding"
  },
  null
]
\`\`\`
`;
      const result = ReviewFindingsPipeline.extractFencedBlock<ReviewFinding[]>(text, 'review-findings');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].finding_id).toBe('VALID-1');
      expect(result![0].severity).toBe('high');
    });

    it('should return null when blockIdentifier is not found', () => {
      const text = `
\`\`\`coverage-manifest
{ "reviewer_id": "test" }
\`\`\`
`;
      expect(ReviewFindingsPipeline.extractFencedBlock(text, 'review-findings')).toBeNull();
    });
  });

  describe('parseReviewText', () => {
    it('should extract findings from review-findings block', () => {
      const text = `
\`\`\`json:review-findings
[
  {
    "finding_id": "F-PARSED-1",
    "file": "src/logic.ts",
    "line_range": "L10-L15",
    "severity": "high",
    "category": "correctness",
    "description": "Logic flaw",
    "recommendation": "Correct condition",
    "is_security_critical": false
  }
]
\`\`\`
`;
      const findings = ReviewFindingsPipeline.parseReviewText(text, 'reviewer-1');
      expect(findings).toHaveLength(1);
      expect(findings[0].finding_id).toBe('F-PARSED-1');
      expect(findings[0].reviewer_id).toBe('reviewer-1');
      expect(findings[0].file).toBe('src/logic.ts');
    });

    it('should fallback to standard json block if it contains findings', () => {
      const text = `
Reviewer analysis:
\`\`\`json
[
  {
    "finding_id": "F-JSON-1",
    "file": "src/api.ts",
    "severity": "critical",
    "category": "security",
    "description": "Auth bypass"
  }
]
\`\`\`
`;
      const findings = ReviewFindingsPipeline.parseReviewText(text, 'sec-reviewer');
      expect(findings).toHaveLength(1);
      expect(findings[0].finding_id).toBe('F-JSON-1');
      expect(findings[0].reviewer_id).toBe('sec-reviewer');
    });

    it('should fallback to Tier 3 unstructured finding when no fenced JSON is present', () => {
      const text = 'The code looks mostly fine, but please make sure to double check input sanitation on line 42.';
      const findings = ReviewFindingsPipeline.parseReviewText(text, 'rev-unstructured');
      expect(findings).toHaveLength(1);
      expect(findings[0].finding_id).toBe('UNSTRUCTURED-rev-unstructured');
      expect(findings[0].reviewer_id).toBe('rev-unstructured');
      expect(findings[0].file).toBe('unknown');
      expect(findings[0].line_range).toBe('all');
      expect(findings[0].severity).toBe('medium');
    });

    it('should return empty array for empty or whitespace-only text', () => {
      expect(ReviewFindingsPipeline.parseReviewText('', 'rev-1')).toEqual([]);
      expect(ReviewFindingsPipeline.parseReviewText('   \n\t  ', 'rev-1')).toEqual([]);
    });

    it('should throw TypeError when reviewerId is invalid', () => {
      expect(() => ReviewFindingsPipeline.parseReviewText('some text', '')).toThrow(TypeError);
      expect(() => ReviewFindingsPipeline.parseReviewText('some text', null as unknown as string)).toThrow(TypeError);
    });
  });

  describe('aggregateFindings and severity breakdown', () => {
    it('should aggregate findings and compute correct severity breakdown across all levels', () => {
      const rawText1 = `
\`\`\`review-findings
[
  {
    "finding_id": "F-CRIT",
    "reviewer_id": "r1",
    "file": "src/security.ts",
    "line_range": "L1-L10",
    "severity": "critical",
    "category": "security",
    "description": "RCE",
    "recommendation": "Patch",
    "is_security_critical": true
  },
  {
    "finding_id": "F-HIGH",
    "reviewer_id": "r1",
    "file": "src/perf.ts",
    "line_range": "L20-L30",
    "severity": "high",
    "category": "correctness",
    "description": "Leak",
    "recommendation": "Fix",
    "is_security_critical": false
  }
]
\`\`\`
`;
      const rawText2 = `
\`\`\`review-findings
[
  {
    "finding_id": "F-MED",
    "reviewer_id": "r2",
    "file": "src/ui.ts",
    "line_range": "L5-L15",
    "severity": "medium",
    "category": "architecture",
    "description": "Refactor component",
    "recommendation": "Extract hook",
    "is_security_critical": false
  },
  {
    "finding_id": "F-LOW",
    "reviewer_id": "r2",
    "file": "src/types.ts",
    "line_range": "L50-L60",
    "severity": "low",
    "category": "style",
    "description": "Naming convention",
    "recommendation": "Rename",
    "is_security_critical": false
  },
  {
    "finding_id": "F-ADV",
    "reviewer_id": "r2",
    "file": "src/docs.ts",
    "line_range": "L100-L110",
    "severity": "advisory",
    "category": "style",
    "description": "Missing comment",
    "recommendation": "Add comment",
    "is_security_critical": false
  }
]
\`\`\`
`;
      const result: AggregatedFindingsResult = ReviewFindingsPipeline.aggregate([
        { reviewer_id: 'r1', raw_text: rawText1 },
        { reviewer_id: 'r2', raw_text: rawText2 }
      ]);

      expect(result.total).toBe(5);
      expect(result.findings).toHaveLength(5);
      expect(result.severityBreakdown).toEqual({
        critical: 1,
        high: 1,
        medium: 1,
        low: 1,
        advisory: 1
      });
      expect(result.severity_breakdown).toEqual(result.severityBreakdown);
    });

    it('should deduplicate close line ranges from multiple reviewers and merge agreement counts', () => {
      const rev1Text = `
\`\`\`review-findings
[
  {
    "finding_id": "F1",
    "reviewer_id": "rev1",
    "file": "src/core.ts",
    "line_range": "L10-L20",
    "severity": "high",
    "category": "correctness",
    "description": "Off by one error",
    "recommendation": "Adjust index",
    "is_security_critical": false
  }
]
\`\`\`
`;
      const rev2Text = `
\`\`\`review-findings
[
  {
    "finding_id": "F2",
    "reviewer_id": "rev2",
    "file": "src/core.ts",
    "line_range": "l12-l19",
    "severity": "high",
    "category": "security",
    "description": "Off by one boundary leak",
    "recommendation": "Fix bounds",
    "is_security_critical": true
  }
]
\`\`\`
`;
      const result = ReviewFindingsPipeline.aggregate([
        { reviewer_id: 'rev1', raw_text: rev1Text },
        { reviewer_id: 'rev2', raw_text: rev2Text }
      ]);

      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(1);
      const merged = result.findings[0];
      expect(merged.file).toBe('src/core.ts');
      expect(merged.agreement_count).toBe(2);
      expect(merged.reviewer_ids).toEqual(['rev1', 'rev2']);
      expect(merged.is_security_critical).toBe(true);
      expect(merged.categories).toContain('correctness');
      expect(merged.categories).toContain('security');
      expect(result.severityBreakdown.high).toBe(1);
      expect(result.severityBreakdown.critical).toBe(0);
    });

    it('should handle Tier 2 disk artifacts when raw text has no findings', () => {
      const diskFinding: ReviewFinding = {
        finding_id: 'F-FROM-DISK',
        reviewer_id: 'rev-disk',
        file: 'src/disk-module.ts',
        line_range: 'L1-L10',
        severity: 'high',
        category: 'correctness',
        description: 'Disk issue',
        recommendation: 'Fix disk issue',
        is_security_critical: false
      };

      fs.writeFileSync(
        path.join(tmpDir, 'rev-disk-findings.json'),
        JSON.stringify([diskFinding]),
        'utf-8'
      );

      const result = ReviewFindingsPipeline.aggregate(
        [{ reviewer_id: 'rev-disk', raw_text: 'No findings block here' }],
        tmpDir
      );

      expect(result.total).toBe(1);
      expect(result.findings[0].finding_id).toBe('F-FROM-DISK');
      expect(result.severityBreakdown.high).toBe(1);
    });

    it('should handle empty or non-array items input gracefully', () => {
      const emptyResult = ReviewFindingsPipeline.aggregate([]);
      expect(emptyResult.total).toBe(0);
      expect(emptyResult.findings).toEqual([]);
      expect(emptyResult.severityBreakdown).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        advisory: 0
      });

      const invalidResult = ReviewFindingsPipeline.aggregate(null as unknown as any[]);
      expect(invalidResult.total).toBe(0);
      expect(invalidResult.findings).toEqual([]);
    });

    it('should aggregate raw text using standard ```json code fence without degrading to UNSTRUCTURED stub', () => {
      const rawText = `
Here is reviewer feedback:
\`\`\`json
[
  {
    "finding_id": "SEC-JSON-101",
    "reviewer_id": "sec-rev",
    "file": "src/auth/jwt.ts",
    "line_range": "L45-L55",
    "severity": "critical",
    "category": "security",
    "description": "JWT secret is hardcoded",
    "recommendation": "Use environment variable",
    "is_security_critical": true
  }
]
\`\`\`
`;
      const result = ReviewFindingsPipeline.aggregate([
        { reviewer_id: 'sec-rev', raw_text: rawText }
      ]);

      expect(result.total).toBe(1);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].finding_id).toBe('SEC-JSON-101');
      expect(result.findings[0].finding_id).not.toContain('UNSTRUCTURED');
      expect(result.findings[0].severity).toBe('critical');
      expect(result.severityBreakdown.critical).toBe(1);
      expect(result.severityBreakdown.medium).toBe(0);
    });
  });

  describe('class instance and singleton methods', () => {
    it('instance methods should behave identically to static methods', () => {
      const pipeline = new ReviewFindingsPipeline();
      const text = `
\`\`\`json
{ "key": "value" }
\`\`\`
`;
      expect(pipeline.extractFencedBlock(text, 'json')).toEqual({ key: 'value' });

      const parsed = pipeline.parseReviewText('unstructured', 'rev-inst');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].finding_id).toBe('UNSTRUCTURED-rev-inst');

      const agg = pipeline.aggregateFindings([]);
      expect(agg.total).toBe(0);

      const aggAlias = pipeline.aggregate([]);
      expect(aggAlias.total).toBe(0);
    });

    it('singleton instance reviewFindingsPipeline should be exported and functional', () => {
      expect(reviewFindingsPipeline).toBeInstanceOf(ReviewFindingsPipeline);
      expect(reviewFindingsPipeline.extractFencedBlock('```json\n{"a":1}\n```', 'json')).toEqual({ a: 1 });
    });
  });

  describe('backward compatibility', () => {
    it('standalone extractFencedBlock function signature and behavior', () => {
      const text = `
\`\`\`json:review-findings
[
  {
    "finding_id": "F-COMPAT",
    "severity": "CRITICAL",
    "category": "SECURITY",
    "file": "src/compat.ts"
  }
]
\`\`\`
`;
      const parsed = extractFencedBlock<ReviewFinding[]>(text, 'review-findings');
      expect(parsed).not.toBeNull();
      expect(parsed![0].finding_id).toBe('F-COMPAT');
      expect(parsed![0].severity).toBe('critical');
    });

    it('standalone aggregateFindings function signature returns ReviewFinding array', () => {
      const rawText = `
\`\`\`review-findings
[
  {
    "finding_id": "F-ARRAY",
    "reviewer_id": "r1",
    "file": "src/compat.ts",
    "line_range": "L10-L20",
    "severity": "high",
    "category": "correctness",
    "description": "Array check",
    "recommendation": "Ensure array",
    "is_security_critical": false
  }
]
\`\`\`
`;
      const result: ReviewFinding[] = aggregateFindings([{ reviewer_id: 'r1', raw_text: rawText }]);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].finding_id).toBe('F-ARRAY');
    });

    it('should be properly re-exported from review barrel (src/review/index.ts)', () => {
      expect(reviewBarrel.ReviewFindingsPipeline).toBeDefined();
      expect(reviewBarrel.extractFencedBlock).toBeDefined();
      expect(reviewBarrel.aggregateFindings).toBeDefined();
    });

    it('should be properly re-exported from core barrel (src/index.ts)', () => {
      expect(coreBarrel.ReviewFindingsPipeline).toBeDefined();
      expect(coreBarrel.extractFencedBlock).toBeDefined();
      expect(coreBarrel.aggregateFindings).toBeDefined();
    });
  });

  describe('calculateSeverityBreakdown helper', () => {
    it('correctly maps missing or unknown severities to medium', () => {
      const findings: ReviewFinding[] = [
        {
          finding_id: 'F1',
          reviewer_id: 'r1',
          file: 'a.ts',
          line_range: 'L1',
          severity: 'unknown-sev' as any,
          category: 'correctness',
          description: 'd',
          recommendation: 'r',
          is_security_critical: false
        }
      ];
      const breakdown = calculateSeverityBreakdown(findings);
      expect(breakdown.medium).toBe(1);
      expect(breakdown.critical).toBe(0);
    });

    it('should handle numeric, boolean, null, undefined, and prototype-shadowing severities without crashing or polluting prototype', () => {
      const maliciousFindings: any[] = [
        { finding_id: 'F1', severity: 1 },
        { finding_id: 'F2', severity: 42 },
        { finding_id: 'F3', severity: true },
        { finding_id: 'F4', severity: false },
        { finding_id: 'F5', severity: null },
        { finding_id: 'F6', severity: undefined },
        { finding_id: 'F7', severity: 'constructor' },
        { finding_id: 'F8', severity: '__proto__' },
        { finding_id: 'F9', severity: 'toString' },
        { finding_id: 'F10', severity: 'HIGH' },
        { finding_id: 'F11', severity: 'critical' },
      ];

      const breakdown = calculateSeverityBreakdown(maliciousFindings);

      expect(breakdown.critical).toBe(1);
      expect(breakdown.high).toBe(1);
      expect(breakdown.medium).toBe(9);
      expect(breakdown.low).toBe(0);
      expect(breakdown.advisory).toBe(0);
      expect(Object.prototype.hasOwnProperty.call(breakdown, 'constructor')).toBe(false);
      expect(typeof (breakdown as any).constructor).toBe('function');
      expect((breakdown as any).constructor).toBe(Object);
    });
  });
});
