import { describe, it, expect } from 'vitest';
import { KeyholeFeedbackExtractor } from '../src/review/aggregate-findings.js';
import type { ReviewFinding } from '../src/review/aggregate-findings.js';

describe('KeyholeFeedbackExtractor', () => {
    const fileContent = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join('\n');
    const workUnitSpec = "WorkUnit: Fix the bug in function X";

    it('should return finding message + ±50 lines context + original WorkUnit spec, nothing else', () => {
        const finding: ReviewFinding = {
            finding_id: '1',
            reviewer_id: 'reviewer1',
            file: 'test.ts',
            line_range: 'L100-L105',
            severity: 'high',
            category: 'correctness',
            description: 'There is a bug here',
            recommendation: 'Fix the bug',
            is_security_critical: false
        };

        const result = KeyholeFeedbackExtractor.extractPayload(finding, fileContent, workUnitSpec);

        expect(result.finding).toEqual(finding);
        expect(result.workUnitSpec).toBe(workUnitSpec);
        
        // 50 lines before 100, 50 lines after 105 -> 50 to 155
        expect(result.contextLines).toContain('Line 50');
        expect(result.contextLines).toContain('Line 155');
        
        // Shouldn't contain lines far outside the range
        expect(result.contextLines).not.toMatch(/\bLine 1\b/);
        expect(result.contextLines).not.toMatch(/\bLine 190\b/);
    });

    it('should contain NO full-file content, NO branch diffs, NO cross-domain findings', () => {
        const finding: ReviewFinding = {
            finding_id: '2',
            reviewer_id: 'reviewer1',
            file: 'test.ts',
            line_range: 'L10',
            severity: 'low',
            category: 'style',
            description: 'Format issue',
            recommendation: 'Format it',
            is_security_critical: false
        };

        const result = KeyholeFeedbackExtractor.extractPayload(finding, fileContent, workUnitSpec);
        
        // Ensure no full file content
        expect(result.contextLines.split('\n').length).toBeLessThanOrEqual(102); // 1 line + 100 context
        expect(result.fullFileContent).toBeUndefined();
        expect(result.branchDiff).toBeUndefined();
        expect(result.crossDomainFindings).toBeUndefined();
    });
});
