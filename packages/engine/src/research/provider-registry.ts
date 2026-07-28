import { IResearchProvider, IResearchQuery, IResearchSource } from './types.js';
import { GoogleDeepResearchProvider } from './providers/google-deep-research-provider.js';

export class ResearchProviderRegistry {
  resolve(providerName: string = 'google'): IResearchProvider {
    if (providerName === 'google') {
      return new GoogleDeepResearchProvider();
    }
    throw new Error(`Unknown research provider requested: ${providerName}`);
  }
}
