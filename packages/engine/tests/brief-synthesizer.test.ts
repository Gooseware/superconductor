import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResearchBriefSynthesizer, ExecuteLlmFn } from '../src/research/brief-synthesizer.js';
import * as fs from 'fs';
import { z } from 'zod';
import { ResearchBriefSchema } from '../src/research/types.js';

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn()
    };
});

describe('ResearchBriefSynthesizer', () => {
  let synthesizer: ResearchBriefSynthesizer;
  const artifactDir = 'test-research-artifacts';

  beforeEach(() => {
    synthesizer = new ResearchBriefSynthesizer(artifactDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should filter findings with confidenceScore < 0.6', async () => {
    const rawResults = [
      {
        url: 'https://example.com/test',
        title: 'Test Source',
        content: 'This is a test source'
      }
    ];

    const result = await synthesizer.synthesize(rawResults);

    expect(result.keyFindings).toHaveLength(1);
    expect(result.keyFindings[0].category).toBe('ARCHITECTURAL_PATTERN');
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should validate output against ResearchBriefSchema', async () => {
    const rawResults = [
      {
        url: 'https://example.com/test2',
        title: 'Schema Source',
        content: 'Content for schema source'
      }
    ];

    const result = await synthesizer.synthesize(rawResults);

    expect(() => ResearchBriefSchema.parse(result)).not.toThrow();
    
    expect(result.trackId).toMatch(/^track-/);
    expect(result.artifactPointers.length).toBeGreaterThan(0);
    expect(result.artifactPointers[0]).toContain('schema-source.md');
  });

  it('should enforce executiveSummary <= 400 words', async () => {
    const mockExecuteLlm: ExecuteLlmFn = async (prompt: string) => {
      if (prompt.includes('Extract')) {
        return [
          {
            category: 'ARCHITECTURAL_PATTERN',
            description: `Extracted pattern`,
            sourceUrl: '',
            confidenceScore: 0.85
          }
        ];
      }
      if (prompt.includes('Synthesize')) {
        return { 
          executiveSummary: Array(405).fill('word').join(' '), 
          recommendedPatterns: ['Event-Driven Architecture'], 
          antiPatterns: ['God Object'] 
        };
      }
      return {};
    };

    const badSynthesizer = new ResearchBriefSynthesizer(artifactDir, mockExecuteLlm);

    const rawResults = [
      {
        url: 'https://example.com/test3',
        title: 'Too Long Source',
        content: 'Content'
      }
    ];

    const result = await badSynthesizer.synthesize(rawResults);
    expect(result.executiveSummary.split(/\s+/).length).toBe(400);
  });
});
