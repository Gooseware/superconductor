import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDeepResearchProvider } from '../../src/research/providers/google-deep-research-provider.js';
import { ResearchProviderUnavailableError } from '../../src/research/errors/research-provider-unavailable-error.js';

vi.mock('@superconductor/core/src/utils/input-sanitizer.js', () => ({
  sanitizeUntrustedText: vi.fn((text: string) => `sanitized_${text}`),
}));

describe('GoogleDeepResearchProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call executeTool with search_web and query', async () => {
    const mockExecute = vi.fn().mockResolvedValue([]);
    const provider = new GoogleDeepResearchProvider(mockExecute);

    await provider.search({ term: 'test query' });

    expect(mockExecute).toHaveBeenCalledWith('search_web', { query: 'test query' });
  });

  it('should filter results through ResearchSourceQualityGate', async () => {
    const mockExecute = vi.fn().mockResolvedValue([
      { type: 'github', url: 'https://github.com/foo/bar', stars: 150, lastCommitDaysAgo: 10, license: 'MIT', title: 'Foo' },
      { type: 'unknown', url: 'https://bad.com', title: 'Bad' }, // Should fail gate
      { type: 'paper', url: 'https://arxiv.org/abs/1234', title: 'Paper' }
    ]);
    const provider = new GoogleDeepResearchProvider(mockExecute);

    const results = await provider.search({ term: 'test' });

    expect(results).toHaveLength(2); // github and paper
    expect(results[0].url).toContain('sanitized_https://github.com/foo/bar');
    expect(results[1].url).toContain('sanitized_https://arxiv.org/abs/1234');
  });

  it('should wrap outputs in <untrusted_research_results> XML and sanitize', async () => {
    const mockExecute = vi.fn().mockResolvedValue([
      { type: 'community', url: 'https://stackoverflow.com/questions/123', title: 'Q', content: 'A' }
    ]);
    const provider = new GoogleDeepResearchProvider(mockExecute);

    const results = await provider.search({ term: 'test' });
    expect(results[0]).toEqual({
      url: '<untrusted_research_results>sanitized_https://stackoverflow.com/questions/123</untrusted_research_results>',
      title: '<untrusted_research_results>sanitized_Q</untrusted_research_results>',
      content: '<untrusted_research_results>sanitized_A</untrusted_research_results>'
    });
  });

  it('should implement exponential backoff on failure and retry up to 3 times', async () => {
    const mockExecute = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce([{ type: 'github', url: 'https://github.com/ok', stars: 200, lastCommitDaysAgo: 5, license: 'MIT' }]);
    
    const provider = new GoogleDeepResearchProvider(mockExecute);
    
    const start = Date.now();
    const results = await provider.search({ term: 'test' });
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(1);
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(elapsed).toBeGreaterThan(100); 
  });

  it('should open circuit breaker after 3 consecutive failures', async () => {
    const mockExecute = vi.fn().mockRejectedValue(new Error('fail'));
    const provider = new GoogleDeepResearchProvider(mockExecute);

    // Call 1
    await expect(provider.search({ term: 'test' })).rejects.toThrow('fail');
    // Call 2
    await expect(provider.search({ term: 'test' })).rejects.toThrow('fail');
    // Call 3
    await expect(provider.search({ term: 'test' })).rejects.toThrow('fail');
    
    // Circuit breaker is now open
    await expect(provider.search({ term: 'test' })).rejects.toThrow(ResearchProviderUnavailableError);
  });
});
