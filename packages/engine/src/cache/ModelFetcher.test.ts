import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'child_process';
import { ModelFetcher } from './ModelFetcher';
import { CacheManager } from './CacheManager';
import { ModelFetchError } from './errors';

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
    const mockOutput = JSON.stringify([{ name: 'model-a' }, { name: 'model-b' }]);
    vi.mocked(child_process.execSync).mockReturnValue(Buffer.from(mockOutput));

    const result = fetcher.fetch();

    expect(child_process.execSync).toHaveBeenCalledWith('agy models', { encoding: 'utf-8' });
    expect(result).toEqual([{ name: 'model-a' }, { name: 'model-b' }]);
    expect(cacheManager.write).toHaveBeenCalledWith(result);
  });

  it('should throw ModelFetchError on command failure', () => {
    vi.mocked(child_process.execSync).mockImplementation(() => {
      throw new Error('Command failed');
    });

    expect(() => fetcher.fetch()).toThrow(ModelFetchError);
  });

  it('should throw ModelFetchError on JSON parse failure', () => {
    vi.mocked(child_process.execSync).mockReturnValue('Invalid JSON');

    expect(() => fetcher.fetch()).toThrow(ModelFetchError);
  });
});
