import { describe, it, expect } from 'vitest';
import { RemediationStateObjectSchema } from './remediation-state.js';

describe('RemediationStateObject Schema', () => {
  it('should pass validation for a valid state object', () => {
    const validState = {
      findingIndex: {
        'f1': { id: 'f1', file: 'auth/jwt.ts' }
      },
      domainAssignments: {
        'security-remediator': ['f1']
      },
      retryCount: {
        'f1': 1
      },
      deepResearchResults: {
        'f1': 'Needs stronger algorithm'
      },
      fixedFindings: ['f1'],
      failedFindings: [],
      outcome: 'RESOLVED'
    };

    const result = RemediationStateObjectSchema.safeParse(validState);
    expect(result.success).toBe(true);
  });

  it('should fail validation if findingIndex is missing', () => {
    const invalidState = {
      domainAssignments: {},
      retryCount: {},
      deepResearchResults: {},
      fixedFindings: [],
      failedFindings: [],
      outcome: 'IN_PROGRESS'
    };

    const result = RemediationStateObjectSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should fail validation with invalid outcome enum value', () => {
    const invalidState = {
      findingIndex: {},
      domainAssignments: {},
      retryCount: {},
      deepResearchResults: {},
      fixedFindings: [],
      failedFindings: [],
      outcome: 'INVALID_OUTCOME'
    };

    const result = RemediationStateObjectSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should pass validation for empty arrays/objects', () => {
    const validEmptyState = {
      findingIndex: {},
      domainAssignments: {},
      retryCount: {},
      deepResearchResults: {},
      fixedFindings: [],
      failedFindings: [],
      outcome: 'IN_PROGRESS'
    };

    const result = RemediationStateObjectSchema.safeParse(validEmptyState);
    expect(result.success).toBe(true);
  });
});
