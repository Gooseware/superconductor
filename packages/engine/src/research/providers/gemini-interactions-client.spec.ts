vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    public opts: any;
    constructor(opts: any) {
      this.opts = opts;
      if (!opts.apiKey && !(opts.vertexai && opts.project && opts.location)) {
        throw new Error('Authentication is not set up...');
      }
    }
  }
}));
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GeminiInteractionsClient, HttpError } from './gemini-interactions-client.js';
import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';

describe('GeminiInteractionsClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws ResearchProviderUnavailableError if authMode is apiKey and GEMINI_API_KEY is missing', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiInteractionsClient({ authMode: 'apiKey' })).toThrow(ResearchProviderUnavailableError);
  });

  it('throws ResearchProviderUnavailableError if authMode is vertexai and GCP_PROJECT_ID is missing', () => {
    delete process.env.GCP_PROJECT_ID;
    expect(() => new GeminiInteractionsClient({ authMode: 'vertexai' })).toThrow(ResearchProviderUnavailableError);
  });

  it('succeeds if authMode is apiKey and GEMINI_API_KEY is present', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const client = new GeminiInteractionsClient({ authMode: 'apiKey' });
    expect(client).toBeDefined();
    expect(client.sdkClient).toBeDefined();
  });

  it('succeeds if authMode is vertexai and GCP_PROJECT_ID is present', () => {
    process.env.GCP_PROJECT_ID = 'test-project'; process.env.GCP_LOCATION = 'us-central1';
    const client = new GeminiInteractionsClient({ authMode: 'vertexai' });
    expect(client).toBeDefined();
    expect(client.sdkClient).toBeDefined();
  });

  describe('createInteraction', () => {
    it('uses sdkClient.interactions if present', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      const client = new GeminiInteractionsClient({ authMode: 'apiKey' });
      client.sdkClient.interactions = {
        createInteraction: vi.fn().mockResolvedValue({ id: '123' })
      };
      const res = await client.createInteraction({ some: 'data' });
      expect(res.id).toBe('123');
      expect(client.sdkClient.interactions.createInteraction).toHaveBeenCalled();
    });

    it('falls back to fetch if sdkClient.interactions is absent (apiKey)', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      const client = new GeminiInteractionsClient({ authMode: 'apiKey' });
      client.sdkClient.interactions = undefined;
      
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'fallback-123' })
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await client.createInteraction({ some: 'data' });
      expect(res.id).toBe('fallback-123');
      expect(fetchMock).toHaveBeenCalled();
      
      vi.unstubAllGlobals();
    });

    it('falls back to fetch if sdkClient.interactions is absent (vertexai)', async () => {
      process.env.GCP_PROJECT_ID = 'test-project';
      process.env.GCP_LOCATION = 'us-central1';
      process.env.GCP_ACCESS_TOKEN = 'test-token';
      const client = new GeminiInteractionsClient({ authMode: 'vertexai' });
      client.sdkClient.interactions = undefined;
      
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'fallback-vertex-123' })
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await client.createInteraction({ some: 'data' });
      expect(res.id).toBe('fallback-vertex-123');
      expect(fetchMock).toHaveBeenCalled();
      
      vi.unstubAllGlobals();
    });
    
    it('throws HttpError on non-ok fetch response', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      const client = new GeminiInteractionsClient({ authMode: 'apiKey' });
      client.sdkClient.interactions = undefined;
      
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers()
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(client.createInteraction({ some: 'data' })).rejects.toThrow(HttpError);
      
      vi.unstubAllGlobals();
    });
  });
});
