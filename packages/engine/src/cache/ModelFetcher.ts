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

    let parsed: any;
    try {
      parsed = JSON.parse(output);
    } catch (err) {
      throw new ModelFetchError('Failed to parse models JSON output', err);
    }

    this.cacheManager.write(parsed);
    return parsed;
  }
}
