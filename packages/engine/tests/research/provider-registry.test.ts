import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResearchProviderRegistry } from '../../src/research/provider-registry.js';
import { GoogleDeepResearchProvider } from '../../src/research/providers/google-deep-research-provider.js';
import { GeminiAPIProvider } from '../../src/research/providers/gemini-api-provider.js';

describe('ResearchProviderRegistry', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return GoogleDeepResearchProvider by default', () => {
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve();
    expect(provider).toBeInstanceOf(GoogleDeepResearchProvider);
  });

  it('should return GoogleDeepResearchProvider when "google" is requested', () => {
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve('google');
    expect(provider).toBeInstanceOf(GoogleDeepResearchProvider);
  });

  it('should return GeminiAPIProvider when "gemini_api_deep_research" is requested', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve('gemini_api_deep_research');
    expect(provider).toBeInstanceOf(GeminiAPIProvider);
  });

  it('should throw an error when an unknown provider is requested', () => {
    const registry = new ResearchProviderRegistry();
    expect(() => registry.resolve('unknown-provider')).toThrowError(
      'Unknown research provider requested: unknown-provider'
    );
  });
});
