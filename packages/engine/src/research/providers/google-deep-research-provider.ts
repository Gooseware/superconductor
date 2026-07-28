import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { ResearchSourceQualityGate } from '../source-quality-gate.js';
import { sanitizeUntrustedText } from '@superconductor/core/src/utils/input-sanitizer.js';
import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';

export class GoogleDeepResearchProvider implements IResearchProvider {
  private consecutiveFailures = 0;
  private qualityGate = new ResearchSourceQualityGate();

  public async search(query: IResearchQuery): Promise<IResearchSource[]> {
    if (this.consecutiveFailures >= 3) {
      throw new ResearchProviderUnavailableError('Circuit breaker open: 3 consecutive failures');
    }

    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      try {
        const rawResults = await this.mock_search_web(query.term);
        this.consecutiveFailures = 0;

        const filtered: IResearchSource[] = [];

        for (const res of rawResults) {
          const evalResult = this.qualityGate.evaluate(res);
          if (evalResult.passed) {
            filtered.push({
              url: sanitizeUntrustedText(res.url),
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

  private async mock_search_web(term: string): Promise<any[]> {
    if (term.includes('FAIL_NOW')) {
      throw new Error('Simulated network error');
    }
    return [
      {
        type: 'github',
        url: 'https://github.com/mock/repo',
        title: 'Mock Repo',
        stars: 150,
        lastCommitDaysAgo: 10,
        license: 'MIT'
      },
      {
        type: 'paper',
        url: 'https://arxiv.org/abs/1234.5678',
        title: 'Mock Paper'
      },
      {
        type: 'github',
        url: 'https://github.com/bad/repo',
        title: 'Bad Repo',
        stars: 5,
        lastCommitDaysAgo: 400,
        license: 'GPL'
      }
    ];
  }
}
