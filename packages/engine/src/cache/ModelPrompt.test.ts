import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelPrompt } from './ModelPrompt';
import { CacheManager } from './CacheManager';
import { ModelFetcher } from './ModelFetcher';

// Mock Enquirer correctly
const mockPrompt = vi.fn();
vi.mock('enquirer', () => {
  return {
    default: {
      prompt: (...args: any[]) => mockPrompt(...args)
    }
  };
});

vi.mock('./CacheManager');
vi.mock('./ModelFetcher');

describe('ModelPrompt', () => {
  let cacheManager: CacheManager<any>;
  let fetcher: ModelFetcher;
  let prompt: ModelPrompt;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = { read: vi.fn(), write: vi.fn() } as unknown as CacheManager<any>;
    fetcher = { fetch: vi.fn() } as unknown as ModelFetcher;
    prompt = new ModelPrompt(cacheManager, fetcher);
  });

  it('should use cache if valid', async () => {
    vi.mocked(cacheManager.read).mockReturnValue([{ name: 'model-cached' }]);
    mockPrompt.mockResolvedValue({ model: 'model-cached' });

    const result = await prompt.selectModel();

    expect(cacheManager.read).toHaveBeenCalled();
    expect(fetcher.fetch).not.toHaveBeenCalled();
    expect(result).toBe('model-cached');
  });

  it('should fetch if cache is missing', async () => {
    vi.mocked(cacheManager.read).mockReturnValue(null);
    vi.mocked(fetcher.fetch).mockReturnValue([{ name: 'model-fetched' }]);
    mockPrompt.mockResolvedValue({ model: 'model-fetched' });

    const result = await prompt.selectModel();

    expect(cacheManager.read).toHaveBeenCalled();
    expect(fetcher.fetch).toHaveBeenCalled();
    expect(result).toBe('model-fetched');
  });
});
