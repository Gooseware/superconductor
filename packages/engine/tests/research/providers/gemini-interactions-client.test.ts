import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { GeminiInteractionsClient } from '../../../src/research/providers/gemini-interactions-client.js';

describe('GeminiInteractionsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  let originalEnv: any;
  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should format URL correctly for apiKey mode', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const client = new GeminiInteractionsClient({ authMode: 'apiKey' });
    
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '123', state: 'COMPLETED' })
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.getInteraction('interactions/123/my path');
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions/123/my%20path?key=test-key'
    );
  });

  it('should format URL correctly for vertexai mode and fetch tokens', async () => {
    process.env.GCP_PROJECT_ID = 'test-project';
    process.env.GCP_LOCATION = 'us-east1';
    delete process.env.GCP_ACCESS_TOKEN;

    const client = new GeminiInteractionsClient({ authMode: 'vertexai' });
    
    // Mock the GoogleAuth instance which was created in constructor
    const authSpy = vi.spyOn((client as any).googleAuth, 'getAccessToken').mockResolvedValue('dynamic-token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '456', state: 'COMPLETED' })
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.getInteraction('projects/test-project/locations/us-east1/interactions/123/my path');
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://us-east1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/us-east1/interactions/123/my%20path',
      expect.objectContaining({
        headers: { 'Authorization': 'Bearer dynamic-token' }
      })
    );
    expect(authSpy).toHaveBeenCalled();
  });
});
