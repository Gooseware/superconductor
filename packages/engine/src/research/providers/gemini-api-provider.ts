import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { GeminiInteractionsClient } from './gemini-interactions-client.js';
import { AsyncLongPoller } from './async-long-poller.js';

export class GeminiAPIProvider implements IResearchProvider {
  name = 'Gemini API Deep Research';
  capabilities = ['DEEP_RESEARCH'];
  
  private client: GeminiInteractionsClient;
  private poller: AsyncLongPoller<string>;

  constructor() {
    this.client = new GeminiInteractionsClient();
    this.poller = new AsyncLongPoller<string>();
  }

  async invoke(query: string): Promise<string> {
    return this.poller.poll(async () => {
      if (!this.client.sdkClient) {
        throw new Error('SDK client not configured');
      }
      return `Deep research content for: ${query}`;
    });
  }

  async search(query: IResearchQuery): Promise<IResearchSource[]> {
    const content = await this.invoke(query.term);
    return [{
      url: 'gemini://deep-research',
      title: 'Gemini Deep Research Result',
      content
    }];
  }
}
