import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';
import { GoogleGenAI } from '@google/genai';

export interface GeminiInteractionsOptions {
  authMode?: 'apiKey' | 'vertexai';
}

export class HttpError extends Error {
  public status: number;
  public headers: any;
  public response?: any;

  constructor(message: string, status: number, headers: any, response?: any) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.headers = headers;
    this.response = response;
  }
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
        throw new HttpError(`Failed to create interaction: ${response.statusText}`, response.status, response.headers, response);
      }
      return response.json();
    } else if (this.authMode === 'vertexai') {
      const projectId = process.env.GCP_PROJECT_ID;
      const location = process.env.GCP_LOCATION || 'us-central1';
      const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/interactions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GCP_ACCESS_TOKEN || ''}`
        },
        body: JSON.stringify(params)
      });
      if (!response.ok) {
        throw new HttpError(`Failed to create interaction: ${response.statusText}`, response.status, response.headers, response);
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
      const url = `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(id)}?key=${process.env.GEMINI_API_KEY}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new HttpError(`Failed to get interaction: ${response.statusText}`, response.status, response.headers, response);
      }
      return response.json();
    } else if (this.authMode === 'vertexai') {
      const projectId = process.env.GCP_PROJECT_ID;
      const location = process.env.GCP_LOCATION || 'us-central1';
      const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/interactions/${encodeURIComponent(id)}`;
      const response = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${process.env.GCP_ACCESS_TOKEN || ''}`
        }
      });
      if (!response.ok) {
        throw new HttpError(`Failed to get interaction: ${response.statusText}`, response.status, response.headers, response);
      }
      return response.json();
    }

    throw new Error("SDK does not support interactions");
  }
}
