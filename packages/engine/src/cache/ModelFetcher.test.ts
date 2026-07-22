import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'child_process';
import { ModelFetcher } from './ModelFetcher.js';
import { CacheManager } from './CacheManager.js';
import { ModelFetchError } from './errors.js';

vi.mock('child_process');
vi.mock('./CacheManager');

describe('ModelFetcher', () => {
  let cacheManager: CacheManager<any>;
  let fetcher: ModelFetcher;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = new CacheManager('/tmp/test.json');
    fetcher = new ModelFetcher(cacheManager);
  });

  it('should run agy models and parse output', () => {
    const mockOutput = "⠋ Fetching... \r\nmodel-a   Model A\nmodel-b   Model B";
    vi.mocked(child_process.execSync).mockReturnValue(Buffer.from(mockOutput));

    const result = fetcher.fetch();

    expect(child_process.execSync).toHaveBeenCalledWith('agy models', { encoding: 'utf-8' });
    expect(result).toEqual([{ name: 'model-a', description: 'Model A' }, { name: 'model-b', description: 'Model B' }]);
    expect(cacheManager.write).toHaveBeenCalledWith(result);
  });

  it('should throw ModelFetchError on command failure', () => {
    vi.mocked(child_process.execSync).mockImplementation(() => {
      throw new Error('Command failed');
    });

    expect(() => fetcher.fetch()).toThrow(ModelFetchError);
  });

  it('should throw ModelFetchError on parse failure (no models found)', () => {
    vi.mocked(child_process.execSync).mockReturnValue('Just some garbage output');

    expect(() => fetcher.fetch()).toThrow(ModelFetchError);
  });
});
