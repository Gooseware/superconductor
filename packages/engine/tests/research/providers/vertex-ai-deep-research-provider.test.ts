import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResearchProviderUnavailableError } from '../../../src/research/errors/research-provider-unavailable-error.js';
import { VertexAiDeepResearchProvider } from '../../../src/research/providers/vertex-ai-deep-research-provider.js';

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    public opts: any;
    public interactions: any;
    constructor(opts: any) {
      this.opts = opts;
      this.interactions = {
        createInteraction: vi.fn(),
        getInteraction: vi.fn()
      };
    }
  }
}));

describe('VertexAiDeepResearchProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it('throws ResearchProviderUnavailableError when GCP_PROJECT_ID is missing', () => {
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_LOCATION;
    expect(() => new VertexAiDeepResearchProvider()).toThrow();
  });

  it('defaults GCP_LOCATION to us-central1 when GCP_LOCATION is absent', () => {
    process.env.GCP_PROJECT_ID = 'test-project-123';
    delete process.env.GCP_LOCATION;

    const provider = new VertexAiDeepResearchProvider();
    const client = (provider as any).client;
    expect(client).toBeDefined();
    expect(client.sdkClient.opts.project).toBe('test-project-123');
    expect(client.sdkClient.opts.location).toBe('us-central1');
    expect(client.sdkClient.opts.vertexai).toBe(true);
  });

  it('uses custom GCP_LOCATION when provided', () => {
    process.env.GCP_PROJECT_ID = 'test-project-123';
    process.env.GCP_LOCATION = 'europe-west1';

    const provider = new VertexAiDeepResearchProvider();
    const client = (provider as any).client;
    expect(client).toBeDefined();
    expect(client.sdkClient.opts.project).toBe('test-project-123');
    expect(client.sdkClient.opts.location).toBe('europe-west1');
    expect(client.sdkClient.opts.vertexai).toBe(true);
  });

  it('successfully invokes Vertex AI query, polls, and maps output to IResearchSource[]', async () => {
    vi.useFakeTimers();
    process.env.GCP_PROJECT_ID = 'test-project-123';
    process.env.GCP_LOCATION = 'us-central1';

    const provider = new VertexAiDeepResearchProvider();
    const client = (provider as any).client;

    client.sdkClient.interactions.createInteraction = vi.fn().mockResolvedValue({ id: 'interaction-123' });
    client.sdkClient.interactions.getInteraction = vi.fn()
      .mockResolvedValueOnce({ state: 'IN_PROGRESS' })
      .mockResolvedValueOnce({
        state: 'COMPLETED',
        outputs: [{ text: 'Deep research findings from Vertex AI.' }]
      });

    const promise = provider.search({ term: 'quantum algorithms' });
    promise.catch(() => {});
    
    await vi.runAllTimersAsync();
    const sources = await promise;

    expect(client.sdkClient.interactions.createInteraction).toHaveBeenCalledWith({
      background: true,
      query: 'quantum algorithms'
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual({
      url: 'vertexai://deep-research',
      title: 'Vertex AI Deep Research Result',
      content: 'Deep research findings from Vertex AI.'
    });
  });

  it('handles FAILED state by throwing an error', async () => {
    vi.useFakeTimers();
    process.env.GCP_PROJECT_ID = 'test-project-123';
    process.env.GCP_LOCATION = 'us-central1';

    const provider = new VertexAiDeepResearchProvider();
    const client = (provider as any).client;

    client.sdkClient.interactions.createInteraction = vi.fn().mockResolvedValue({ id: 'interaction-123' });
    client.sdkClient.interactions.getInteraction = vi.fn()
      .mockResolvedValueOnce({ state: 'IN_PROGRESS' })
      .mockResolvedValueOnce({ state: 'FAILED' });

    const promise = provider.search({ term: 'quantum algorithms' });
    promise.catch(() => {});
    
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/Interaction failed with state: FAILED/);
  });

  it('has name and DEEP_RESEARCH capabilities', () => {
    process.env.GCP_PROJECT_ID = 'test-project-123';
    const provider = new VertexAiDeepResearchProvider();
    expect(provider.name).toBe('Vertex AI Deep Research');
    expect(provider.capabilities).toContain('DEEP_RESEARCH');
  });
});
