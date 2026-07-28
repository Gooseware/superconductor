import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { GeminiInteractionsClient } from './gemini-interactions-client.js';
import { AsyncLongPoller } from './async-long-poller.js';

export class GeminiAPIProvider implements IResearchProvider {
  name = 'Gemini API Deep Research';
  capabilities = ['DEEP_RESEARCH'];
  
  private client: GeminiInteractionsClient;
  private poller: AsyncLongPoller<any>;

  constructor() {
    this.client = new GeminiInteractionsClient();
    this.poller = new AsyncLongPoller<any>();
  }

  async invoke(query: string): Promise<string> {
    const interaction = await this.client.createInteraction({ background: true, query });
    return this.poller.poll(async () => {
      const result = await this.client.getInteraction(interaction.id || interaction.name);
      if (result.status === 'COMPLETED') {
         return result.outputs[0].text;
      }
      throw new Error('Not completed yet');
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
