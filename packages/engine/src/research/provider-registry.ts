import { IResearchProvider, IResearchQuery, IResearchSource } from './types.js';
import { GoogleDeepResearchProvider } from './providers/google-deep-research-provider.js';
import { GeminiAPIProvider } from './providers/gemini-api-provider.js';

export class ResearchProviderRegistry {
  resolve(providerName: string = 'google'): IResearchProvider {
    if (providerName === 'google') {
      return new GoogleDeepResearchProvider();
    }
    if (providerName === 'gemini_api_deep_research') {
      return new GeminiAPIProvider();
    }
    throw new Error(`Unknown research provider requested: ${providerName}`);
  }
}
