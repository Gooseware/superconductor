import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { GeminiInteractionsClient } from './gemini-interactions-client.js';
import { AsyncLongPoller, LongPollerOptions } from './async-long-poller.js';
import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';

export interface GeminiApiDeepResearchProviderOptions {
  client?: GeminiInteractionsClient;
  poller?: AsyncLongPoller<any>;
  pollerOptions?: LongPollerOptions;
}

export class GeminiApiDeepResearchProvider implements IResearchProvider {
  name = 'gemini-api-deep-research';
  capabilities = ['DEEP_RESEARCH'];

  private client: GeminiInteractionsClient;
  private poller: AsyncLongPoller<any>;

  constructor(options: GeminiApiDeepResearchProviderOptions = {}) {
    if (options.client) {
      this.client = options.client;
    } else {
      if (!process.env.GEMINI_API_KEY) {
        throw new ResearchProviderUnavailableError('Missing GEMINI_API_KEY');
      }
      this.client = new GeminiInteractionsClient({ authMode: 'apiKey' });
    }
    this.poller = options.poller ?? new AsyncLongPoller<any>(options.pollerOptions);
  }

  async search(query: IResearchQuery): Promise<IResearchSource[]> {
    if (!process.env.GEMINI_API_KEY && !this.client) {
      throw new ResearchProviderUnavailableError('Missing GEMINI_API_KEY');
    }

    const interaction = await this.client.createInteraction({
      background: true,
      input: query.term,
      intent: query.intent
    });

    const completedInteraction = await this.poller.poll(async () => {
      const result = await this.client.getInteraction(interaction.id || interaction.name);
      if (result.state === 'COMPLETED') {
        return { status: 'done', result };
      }
      if (result.state === 'FAILED' || result.state === 'ERROR') {
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
            url: 'gemini://deep-research',
            title: 'Gemini Deep Research Result',
            content: interaction
          }
        ];
      }
      if (interaction?.text) {
        return [
          {
            url: 'gemini://deep-research',
            title: 'Gemini Deep Research Result',
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
          : 'Gemini Deep Research Result';

      const urlStr =
        out && typeof out === 'object' && out.url
          ? out.url
          : out && typeof out === 'object' && out.sourceUrl
          ? out.sourceUrl
          : 'gemini://deep-research';

      return {
        url: urlStr,
        title: titleStr,
        content: contentStr
      };
    });
  }
}
