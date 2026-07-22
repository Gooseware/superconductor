import Enquirer from 'enquirer';
import { CacheManager } from './CacheManager.js';
import { ModelFetcher } from './ModelFetcher.js';

export class ModelPrompt {
  constructor(
    private cacheManager: CacheManager<any>,
    private fetcher: ModelFetcher
  ) {}

  async selectModel(): Promise<string> {
    let models = this.cacheManager.read();
    
    if (!models) {
      models = this.fetcher.fetch();
    }

    const choices = models.map((m: any) => m.name);

    const response = await Enquirer.prompt<{ model: string }>({
      type: 'autocomplete',
      name: 'model',
      message: 'Select a model:',
      choices: choices
    });

    return response.model;
  }
}
