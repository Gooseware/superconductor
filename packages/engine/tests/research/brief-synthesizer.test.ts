import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from 'fs';
import * as path from 'path';
import { ResearchBriefSynthesizer } from '../../src/research/brief-synthesizer.js';
import { IResearchSource } from '../../src/research/types.js';

describe('ResearchBriefSynthesizer', () => {
  const testOutputDir = path.join(__dirname, '.test_research_output');
  let synthesizer: ResearchBriefSynthesizer;

  beforeEach(() => {
    synthesizer = new ResearchBriefSynthesizer(testOutputDir);
  });

  afterEach(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  it('filters out findings with confidenceScore < 0.6', async () => {
    const mockResults: IResearchSource[] = [
      { url: 'https://example.com/1', title: 'Example 1' }
    ];

    synthesizer.llmMapSource = async (source) => {
      return [
        { category: 'OSS_DISCOVERY', description: 'Good finding', confidenceScore: 0.8 },
        { category: 'ARCHITECTURAL_PATTERN', description: 'Bad finding', confidenceScore: 0.5 },
      ];
    };

    const brief = await synthesizer.synthesize(mockResults);

    expect(brief.keyFindings).toHaveLength(1);
    expect(brief.keyFindings[0].description).toBe('Good finding');
    expect((brief.keyFindings[0] as any).confidenceScore).toBeUndefined();
  });

  it('validates output against ResearchBriefSchema', async () => {
    const mockResults: IResearchSource[] = [];
    
    synthesizer.llmReduceFindings = async () => {
      return {
        executiveSummary: "Mock",
        recommendedPatterns: null as any,
        antiPatterns: []
      };
    };

    await expect(synthesizer.synthesize(mockResults)).rejects.toThrow();
  });

  it('ensures executiveSummary is <= 400 words', async () => {
    const mockResults: IResearchSource[] = [];
    
    const longSummary = Array(401).fill('word').join(' ');

    synthesizer.llmReduceFindings = async () => {
      return {
        executiveSummary: longSummary,
        recommendedPatterns: [],
        antiPatterns: []
      };
    };

    await expect(synthesizer.synthesize(mockResults)).rejects.toThrow(/400 words|invalid_type/i);
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
});
