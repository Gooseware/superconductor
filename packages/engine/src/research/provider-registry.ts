import { IResearchProvider, IResearchQuery, IResearchSource } from './types.js';
import { GoogleDeepResearchProvider } from './providers/google-deep-research-provider.js';
import { GeminiApiDeepResearchProvider } from './providers/gemini-api-deep-research-provider.js';
import { VertexAiDeepResearchProvider } from './providers/vertex-ai-deep-research-provider.js';

export class ResearchProviderRegistry {
  resolve(providerName: string = 'google', options?: any): IResearchProvider {
    if (providerName === 'google') {
      return new GoogleDeepResearchProvider();
    }
    if (providerName === 'gemini_api_deep_research' || providerName === 'gemini-api-deep-research') {
      return new GeminiApiDeepResearchProvider(options);
    }
    
    if (providerName === 'vertex_ai_deep_research' || providerName === 'vertex-ai-deep-research') {
      return new VertexAiDeepResearchProvider(options);
    }
    throw new Error(`Unknown research provider requested: ${providerName}`);
  }
}
