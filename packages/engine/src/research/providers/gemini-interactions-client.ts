import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';
import { GoogleGenAI } from '@google/genai';

export interface GeminiInteractionsOptions {
  authMode?: 'apiKey' | 'vertexai';
}

export class GeminiInteractionsClient {
  public sdkClient: any;
  private authMode: 'apiKey' | 'vertexai';

  constructor(options: GeminiInteractionsOptions = { authMode: 'apiKey' }) {
    const mode = options?.authMode || 'apiKey';
    this.authMode = mode as any;
    if (mode === 'apiKey') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new ResearchProviderUnavailableError('Missing GEMINI_API_KEY');
      }
      this.sdkClient = new GoogleGenAI({ apiKey });
    } else if (mode === 'vertexai') {
      const projectId = process.env.GCP_PROJECT_ID;
      if (!projectId) {
        throw new ResearchProviderUnavailableError('Missing GCP_PROJECT_ID');
      }
      this.sdkClient = new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location: process.env.GCP_LOCATION || 'us-central1'
      });
    } else {
      throw new Error(`Invalid auth mode: ${mode}`);
    }
  }

  async createInteraction(params: any): Promise<any> {
    if (this.sdkClient.interactions) {
      return this.sdkClient.interactions.createInteraction(params);
    }
    
    if (this.authMode === 'apiKey') {
      const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${process.env.GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (!response.ok) {
        throw new Error(`Failed to create interaction: ${response.statusText}`);
      }
      return response.json();
    }
    
    throw new Error("SDK does not support interactions");
  }

  async getInteraction(id: string): Promise<any> {
    if (this.sdkClient.interactions) {
      return this.sdkClient.interactions.getInteraction(id);
    }

    if (this.authMode === 'apiKey') {
      const url = `https://generativelanguage.googleapis.com/v1beta/interactions/${id}?key=${process.env.GEMINI_API_KEY}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to get interaction: ${response.statusText}`);
      }
      return response.json();
    }

    throw new Error("SDK does not support interactions");
  }
}
