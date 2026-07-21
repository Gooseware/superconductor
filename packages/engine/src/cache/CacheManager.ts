import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class CacheManager<T> {
  private cachePath: string;
  private readonly MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(cachePath: string) {
    this.cachePath = cachePath.startsWith('~/') 
      ? path.join(os.homedir(), cachePath.slice(2)) 
      : cachePath;
  }

  read(): T | null {
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
      return JSON.parse(content) as T;
    } catch (err) {
      return null;
    }
  }

  write(data: T): void {
    const dir = path.dirname(this.cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.cachePath, JSON.stringify(data), { mode: 0o600 });
  }
}
