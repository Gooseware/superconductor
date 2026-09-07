import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResearchProviderRegistry } from '../provider-registry.js';
import { DeerflowResearchProvider } from '../providers/deerflow-research-provider.js';
import { GoogleDeepResearchProvider } from '../providers/google-deep-research-provider.js';
import { GeminiApiDeepResearchProvider } from '../providers/gemini-api-deep-research-provider.js';
import { VertexAiDeepResearchProvider } from '../providers/vertex-ai-deep-research-provider.js';

describe('ResearchProviderRegistry', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should resolve "deerflow" to DeerflowResearchProvider', () => {
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve('deerflow');
    expect(provider).toBeInstanceOf(DeerflowResearchProvider);
  });

  it('should resolve "deerflow_research" to DeerflowResearchProvider', () => {
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve('deerflow_research');
    expect(provider).toBeInstanceOf(DeerflowResearchProvider);
  });

  it('should resolve "deerflow-2" to DeerflowResearchProvider', () => {
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve('deerflow-2');
    expect(provider).toBeInstanceOf(DeerflowResearchProvider);
  });

  it('should pass options to DeerflowResearchProvider', () => {
    const registry = new ResearchProviderRegistry();
    const options = {
      mode: 'ultra' as const,
      endpoint: 'http://custom-host:9999',
      allowedHosts: ['custom-host']
    };
    const provider = registry.resolve('deerflow', options) as DeerflowResearchProvider;

    expect(provider).toBeInstanceOf(DeerflowResearchProvider);
    expect(provider.options.mode).toBe('ultra');
    expect(provider.endpoint).toBe('http://custom-host:9999');
  });

  it('should pass executeTool to DeerflowResearchProvider', async () => {
    const registry = new ResearchProviderRegistry();
    const mockExecuteTool = vi.fn().mockResolvedValue('[Result](https://example.com)');
    const provider = registry.resolve('deerflow', { mode: 'flash' }, mockExecuteTool) as DeerflowResearchProvider;

    expect(provider).toBeInstanceOf(DeerflowResearchProvider);
    await provider.search({ term: 'test executeTool' });
    expect(mockExecuteTool).toHaveBeenCalledWith('deerflow_research', {
      topic: 'test executeTool',
      mode: 'flash'
    });
  });

  it('should resolve "google" to GoogleDeepResearchProvider by default', () => {
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve();
    expect(provider).toBeInstanceOf(GoogleDeepResearchProvider);
  });

  it('should resolve "google" when explicitly requested', () => {
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve('google');
    expect(provider).toBeInstanceOf(GoogleDeepResearchProvider);
  });

  it('should resolve "gemini_api_deep_research" when requested', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve('gemini_api_deep_research');
    expect(provider).toBeInstanceOf(GeminiApiDeepResearchProvider);
  });

  it('should resolve "vertex-ai-deep-research" when requested', () => {
    process.env.GCP_PROJECT_ID = 'test-project';
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve('vertex-ai-deep-research');
    expect(provider).toBeInstanceOf(VertexAiDeepResearchProvider);
  });

  it('should throw error on unknown provider', () => {
    const registry = new ResearchProviderRegistry();
    expect(() => registry.resolve('unsupported-provider')).toThrow(
      'Unknown research provider requested: unsupported-provider'
    );
  });
});
