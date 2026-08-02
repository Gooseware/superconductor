import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from 'fs';
import * as path from 'path';
import { ResearchBriefSynthesizer } from '../../src/research/brief-synthesizer.js';
import { IResearchSource } from '../../src/research/types.js';

describe('ResearchBriefSynthesizer', () => {
  const testOutputDir = '.test_research_output';
  let synthesizer: ResearchBriefSynthesizer;
  let mockExecuteLlm: any;

  beforeEach(() => {
    mockExecuteLlm = vi.fn().mockImplementation(async (prompt) => {
      if (prompt.includes('Extract structured findings')) {
        return [
          { category: 'OSS_DISCOVERY', description: 'Good finding', confidenceScore: 0.8 },
          { category: 'ARCHITECTURAL_PATTERN', description: 'Bad finding', confidenceScore: 0.5 },
        ];
      }
      return {
        executiveSummary: "Mock executive summary",
        recommendedPatterns: [],
        antiPatterns: []
      };
    });
    synthesizer = new ResearchBriefSynthesizer(testOutputDir, mockExecuteLlm);
  });

  afterEach(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  it('sanitizes outputDir in constructor and throws on path traversal', () => {
    expect(() => new ResearchBriefSynthesizer('../etc/passwd')).toThrow('Path traversal detected');
  });

  it('passes actual queriesExecuted and skillsAlreadyInstalled into the synthesized brief', async () => {
    const mockResults: IResearchSource[] = [];
    const queries = ['query: react 19 features', 'query: async server components'];
    const skills = ['react-skill', 'typescript-skill'];

    const brief = await synthesizer.synthesize(mockResults, 'track-100', queries, skills);

    expect(brief.queriesExecuted).toEqual(queries);
    expect(brief.skillsAlreadyInstalled).toEqual(skills);
  });

  it('filters out findings with confidenceScore < 0.6', async () => {
    const mockResults: IResearchSource[] = [
      { url: 'https://example.com/1', title: 'Example 1' }
    ];

    const brief = await synthesizer.synthesize(mockResults);

    expect(brief.keyFindings).toHaveLength(1);
    expect(brief.keyFindings[0].description).toBe('Good finding');
    expect((brief.keyFindings[0] as any).confidenceScore).toBeUndefined();
  });

  it('validates output against ResearchBriefSchema', async () => {
    const mockResults: IResearchSource[] = [];
    
    mockExecuteLlm.mockImplementation(async () => {
      return {
        executiveSummary: "Mock",
        recommendedPatterns: null, // this will fail validation
        antiPatterns: []
      };
    });

    await expect(synthesizer.synthesize(mockResults)).rejects.toThrow();
  });

  it('ensures executiveSummary is truncated to <= 400 words', async () => {
    const mockResults: IResearchSource[] = [];
    
    // Generate a string with 410 words
    const longSummary = Array(410).fill('word').join(' ');

    mockExecuteLlm.mockImplementation(async (prompt) => {
      if (prompt.includes('Synthesize')) {
        return {
          executiveSummary: longSummary,
          recommendedPatterns: [],
          antiPatterns: []
        };
      }
      return [];
    });

    const brief = await synthesizer.synthesize(mockResults);
    const words = brief.executiveSummary.trim().split(/\s+/);
    
    // Test passes instead of rejecting, because it was successfully truncated
    expect(words.length).toBeLessThanOrEqual(400);
    expect(words.length).toBe(400); // Because it sliced to 400
  });

  it('writes chunked artifact files saved to research/<source_slug>.md', async () => {
    const mockResults: IResearchSource[] = [
      { url: 'https://example.com/test-article', title: 'Test Article' }
    ];

    await synthesizer.synthesize(mockResults);

    const expectedFile = path.join(testOutputDir, 'test-article.md');
    expect(fs.existsSync(expectedFile)).toBe(true);
    const content = fs.readFileSync(expectedFile, 'utf8');
    expect(content).toContain('Test Article');
  });

  it('accepts trackId, queriesExecuted, and skillsAlreadyInstalled in synthesize()', async () => {
    const mockResults: IResearchSource[] = [
      { url: 'https://example.com/1', title: 'Example 1' }
    ];

    const brief = await synthesizer.synthesize(
      mockResults,
      'custom-track-123',
      ['queryA', 'queryB'],
      ['git', 'npm']
    );

    expect(brief.trackId).toBe('custom-track-123');
    expect(brief.queriesExecuted).toEqual(['queryA', 'queryB']);
    expect(brief.skillsAlreadyInstalled).toEqual(['git', 'npm']);
  });

  it('strips XML tags <untrusted_research_results> in generateSlug', async () => {
    const mockResults: IResearchSource[] = [
      { 
        url: '<untrusted_research_results>https://example.com/wrapped-article</untrusted_research_results>', 
        title: '<untrusted_research_results>Wrapped Article</untrusted_research_results>' 
      }
    ];

    const brief = await synthesizer.synthesize(mockResults);

    const expectedFile = path.join(testOutputDir, 'wrapped-article.md');
    expect(fs.existsSync(expectedFile)).toBe(true);
    expect(brief.artifactPointers[0]).not.toContain('untrusted_research_results');
    expect(brief.artifactPointers[0]).toContain('wrapped-article.md');
  });
});
