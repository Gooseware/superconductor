import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';
import { GoogleGenAI } from '@google/genai';

export interface GeminiInteractionsOptions {
  authMode?: 'apiKey' | 'vertexai';
}

export class GeminiInteractionsClient {
  public sdkClient: any;

  constructor(options: GeminiInteractionsOptions = { authMode: 'apiKey' }) {
    if (options.authMode === 'apiKey') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new ResearchProviderUnavailableError('Missing GEMINI_API_KEY');
      }
      this.sdkClient = new GoogleGenAI({ apiKey });
    } else if (options.authMode === 'vertexai') {
      const projectId = process.env.GCP_PROJECT_ID;
      if (!projectId) {
        throw new ResearchProviderUnavailableError('Missing GCP_PROJECT_ID');
      }
      this.sdkClient = new GoogleGenAI({
        vertexai: {
            project: projectId,
            location: process.env.GCP_LOCATION || 'us-central1'
        }
      });
    } else {
      throw new Error(`Invalid auth mode: ${options.authMode}`);
    }
  }

  async createInteraction(params: any): Promise<any> {
    if (this.sdkClient.interactions) {
      return this.sdkClient.interactions.createInteraction(params);
    }
    // Fallback if SDK doesn't natively expose it yet, you could potentially do custom fetch here,
    // but per prompt we assume the SDK handles it or we just proxy it.
    throw new Error("SDK does not support interactions");
  }

  async getInteraction(id: string): Promise<any> {
    if (this.sdkClient.interactions) {
      return this.sdkClient.interactions.getInteraction(id);
    }
    throw new Error("SDK does not support interactions");
  }
}
