import * as child_process from 'child_process';
import { CacheManager } from './CacheManager';
import { ModelFetchError } from './errors';

export class ModelFetcher {
  constructor(private cacheManager: CacheManager<any>) {}

  fetch(): any {
    let output: string;
    try {
      const result = child_process.execSync('agy models', { encoding: 'utf-8' });
      output = result.toString();
    } catch (err) {
      throw new ModelFetchError('Failed to execute agy models', err);
    }

    let parsed: any = [];
    try {
      const lines = output.split('\n');
      for (const line of lines) {
         const match = line.match(/([a-z0-9\-]+)\s{2,}(.+)/i);
         if (match) {
             parsed.push({ name: match[1], description: match[2].trim() });
         }
      }
      if (parsed.length === 0) {
          throw new Error('No models found in output');
      }
    } catch (err) {
      throw new ModelFetchError('Failed to parse models output', err);
    }

    this.cacheManager.write(parsed);
    return parsed;
  }
}
