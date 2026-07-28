import { describe, it, expect } from 'vitest';
import { ResearchProviderRegistry, GoogleDeepResearchProvider } from '../../src/research/provider-registry';

describe('ResearchProviderRegistry', () => {
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

  it('should throw an error when an unknown provider is requested', () => {
    const registry = new ResearchProviderRegistry();
    expect(() => registry.resolve('unknown-provider')).toThrowError(
      'Unknown research provider requested: unknown-provider'
    );
  });
});
