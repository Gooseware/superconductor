import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDeepResearchProvider } from '../../../src/research/providers/google-deep-research-provider.js';
import { ResearchProviderUnavailableError } from '../../../src/research/errors/research-provider-unavailable-error.js';

describe('GoogleDeepResearchProvider', () => {
  let provider: GoogleDeepResearchProvider;
  let mockExecuteTool: any;

  beforeEach(() => {
    mockExecuteTool = vi.fn().mockImplementation(async (toolName, args) => {
      if (args.query === 'FAIL_NOW') {
        throw new Error('Simulated network error');
      }
      return [
        { type: 'github', url: 'https://github.com/mock/repo', title: 'Mock Repo', stars: 150, lastCommitDaysAgo: 10, license: 'MIT' },
        { type: 'paper', url: 'https://arxiv.org/abs/1234.5678', title: 'Mock Paper' },
        { type: 'github', url: 'https://github.com/bad/repo', title: 'Bad Repo', stars: 5, lastCommitDaysAgo: 400, license: 'GPL' }
      ];
    });
    provider = new GoogleDeepResearchProvider(mockExecuteTool);
  });

  it('filters results through quality gate, sanitizes, and wraps in XML tags', async () => {
    const results = await provider.search({ term: 'test query' });
    
    // We expect 2 valid sources out of 3 mock sources
    expect(results.length).toBe(2);
    
    // Check XML wrapping and sanitization for URL
    expect(results[0].url).toMatch(/<untrusted_research_results>.*https:\/\/github.com\/mock\/repo.*<\/untrusted_research_results>/);
    
    // Check XML wrapping and sanitization for title
    expect(results[0].title).toMatch(/<untrusted_research_results>.*Mock Repo.*<\/untrusted_research_results>/);
    expect(results[1].url).toMatch(/<untrusted_research_results>.*https:\/\/arxiv.org\/abs\/1234.5678.*<\/untrusted_research_results>/);
    expect(results[1].title).toMatch(/<untrusted_research_results>.*Mock Paper.*<\/untrusted_research_results>/);
  });

  it('implements exponential backoff on failures', async () => {
    mockExecuteTool.mockRejectedValueOnce(new Error('Temp failure'))
                 .mockResolvedValueOnce([
                   { type: 'github', url: 'https://github.com/ok', title: 'OK', stars: 200, lastCommitDaysAgo: 5, license: 'MIT' }
                 ]);
                 
    const startTime = Date.now();
    const results = await provider.search({ term: 'test retry' });
    const elapsed = Date.now() - startTime;
    
    expect(results.length).toBe(1);
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(100); // Because first retry is ~200ms backoff
  });

  it('throws ResearchProviderUnavailableError on 3 consecutive failures (circuit breaker)', async () => {
    mockExecuteTool.mockRejectedValue(new Error('Persistent failure'));

    await expect(provider.search({ term: 'FAIL_NOW' })).rejects.toThrow('Persistent failure');
    await expect(provider.search({ term: 'FAIL_NOW' })).rejects.toThrow('Persistent failure');
    await expect(provider.search({ term: 'FAIL_NOW' })).rejects.toThrow('Persistent failure');

    // 4th call should fail immediately with circuit breaker error
    await expect(provider.search({ term: 'test' })).rejects.toThrow(ResearchProviderUnavailableError);
    await expect(provider.search({ term: 'test' })).rejects.toThrow('Circuit breaker open');
    
    expect(mockExecuteTool).toHaveBeenCalledTimes(12); // 3 manual calls * 4 attempts per call = 12
  });
});
