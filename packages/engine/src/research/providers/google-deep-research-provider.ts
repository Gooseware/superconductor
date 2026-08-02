import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { sanitizeUntrustedText } from '@superconductor/core';
import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';
import { ResearchSourceQualityGate, ResearchSource } from '../source-quality-gate.js';

export type ExecuteToolFn = (toolName: string, args: any) => Promise<any>;

export class GoogleDeepResearchProvider implements IResearchProvider {
  private consecutiveFailures = 0;
  private qualityGate = new ResearchSourceQualityGate();

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

        let parsedResults: any[] = [];
        if (typeof rawResults === 'string') {
          try {
            parsedResults = JSON.parse(rawResults);
            if (!Array.isArray(parsedResults)) {
              parsedResults = [parsedResults];
            }
          } catch {
            return [{
              url: `<untrusted_research_results>search_web_results</untrusted_research_results>`,
              title: `<untrusted_research_results>${sanitizeUntrustedText(rawResults)}</untrusted_research_results>`,
            }];
          }
        } else if (Array.isArray(rawResults)) {
          parsedResults = rawResults;
        } else if (rawResults && typeof rawResults === 'object') {
          parsedResults = rawResults.results || [rawResults];
        }

        const validSources: IResearchSource[] = [];

        for (const res of parsedResults) {
           const qualityCheck = this.qualityGate.evaluate(res as ResearchSource);
           if (qualityCheck.passed) {
              const urlStr = typeof res.url === 'string' ? res.url : 'unknown';
              const titleStr = typeof res.title === 'string' ? res.title : '';
              const contentStr = typeof res.content === 'string' ? res.content : 
                                 (typeof res.snippet === 'string' ? res.snippet : JSON.stringify(res));

              validSources.push({
                url: `<untrusted_research_results>${sanitizeUntrustedText(urlStr)}</untrusted_research_results>`,
                title: titleStr ? `<untrusted_research_results>${sanitizeUntrustedText(titleStr)}</untrusted_research_results>` : undefined,
                content: contentStr ? `<untrusted_research_results>${sanitizeUntrustedText(contentStr)}</untrusted_research_results>` : undefined
              });
           }
        }

        if (validSources.length > 0) {
          return validSources;
        }

        const fallbackString = typeof rawResults === 'string' ? rawResults : JSON.stringify(rawResults);
        return [{
          url: `<untrusted_research_results>search_web_results</untrusted_research_results>`,
          title: `<untrusted_research_results>${sanitizeUntrustedText(fallbackString)}</untrusted_research_results>`,
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
