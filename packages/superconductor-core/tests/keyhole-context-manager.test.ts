import { describe, it, expect } from 'vitest';
import { KeyholeContextManager, KeyholeFeedbackExtractor } from '../src/review/aggregate-findings.js';

describe('KeyholeContextManager', () => {
  it('should maintain backward compatibility via KeyholeFeedbackExtractor', () => {
    expect(KeyholeFeedbackExtractor).toBe(KeyholeContextManager);
    expect(typeof KeyholeFeedbackExtractor.extractPayload).toBe('function');
  });

  describe('extractReviewFeedback', () => {
    it('should extract review feedback similar to extractPayload', () => {
      const manager = new KeyholeContextManager();
      const finding: any = { line_range: 'L5-L10' };
      const fileContent = '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15';
      const workUnitSpec = 'spec';
      
      const payload = manager.extractReviewFeedback(finding, fileContent, workUnitSpec);
      expect(payload.finding).toBe(finding);
      expect(payload.workUnitSpec).toBe(workUnitSpec);
      expect(payload.contextLines).toContain('5');
    });
  });

  describe('injectResearchContext', () => {
    it('should inject relevant domain findings and executive summary into researchContext', () => {
      const manager = new KeyholeContextManager();
      const workUnit = { domain: 'auth', researchContext: 'Original context.' };
      const brief = {
        executiveSummary: 'Auth needs to be secure.',
        keyFindings: [
          { domain: 'auth', issue: 'Missing token validation' },
          { category: 'auth', issue: 'Weak password policy' },
          { domain: 'database', issue: 'Unindexed query' } // Should be filtered out
        ]
      };

      manager.injectResearchContext(workUnit, brief);

      expect(workUnit.researchContext).toContain('Original context.');
      expect(workUnit.researchContext).toContain('Executive Summary:\nAuth needs to be secure.');
      expect(workUnit.researchContext).toContain('Domain Findings (auth):');
      expect(workUnit.researchContext).toContain('Missing token validation');
      expect(workUnit.researchContext).toContain('Weak password policy');
      expect(workUnit.researchContext).not.toContain('Unindexed query');
    });

    it('should not throw or modify if domain is not set', () => {
      const manager = new KeyholeContextManager();
      const workUnit = { researchContext: 'Original context.' };
      const brief = {
        executiveSummary: 'Auth needs to be secure.',
        keyFindings: []
      };

      manager.injectResearchContext(workUnit as any, brief);

      expect(workUnit.researchContext).toBe('Original context.');
    });

    it('should handle empty brief keyFindings gracefully', () => {
      const manager = new KeyholeContextManager();
      const workUnit = { domain: 'auth', researchContext: '' };
      const brief = {
        executiveSummary: 'Summary'
      };

      manager.injectResearchContext(workUnit, brief);

      expect(workUnit.researchContext).toContain('Executive Summary:\nSummary');
      expect(workUnit.researchContext).not.toContain('Domain Findings');
    });
  });
});
