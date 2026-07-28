import { describe, it, expect } from 'vitest';
import { ResearchBriefSchema } from '../../src/research/types';

describe('ResearchBriefSchema', () => {
  const validBrief = {
    trackId: 'track-123',
    generatedAt: '2026-07-28T00:00:00.000Z',
    queriesExecuted: ['query 1', 'query 2'],
    executiveSummary: 'This is a short summary.',
    keyFindings: [
      {
        category: 'OSS_DISCOVERY',
        description: 'Found an interesting OSS library',
      },
    ],
    recommendedPatterns: ['Pattern A'],
    antiPatterns: ['AntiPattern B'],
    skillsAlreadyInstalled: ['skill-a'],
    artifactPointers: ['artifact-1'],
  };

  it('accepts a valid brief', () => {
    const result = ResearchBriefSchema.safeParse(validBrief);
    expect(result.success).toBe(true);
  });

  it('rejects a brief with malformed date', () => {
    const invalidBrief = { ...validBrief, generatedAt: 'invalid-date' };
    const result = ResearchBriefSchema.safeParse(invalidBrief);
    expect(result.success).toBe(false);
  });

  it('rejects an executive summary with more than 400 words', () => {
    const longSummary = Array(401).fill('word').join(' ');
    const invalidBrief = { ...validBrief, executiveSummary: longSummary };
    const result = ResearchBriefSchema.safeParse(invalidBrief);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Executive summary must be 400 words or less');
    }
  });

  it('rejects invalid category', () => {
    const invalidBrief = {
      ...validBrief,
      keyFindings: [
        {
          category: 'INVALID_CATEGORY',
          description: 'bad',
        },
      ],
    };
    const result = ResearchBriefSchema.safeParse(invalidBrief);
    expect(result.success).toBe(false);
  });
});
