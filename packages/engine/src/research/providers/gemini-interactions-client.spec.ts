vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(opts) {
      this.opts = opts;
      if (!opts.apiKey && !(opts.vertexai && opts.vertexai.project && opts.vertexai.location)) {
        throw new Error('Authentication is not set up...');
      }
    }
  }
}));
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GeminiInteractionsClient } from './gemini-interactions-client.js';
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
});
