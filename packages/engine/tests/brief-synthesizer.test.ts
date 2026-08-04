import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ResearchBriefSynthesizer, ExecuteLlmFn } from '../src/research/brief-synthesizer.js';
import { IResearchSource, ResearchBriefSchema } from '../src/research/types.js';

describe('ResearchBriefSynthesizer', () => {
  const testOutputDir = path.join(__dirname, '.test_brief_synthesizer_output');
  let synthesizer: ResearchBriefSynthesizer;
  let mockExecuteLlm: any;

  beforeEach(() => {
    mockExecuteLlm = vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Extract structured findings')) {
        return [
          { category: 'OSS_DISCOVERY', description: 'High confidence finding', confidenceScore: 0.85 },
          { category: 'ARCHITECTURAL_PATTERN', description: 'Low confidence finding', confidenceScore: 0.4 }
        ];
      }
      if (prompt.includes('Synthesize')) {
        return {
          executiveSummary: 'This is a valid executive summary synthesized from high confidence findings.',
          recommendedPatterns: ['Microservices'],
          antiPatterns: ['Monolith']
        };
      }
      return {};
    });

    synthesizer = new ResearchBriefSynthesizer(testOutputDir, mockExecuteLlm);
  });

  afterEach(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('llmMapSource fallback chain', () => {
    it('uses source.content when available', async () => {
      const source: IResearchSource = {
        url: 'https://example.com/spec',
        title: 'Awesome Spec Title',
        content: 'Detailed content of the spec for analysis'
      };

      await synthesizer.llmMapSource(source);

      expect(mockExecuteLlm).toHaveBeenCalledTimes(1);
      const calledPrompt = mockExecuteLlm.mock.calls[0][0];
      expect(calledPrompt).toBe('Extract structured findings from: Detailed content of the spec for analysis');
    });

    it('falls back to source.title when source.content is missing', async () => {
      const source: IResearchSource = {
        url: 'https://example.com/spec',
        title: 'Awesome Spec Title'
      };

      await synthesizer.llmMapSource(source);

      expect(mockExecuteLlm).toHaveBeenCalledTimes(1);
      const calledPrompt = mockExecuteLlm.mock.calls[0][0];
      expect(calledPrompt).toBe('Extract structured findings from: Awesome Spec Title');
    });

    it('falls back to source.url when both content and title are missing', async () => {
      const source: IResearchSource = {
        url: 'https://example.com/spec'
      };

      await synthesizer.llmMapSource(source);

      expect(mockExecuteLlm).toHaveBeenCalledTimes(1);
      const calledPrompt = mockExecuteLlm.mock.calls[0][0];
      expect(calledPrompt).toBe('Extract structured findings from: https://example.com/spec');
    });
  });

  it('passes serialized findings to LLM in llmReduceFindings', async () => {
    const findings = [
      { category: 'OSS_DISCOVERY' as const, description: 'Tool A', confidenceScore: 0.9, sourceUrl: 'https://example.com' }
    ];

    await synthesizer.llmReduceFindings(findings);

    expect(mockExecuteLlm).toHaveBeenCalledTimes(1);
    const calledPrompt = mockExecuteLlm.mock.calls[0][0];
    expect(calledPrompt).toContain('Synthesize 1 findings into a brief:');
    expect(calledPrompt).toContain('"category": "OSS_DISCOVERY"');
    expect(calledPrompt).toContain('"description": "Tool A"');
  });

  it('filters out findings with confidenceScore < 0.6', async () => {
    const rawResults: IResearchSource[] = [
      { url: 'https://example.com/source1', title: 'Source 1', content: 'Content 1' }
    ];

    const brief = await synthesizer.synthesize(rawResults);

    expect(brief.keyFindings).toHaveLength(1);
    expect(brief.keyFindings[0].description).toBe('High confidence finding');
    expect((brief.keyFindings[0] as any).confidenceScore).toBeUndefined();
  });

  it('removes dummy hardcoded values and respects passed values in ResearchBrief', async () => {
    const rawResults: IResearchSource[] = [
      { url: 'https://example.com/source1', title: 'Source 1' }
    ];

    const brief = await synthesizer.synthesize(
      rawResults,
      'track-custom-123',
      ['query-alpha', 'query-beta'],
      ['installed-skill-1']
    );

    expect(brief.trackId).toBe('track-custom-123');
    expect(brief.queriesExecuted).toEqual(['query-alpha', 'query-beta']);
    expect(brief.skillsAlreadyInstalled).toEqual(['installed-skill-1']);
    // Verify default dummy arrays ('aws-cli', 'docker', 'query1', 'query2') are NOT forced
    expect(brief.skillsAlreadyInstalled).not.toContain('aws-cli');
  });

  it('validates output against ResearchBriefSchema', async () => {
    const rawResults: IResearchSource[] = [
      { url: 'https://example.com/valid', title: 'Valid' }
    ];

    const brief = await synthesizer.synthesize(rawResults);

    expect(() => ResearchBriefSchema.parse(brief)).not.toThrow();
  });

  it('enforces executiveSummary <= 400 words by truncating', async () => {
    const longSummary = Array(450).fill('word').join(' ');

    mockExecuteLlm.mockImplementation(async (prompt: string) => {
      if (prompt.includes('Extract')) {
        return [{ category: 'WHITE_PAPER', description: 'Sample', confidenceScore: 0.8 }];
      }
      if (prompt.includes('Synthesize')) {
        return {
          executiveSummary: longSummary,
          recommendedPatterns: [],
          antiPatterns: []
        };
      }
      return {};
    });

    const rawResults: IResearchSource[] = [
      { url: 'https://example.com/long', title: 'Long Summary Source' }
    ];

    const brief = await synthesizer.synthesize(rawResults);
    const words = brief.executiveSummary.trim().split(/\s+/);

    expect(words.length).toBe(400);
  });

  it('writes chunked artifact files to disk for each source', async () => {
    const rawResults: IResearchSource[] = [
      { url: 'https://example.com/test-article', title: 'Test Article', content: 'Sample article body' }
    ];

    const brief = await synthesizer.synthesize(rawResults);

    const expectedFile = brief.artifactPointers[0];
    expect(fs.existsSync(expectedFile)).toBe(true);

    const fileContent = fs.readFileSync(expectedFile, 'utf8');
    expect(fileContent).toContain('# Test Article');
    expect(fileContent).toContain('URL: https://example.com/test-article');
    expect(fileContent).toContain('Sample article body');
  });
});
