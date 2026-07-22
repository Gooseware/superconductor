import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { IModelRouter } from '../types/shared-schema.js';

export class CacheManager<T> {
  private cachePath: string;
  private readonly MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  private inMemoryCache: { data: T; timestamp: number } | null = null;

  constructor(cachePath: string) {
    this.cachePath = cachePath.startsWith('~/') 
      ? path.join(os.homedir(), cachePath.slice(2)) 
      : cachePath;
  }

  read(): T | null {
    if (this.inMemoryCache && (Date.now() - this.inMemoryCache.timestamp < this.MAX_AGE_MS)) {
      return this.inMemoryCache.data;
    }

    if (!fs.existsSync(this.cachePath)) {
      return null;
    }

    const stat = fs.statSync(this.cachePath);
    const age = Date.now() - stat.mtimeMs;

    if (age > this.MAX_AGE_MS) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.cachePath, 'utf8');
      const parsed = JSON.parse(content) as T;
      this.inMemoryCache = { data: parsed, timestamp: stat.mtimeMs };
      return parsed;
    } catch (err) {
      return null;
    }
  }

  /**
   * Atomic write using write-to-temp then rename pattern, setting 0600 permissions.
   */
  write(data: T): void {
    const dir = path.dirname(this.cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${this.cachePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tempPath, this.cachePath);

    this.inMemoryCache = { data, timestamp: Date.now() };
  }

  clearMemoryCache(): void {
    this.inMemoryCache = null;
  }
}
