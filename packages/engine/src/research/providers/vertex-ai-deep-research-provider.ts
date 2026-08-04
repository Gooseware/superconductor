import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { GeminiInteractionsClient } from './gemini-interactions-client.js';
import { AsyncLongPoller, LongPollerOptions } from './async-long-poller.js';

export interface VertexAiDeepResearchProviderOptions {
  client?: GeminiInteractionsClient;
  poller?: AsyncLongPoller<any>;
  pollerOptions?: LongPollerOptions;
}

export class VertexAiDeepResearchProvider implements IResearchProvider {
  name = 'Vertex AI Deep Research';
  capabilities = ['DEEP_RESEARCH'];
  
  private client: GeminiInteractionsClient;
  private poller: AsyncLongPoller<any>;

  constructor(options: VertexAiDeepResearchProviderOptions = {}) {
    this.client = options.client || new GeminiInteractionsClient({ authMode: 'vertexai' });
    this.poller = options.poller || new AsyncLongPoller<any>(options.pollerOptions);
  }

  async search(query: IResearchQuery): Promise<IResearchSource[]> {
    const interaction = await this.client.createInteraction({
      background: true,
      input: query.term,
      intent: query.intent
    });

    if (!interaction || (!interaction.id && !interaction.name)) {
      throw new Error('Provider returned an interaction without an ID or name');
    }

    const completedInteraction = await this.poller.poll(async () => {
      const result = await this.client.getInteraction(interaction.id || interaction.name);
      if (!result) throw new Error('Provider returned null result');
      if (result.state === 'COMPLETED') {
        return { status: 'done', result };
      }
      if (result.state === 'FAILED' || result.state === 'ERROR' || result.state === 'CANCELED' || result.state === 'ABORTED') {
        throw new Error(`Interaction failed with state: ${result.state}`);
      }
      return { status: 'pending' };
    });

    return this.mapOutputsToSources(completedInteraction);
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
          : out?.text ?? out?.content ?? ( () => { try { return JSON.stringify(out); } catch { return String(out); } } )();

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
