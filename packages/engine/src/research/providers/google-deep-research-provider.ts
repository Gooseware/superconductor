import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { ResearchSourceQualityGate } from '../source-quality-gate.js';
import { sanitizeUntrustedText } from '@superconductor/core/src/utils/input-sanitizer.js';
import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';

export type ExecuteToolFn = (toolName: string, args: any) => Promise<any>;

export class GoogleDeepResearchProvider implements IResearchProvider {
  private consecutiveFailures = 0;
  private qualityGate = new ResearchSourceQualityGate();

  constructor(private executeTool: ExecuteToolFn = async () => []) {}

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

        const filtered: IResearchSource[] = [];

        for (const res of rawResults) {
          const evalResult = this.qualityGate.evaluate(res);
          if (evalResult.passed) {
            filtered.push({
              url: `<untrusted_research_results>${sanitizeUntrustedText(res.url)}</untrusted_research_results>`,
              title: `<untrusted_research_results>${sanitizeUntrustedText(res.title || '')}</untrusted_research_results>`,
            });
          }
        }

        return filtered;
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
