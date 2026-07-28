import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';

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
      this.sdkClient = { type: 'apiKey', apiKey };
    } else if (options.authMode === 'vertexai') {
      const projectId = process.env.GCP_PROJECT_ID;
      if (!projectId) {
        throw new ResearchProviderUnavailableError('Missing GCP_PROJECT_ID');
      }
      this.sdkClient = {
        type: 'vertexai',
        project: projectId,
        location: process.env.GCP_LOCATION || 'us-central1'
      };
    } else {
      throw new Error(`Invalid auth mode: ${options.authMode}`);
    }
  }
}
