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

  async invoke(query: string): Promise<any> {
    const interaction = await this.client.createInteraction({ background: true, query });
    return this.poller.poll(async () => {
      const result = await this.client.getInteraction(interaction.id || interaction.name);
      if (result.state === 'COMPLETED') {
        return { status: 'done', result };
      }
      if (result.state === 'FAILED' || result.state === 'ERROR') {
        throw new Error(`Interaction failed with state: ${result.state}`);
      }
      return { status: 'pending' };
    });
  }

  async search(query: IResearchQuery): Promise<IResearchSource[]> {
    const interaction = await this.invoke(query.term);
    return this.mapOutputsToSources(interaction);
  }

  private mapOutputsToSources(interaction: any): IResearchSource[] {
    const outputs = interaction?.outputs || [];
    if (!Array.isArray(outputs) || outputs.length === 0) {
      if (typeof interaction === 'string') {
        return [
          {
            url: 'vertexai://deep-research',
            title: 'Vertex AI Deep Research Result',
            content: interaction
          }
        ];
      }
      if (interaction?.text) {
        return [
          {
            url: 'vertexai://deep-research',
            title: 'Vertex AI Deep Research Result',
            content: interaction.text
          }
        ];
      }
      throw new Error('Interaction resulted in no outputs and no text');
    }

    return outputs.map((out: any, index: number) => {
      const contentStr =
        typeof out === 'string'
          ? out
          : out.text ?? out.content ?? JSON.stringify(out);

      const titleStr =
        out && typeof out === 'object' && out.title
          ? out.title
          : 'Vertex AI Deep Research Result';

      const urlStr =
        out && typeof out === 'object' && out.url
          ? out.url
          : out && typeof out === 'object' && out.sourceUrl
          ? out.sourceUrl
          : 'vertexai://deep-research';

      return {
        url: urlStr,
        title: titleStr,
        content: contentStr
      };
    });
  }
}
