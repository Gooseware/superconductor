import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CacheManager } from './CacheManager';
import * as os from 'os';

vi.mock('fs');
vi.mock('os');

describe('CacheManager', () => {
  const mockHomeDir = '/home/mockuser';
  const testFile = path.join(mockHomeDir, '.gemini/test_cache.json');
  
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
    vi.clearAllMocks();
  });

  it('should return null if file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const cache = new CacheManager(testFile);
    expect(cache.read()).toBeNull();
  });

  it('should return null if cache is older than 24h', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const stat = { mtimeMs: Date.now() - 25 * 60 * 60 * 1000 } as fs.Stats;
    vi.mocked(fs.statSync).mockReturnValue(stat);
    
    const cache = new CacheManager(testFile);
    expect(cache.read()).toBeNull();
  });

  it('should return data if cache is valid', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const stat = { mtimeMs: Date.now() - 10 * 60 * 60 * 1000 } as fs.Stats;
    vi.mocked(fs.statSync).mockReturnValue(stat);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ some: 'data' }));
    
    const cache = new CacheManager(testFile);
    expect(cache.read()).toEqual({ some: 'data' });
  });

  it('should write data with 0600 permissions', () => {
    const cache = new CacheManager(testFile);
    cache.write({ data: 123 });
    
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      testFile,
      JSON.stringify({ data: 123 }),
      { mode: 0o600 }
    );
  });
});
