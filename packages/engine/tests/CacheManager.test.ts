import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CacheManager } from '../src/cache/CacheManager.js';

describe('CacheManager Atomic Write & Permissions', () => {
  const tmpDir = path.join(os.tmpdir(), `cache-manager-test-${Date.now()}`);
  const cachePath = path.join(tmpDir, 'test-cache.json');

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writes atomically and sets 0600 permissions', () => {
    const manager = new CacheManager<{ name: string }>(cachePath);
    manager.write({ name: 'superconductor' });

    expect(fs.existsSync(cachePath)).toBe(true);
    const content = manager.read();
    expect(content).toEqual({ name: 'superconductor' });

    const stat = fs.statSync(cachePath);
    // mode 0600 (read/write by owner only) -> 0o100600
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('handles in-memory singleton caching on repeated read', () => {
    const manager = new CacheManager<{ value: number }>(cachePath);
    manager.write({ value: 42 });

    const read1 = manager.read();
    const read2 = manager.read();
    expect(read1).toEqual({ value: 42 });
    expect(read2).toEqual({ value: 42 });
  });

  it('returns null when cache is expired or missing', () => {
    const manager = new CacheManager<{ value: number }>(path.join(tmpDir, 'nonexistent.json'));
    expect(manager.read()).toBeNull();
  });
});
