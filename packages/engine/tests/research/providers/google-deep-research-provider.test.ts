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
      return `Here are the results:
- [Mock Repo](https://github.com/mock/repo)
- [Mock Paper](https://arxiv.org/abs/1234.5678)
`;
    });
    provider = new GoogleDeepResearchProvider(mockExecuteTool);
  });

  it('sanitizes and wraps the raw markdown in XML tags', async () => {
    const results = await provider.search({ term: 'test query' });
    
    expect(results.length).toBe(1);
    
    expect(results[0].url).toBe('<untrusted_research_results>search_web_results</untrusted_research_results>');
    expect(results[0].title).toMatch(/<untrusted_research_results>.*Mock Repo.*<\/untrusted_research_results>/s);
  });

  it('implements exponential backoff on failures', async () => {
    mockExecuteTool.mockRejectedValueOnce(new Error('Temp failure'))
                 .mockResolvedValueOnce(`[OK](https://github.com/ok)`);
                 
    const startTime = Date.now();
    const results = await provider.search({ term: 'test retry' });
    const elapsed = Date.now() - startTime;
    
    expect(results.length).toBe(1);
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it('throws ResearchProviderUnavailableError on 3 consecutive failures (circuit breaker)', async () => {
    mockExecuteTool.mockRejectedValue(new Error('Persistent failure'));

    await expect(provider.search({ term: 'FAIL_NOW' })).rejects.toThrow('Persistent failure');
    await expect(provider.search({ term: 'FAIL_NOW' })).rejects.toThrow('Persistent failure');
    await expect(provider.search({ term: 'FAIL_NOW' })).rejects.toThrow('Persistent failure');

    // 4th call should fail immediately with circuit breaker error
    await expect(provider.search({ term: 'test' })).rejects.toThrow(ResearchProviderUnavailableError);
    await expect(provider.search({ term: 'test' })).rejects.toThrow('Circuit breaker open');
    
    expect(mockExecuteTool).toHaveBeenCalledTimes(12);
  });
});
