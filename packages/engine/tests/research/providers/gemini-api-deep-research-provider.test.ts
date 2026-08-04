import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiApiDeepResearchProvider } from '../../../src/research/providers/gemini-api-deep-research-provider.js';
import { ResearchProviderUnavailableError } from '../../../src/research/errors/research-provider-unavailable-error.js';
import { GeminiInteractionsClient } from '../../../src/research/providers/gemini-interactions-client.js';
import { AsyncLongPoller } from '../../../src/research/providers/async-long-poller.js';

describe('GeminiApiDeepResearchProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it('throws ResearchProviderUnavailableError when GEMINI_API_KEY is missing', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiApiDeepResearchProvider()).toThrow(ResearchProviderUnavailableError);
  });

  it('successful query maps interaction outputs to IResearchSource[] with content', async () => {
    process.env.GEMINI_API_KEY = 'test-api-key';

    const mockClient = {
      createInteraction: vi.fn().mockResolvedValue({ id: 'interaction-123' }),
      getInteraction: vi.fn().mockResolvedValue({
        id: 'interaction-123',
        state: 'COMPLETED',
        outputs: [
          {
            text: 'Detailed deep research content on AI safety.',
            title: 'AI Safety Research',
            url: 'https://example.com/ai-safety'
          }
        ]
      })
    } as unknown as GeminiInteractionsClient;

    const provider = new GeminiApiDeepResearchProvider({ client: mockClient });
    const results = await provider.search({ term: 'AI safety' });

    expect(mockClient.createInteraction).toHaveBeenCalledWith({
      background: true,
      input: 'AI safety',
      intent: undefined
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      url: 'https://example.com/ai-safety',
      title: 'AI Safety Research',
      content: 'Detailed deep research content on AI safety.'
    });
  });

  it('polling calls AsyncLongPoller with IN_PROGRESS and then COMPLETED', async () => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = 'test-api-key';

    const getInteractionMock = vi.fn()
      .mockResolvedValueOnce({
        id: 'interaction-456',
        state: 'IN_PROGRESS'
      })
      .mockResolvedValueOnce({
        id: 'interaction-456',
        state: 'COMPLETED',
        outputs: [
          { text: 'Sample result text' }
        ]
      });

    const mockClient = {
      createInteraction: vi.fn().mockResolvedValue({ id: 'interaction-456' }),
      getInteraction: getInteractionMock
    } as unknown as GeminiInteractionsClient;

    const mockPoller = new AsyncLongPoller<any>({ pollIntervalMs: 100 });
    
    const provider = new GeminiApiDeepResearchProvider({
      client: mockClient,
      poller: mockPoller
    });

    const promise = provider.search({ term: 'test polling' });
    
    // Fast-forward past the initial poll interval
    await vi.runAllTimersAsync();
    
    const results = await promise;
    expect(getInteractionMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Sample result text');
  });

  it('polling handles FAILED state by throwing an error', async () => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = 'test-api-key';

    const getInteractionMock = vi.fn()
      .mockResolvedValueOnce({
        id: 'interaction-456',
        state: 'IN_PROGRESS'
      })
      .mockResolvedValueOnce({
        id: 'interaction-456',
        state: 'FAILED'
      });

    const mockClient = {
      createInteraction: vi.fn().mockResolvedValue({ id: 'interaction-456' }),
      getInteraction: getInteractionMock
    } as unknown as GeminiInteractionsClient;

    const mockPoller = new AsyncLongPoller<any>({ pollIntervalMs: 100 });
    
    const provider = new GeminiApiDeepResearchProvider({
      client: mockClient,
      poller: mockPoller
    });

    const promise = provider.search({ term: 'test failure' });
    promise.catch(() => {});
    
    await vi.runAllTimersAsync();
    
    await expect(promise).rejects.toThrow(/Interaction failed with state: FAILED/);
  });
});
