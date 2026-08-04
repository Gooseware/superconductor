import { IResearchProvider, IResearchQuery, IResearchSource } from './types.js';
import { GoogleDeepResearchProvider } from './providers/google-deep-research-provider.js';
import { GeminiAPIProvider } from './providers/gemini-api-provider.js';
import { GeminiApiDeepResearchProvider } from './providers/gemini-api-deep-research-provider.js';
import { VertexAiDeepResearchProvider } from './providers/vertex-ai-deep-research-provider.js';

export class ResearchProviderRegistry {
  resolve(providerName: string = 'google', options?: { apiKey?: string }): IResearchProvider {
    if (providerName === 'google') {
      return new GoogleDeepResearchProvider();
    }
    if (providerName === 'gemini_api_deep_research') {
      return new GeminiAPIProvider();
    }
    if (providerName === 'gemini-api-deep-research') {
      return new GeminiApiDeepResearchProvider(options);
    }
    if (providerName === 'vertex-ai-deep-research') {
      return new VertexAiDeepResearchProvider(options);
    }
    throw new Error(`Unknown research provider requested: ${providerName}`);
  }
}
