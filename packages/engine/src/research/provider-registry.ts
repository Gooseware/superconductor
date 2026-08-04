import { IResearchProvider, IResearchQuery, IResearchSource } from './types.js';
import { GoogleDeepResearchProvider } from './providers/google-deep-research-provider.js';
import { GeminiAPIProvider } from './providers/gemini-api-provider.js';

export interface ResearchToolExecutor {
    execute(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

export class ResearchProviderRegistry {
  resolve(providerName: string = 'google', options?: { authMode?: 'apiKey' | 'vertexai' }, executeTool?: ResearchToolExecutor | any): IResearchProvider {
    if (providerName === 'google') {
      return new GoogleDeepResearchProvider(executeTool, options);
    }
    if (providerName === 'gemini_api_deep_research') {
      return new GeminiAPIProvider(options);
    }
    throw new Error(`Unknown research provider requested: ${providerName}`);
  }
}
