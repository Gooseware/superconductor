import { IResearchProvider, IResearchQuery, IResearchSource } from './types.js';
import { GoogleDeepResearchProvider } from './providers/google-deep-research-provider.js';
import { GeminiApiDeepResearchProvider, GeminiApiDeepResearchProviderOptions } from './providers/gemini-api-deep-research-provider.js';
import { VertexAiDeepResearchProvider, VertexAiDeepResearchProviderOptions } from './providers/vertex-ai-deep-research-provider.js';
import { DeerflowResearchProvider, DeerflowResearchProviderOptions } from './providers/deerflow-research-provider.js';

export interface ResearchToolExecutor {
    execute(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

export type ResearchProviderOptions = GeminiApiDeepResearchProviderOptions & VertexAiDeepResearchProviderOptions & DeerflowResearchProviderOptions & {
    authMode?: 'apiKey' | 'vertexai';
    [key: string]: any;
};

export class ResearchProviderRegistry {
  resolve(
    providerName: string = 'google',
    options?: ResearchProviderOptions,
    executeTool?: ResearchToolExecutor | any
  ): IResearchProvider {
    if (providerName === 'google') {
      return new GoogleDeepResearchProvider(executeTool, options);
    }
    if (providerName === 'gemini_api_deep_research' || providerName === 'gemini-api-deep-research') {
      return new GeminiApiDeepResearchProvider(options as GeminiApiDeepResearchProviderOptions);
    }
    if (providerName === 'vertex-ai-deep-research' || providerName === 'vertex_ai_deep_research') {
      return new VertexAiDeepResearchProvider(options as VertexAiDeepResearchProviderOptions);
    }
    if (providerName === 'deerflow' || providerName === 'deerflow_research' || providerName === 'deerflow-2') {
      return new DeerflowResearchProvider(options as DeerflowResearchProviderOptions, executeTool);
    }
    throw new Error(`Unknown research provider requested: ${providerName}`);
  }
}
