import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { GoogleAuth } from 'google-auth-library';

export interface GeminiInteractionsOptions {
  authMode?: 'apiKey' | 'vertexai';
}

export class HttpError extends Error {
  public status: number;
  public headers: any;
  public responseText?: string;

  constructor(message: string, status: number, headers: any, responseText?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.headers = headers;
    this.responseText = responseText;
  }
}

const InteractionResponseSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  state: z.string().optional()
}).passthrough();

export class GeminiInteractionsClient {
  public sdkClient: any;
  private authMode: 'apiKey' | 'vertexai';
  private googleAuth: GoogleAuth | null = null;

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
      this.googleAuth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
    } else {
      throw new Error(`Invalid auth mode: ${mode}`);
    }
  }

  private async getGcpAccessToken(): Promise<string> {
    if (process.env.GCP_ACCESS_TOKEN) {
      return process.env.GCP_ACCESS_TOKEN;
    }
    if (this.googleAuth) {
      const token = await this.googleAuth.getAccessToken();
      return token || '';
    }
    return '';
  }

  private formatId(id: string): string {
    if (id.includes("..")) throw new Error("Invalid interaction ID");
    return id.split('/').map(encodeURIComponent).join('/');
  }

  async createInteraction(params: any): Promise<any> {
    if (this.sdkClient.interactions && typeof this.sdkClient.interactions.createInteraction === 'function') {
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
        throw new HttpError(`Failed to create interaction: ${response.statusText}`, response.status, response.headers);
      }
      const data = await response.json();
      return InteractionResponseSchema.parse(data);
    } else if (this.authMode === 'vertexai') {
      const projectId = process.env.GCP_PROJECT_ID;
      const location = process.env.GCP_LOCATION || 'us-central1';
      const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/interactions`;
      const token = await this.getGcpAccessToken();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(params)
      });
      if (!response.ok) {
        throw new HttpError(`Failed to create interaction: ${response.statusText}`, response.status, response.headers);
      }
      const data = await response.json();
      return InteractionResponseSchema.parse(data);
    }
    
    throw new Error("SDK does not support interactions");
  }

  async getInteraction(id: string): Promise<any> {
    if (this.sdkClient.interactions && typeof this.sdkClient.interactions.getInteraction === 'function') {
      return this.sdkClient.interactions.getInteraction(id);
    }

    const formattedId = this.formatId(id);

    if (this.authMode === 'apiKey') {
      const path = formattedId.includes('/') ? formattedId : `interactions/${formattedId}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/${path}?key=${process.env.GEMINI_API_KEY}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new HttpError(`Failed to get interaction: ${response.statusText}`, response.status, response.headers);
      }
      const data = await response.json();
      return InteractionResponseSchema.parse(data);
    } else if (this.authMode === 'vertexai') {
      const projectId = process.env.GCP_PROJECT_ID;
      const location = process.env.GCP_LOCATION || 'us-central1';
      let path = formattedId;
      if (!path.includes('/')) {
         path = `projects/${projectId}/locations/${location}/interactions/${formattedId}`;
      } else if (!path.startsWith('projects/')) {
         path = `projects/${projectId}/locations/${location}/${formattedId}`;
      }
      const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${path}`;
      const token = await this.getGcpAccessToken();
      const response = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new HttpError(`Failed to get interaction: ${response.statusText}`, response.status, response.headers);
      }
      const data = await response.json();
      return InteractionResponseSchema.parse(data);
    }

    throw new Error("SDK does not support interactions");
  }
}
