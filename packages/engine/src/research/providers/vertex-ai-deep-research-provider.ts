import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { GeminiInteractionsClient } from './gemini-interactions-client.js';
import { AsyncLongPoller } from './async-long-poller.js';

export class VertexAiDeepResearchProvider implements IResearchProvider {
  name = 'Vertex AI Deep Research';
  capabilities = ['DEEP_RESEARCH'];
  
  private client: GeminiInteractionsClient;
  private poller: AsyncLongPoller<any>;

  constructor(client?: GeminiInteractionsClient, poller?: AsyncLongPoller<any>) {
    this.client = client || new GeminiInteractionsClient({ authMode: 'vertexai' });
    this.poller = poller || new AsyncLongPoller<any>();
  }

  async invoke(query: string): Promise<string> {
    const interaction = await this.client.createInteraction({ background: true, query });
    return this.poller.poll(async () => {
      const result = await this.client.getInteraction(interaction.id || interaction.name);
      if (result.status === 'COMPLETED') {
        const text = result.outputs?.[0]?.text ?? result.outputs?.[0]?.content ?? '';
        return text;
      }
      throw new Error('Not completed yet');
    });
  }

  async search(query: IResearchQuery): Promise<IResearchSource[]> {
    const content = await this.invoke(query.term);
    return [{
      url: 'vertexai://deep-research',
      title: 'Vertex AI Deep Research Result',
      content
    }];
  }
}
