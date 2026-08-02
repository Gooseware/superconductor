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
            parsedResults = this.parseRawTextResults(rawResults);
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
  private parseRawTextResults(text: string): ResearchSource[] {
    const sources: ResearchSource[] = [];
    const extractedUrls = new Set<string>();

    const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    let match;
    while ((match = markdownLinkRegex.exec(text)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      extractedUrls.add(url);
      const source = this.createSourceFromUrl(url, title, text);
      if (source) {
        sources.push(source);
      }
    }

    const rawUrlRegex = /(https?:\/\/[^\s\)<>"]+)/g;
    while ((match = rawUrlRegex.exec(text)) !== null) {
      const url = match[1].replace(/[.,;!?]$/, '').trim();
      if (!extractedUrls.has(url)) {
        extractedUrls.add(url);
        const source = this.createSourceFromUrl(url, '', text);
        if (source) {
          sources.push(source);
        }
      }
    }

    if (sources.length === 0) {
      sources.push({ type: 'unknown', url: 'unknown', content: text });
    }

    return sources;
  }

  private createSourceFromUrl(urlStr: string, title: string, fullText: string): ResearchSource | null {
    try {
      const parsedUrl = new URL(urlStr);
      const host = parsedUrl.hostname.toLowerCase();

      if (host === 'github.com' || host === 'www.github.com') {
        return {
          type: 'community',
          url: urlStr,
          title: title || 'GitHub Repository',
          content: fullText
        };
      }

      const paperDomains = ['arxiv.org', 'aclweb.org', 'nips.cc', 'neurips.cc', 'openreview.net'];
      if (paperDomains.some((d) => host === d || host.endsWith('.' + d))) {
        return {
          type: 'paper',
          url: urlStr,
          title: title || 'Research Paper',
          content: fullText
        };
      }

      const communityDomains = ['stackoverflow.com', 'developer.mozilla.org', 'docs.github.com', 'docs.docker.com'];
      if (communityDomains.some((d) => host === d || host.endsWith('.' + d))) {
        return {
          type: 'community',
          url: urlStr,
          title: title || 'Community Article',
          content: fullText
        };
      }

      return {
        type: 'unknown',
        url: urlStr,
        title: title || '',
        content: fullText
      };
    } catch {
      return null;
    }
  }
}
