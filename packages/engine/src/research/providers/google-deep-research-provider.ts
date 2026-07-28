import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { sanitizeUntrustedText } from '@superconductor/core/src/utils/input-sanitizer.js';
import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';

export type ExecuteToolFn = (toolName: string, args: any) => Promise<any>;

export class GoogleDeepResearchProvider implements IResearchProvider {
  private consecutiveFailures = 0;

  constructor(private executeTool: ExecuteToolFn = async () => "") {}

  public async search(query: IResearchQuery): Promise<IResearchSource[]> {
    if (this.consecutiveFailures >= 3) {
      throw new ResearchProviderUnavailableError('Circuit breaker open: 3 consecutive failures');
    }

    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      try {
        const rawResults = await this.executeTool('search_web', { query: query.term });
        this.consecutiveFailures = 0;

        const rawString = typeof rawResults === 'string' ? rawResults : String(rawResults);

        return [{
          url: `<untrusted_research_results>search_web_results</untrusted_research_results>`,
          title: `<untrusted_research_results>${sanitizeUntrustedText(rawString)}</untrusted_research_results>`,
        }];
      } catch (err) {
        retries++;
        if (retries > maxRetries) {
          this.consecutiveFailures++;
          throw err;
        }

        const backoffMs = Math.pow(2, retries) * 100 + Math.random() * 50;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error('Unreachable');
  }
}
