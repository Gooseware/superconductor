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
      if (result.status === 'COMPLETED') {
        return result;
      }
      throw new Error('Interaction not completed yet');
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
      return [];
    }

    return outputs.map((out: any, index: number) => {
      const contentStr =
        typeof out === 'string'
          ? out
          : out.text ?? out.content ?? JSON.stringify(out);

      const titleStr =
        typeof out === 'object' && out.title
          ? out.title
          : 'Gemini Deep Research Result';

      const urlStr =
        typeof out === 'object' && out.url
          ? out.url
          : typeof out === 'object' && out.sourceUrl
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
