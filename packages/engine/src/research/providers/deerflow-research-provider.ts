import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';
import { ResearchProviderUnavailableError } from '../errors/research-provider-unavailable-error.js';
import { sanitizeUntrustedText } from '@superconductor/core';

export interface DeerflowResearchProviderOptions {
  mode?: 'pro' | 'ultra' | 'standard' | 'flash';
  endpoint?: string; // default: 'http://127.0.0.1:2026'
  executeTool?: (toolName: string, params: Record<string, unknown>) => Promise<unknown>;
  fetchFn?: typeof fetch;
  allowedHosts?: string[];
  allowRemoteEndpoints?: boolean;
}

function cleanAndSanitize(text: string): string {
  if (typeof text !== 'string') return '';
  const stripped = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitizeUntrustedText(stripped);
}

function extractText(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (!raw || typeof raw !== 'object') {
    return '';
  }
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.content)) {
    const textPieces = obj.content
      .map((item: unknown) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof (item as any).text === 'string') {
          return (item as any).text;
        }
        return '';
      })
      .filter(Boolean);
    if (textPieces.length > 0) {
      return textPieces.join('\n');
    }
  }
  if (typeof obj.report === 'string') return obj.report;
  if (typeof obj.result === 'string') return obj.result;
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.response === 'string') return obj.response;
  if (typeof obj.message === 'string') return obj.message;
  return JSON.stringify(raw);
}

function extractSnippet(text: string, matchIndex: number, matchLength: number): string {
  const before = text.slice(0, matchIndex);
  const after = text.slice(matchIndex + matchLength);

  const lineStart = before.lastIndexOf('\n');
  const lineEnd = after.indexOf('\n');

  const paraStart = before.lastIndexOf('\n\n');
  const paraEnd = after.indexOf('\n\n');

  const line = text.slice(
    lineStart === -1 ? 0 : lineStart + 1,
    lineEnd === -1 ? text.length : matchIndex + matchLength + lineEnd
  ).trim();

  if (line.length > 40) {
    return line;
  }

  const paragraph = text.slice(
    paraStart === -1 ? 0 : paraStart + 2,
    paraEnd === -1 ? text.length : matchIndex + matchLength + paraEnd
  ).trim();

  return paragraph || line || text.trim();
}

export class DeerflowResearchProvider implements IResearchProvider {
  public readonly options: DeerflowResearchProviderOptions;
  public readonly endpoint: string;
  private readonly executeTool?: (toolName: string, params: Record<string, unknown>) => Promise<unknown>;
  private readonly fetchFn?: typeof fetch;

  constructor(
    options?: DeerflowResearchProviderOptions,
    executeTool?: ((toolName: string, params: Record<string, unknown>) => Promise<unknown>) | any
  ) {
    this.options = options || {};
    this.endpoint = (this.options.endpoint || 'http://127.0.0.1:2026').replace(/\/+$/, '');
    this.validateEndpoint(this.endpoint);

    const tool = executeTool || this.options.executeTool;
    if (typeof tool === 'function') {
      this.executeTool = tool;
    } else if (tool && typeof tool.execute === 'function') {
      this.executeTool = tool.execute.bind(tool);
    }

    this.fetchFn = this.options.fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined);
  }

  private validateEndpoint(endpoint: string): void {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new ResearchProviderUnavailableError(
        `Unauthorized or invalid DeerFlow endpoint host: ${endpoint}`
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ResearchProviderUnavailableError(
        `Unauthorized or invalid DeerFlow endpoint host: ${endpoint}`
      );
    }

    const hostname = parsed.hostname;
    const isLocal = hostname === '127.0.0.1' || hostname === 'localhost';
    const isAllowedHost = Array.isArray(this.options.allowedHosts) &&
      (this.options.allowedHosts.includes(hostname) || this.options.allowedHosts.includes(parsed.host));
    const allowRemote = Boolean(this.options.allowRemoteEndpoints);

    if (!isLocal && !isAllowedHost && !allowRemote) {
      throw new ResearchProviderUnavailableError(
        `Unauthorized or invalid DeerFlow endpoint host: ${hostname}`
      );
    }
  }

  public async search(query: IResearchQuery): Promise<IResearchSource[]> {
    let reportText = '';

    if (this.executeTool) {
      try {
        const rawResult = await this.executeTool('deerflow_research', {
          topic: query.term,
          mode: this.options.mode || 'pro'
        });
        reportText = extractText(rawResult);
      } catch (err: any) {
        if (err instanceof ResearchProviderUnavailableError) {
          throw err;
        }
        throw new ResearchProviderUnavailableError(
          `DeerFlow provider unavailable: ${err?.message || String(err)}`
        );
      }
    } else {
      if (!this.fetchFn) {
        throw new ResearchProviderUnavailableError(
          'DeerFlow provider unavailable: No fetch function or executeTool available'
        );
      }
      try {
        const res = await this.fetchFn(`${this.endpoint}/api/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: query.term,
            mode: this.options.mode || 'pro'
          })
        });

        if (!res.ok) {
          throw new ResearchProviderUnavailableError(
            `DeerFlow HTTP error: ${res.status} ${res.statusText}`
          );
        }

        const rawText = await res.text();
        try {
          const parsed = JSON.parse(rawText);
          reportText = extractText(parsed);
        } catch {
          reportText = rawText;
        }
      } catch (err: any) {
        if (err instanceof ResearchProviderUnavailableError) {
          throw err;
        }
        throw new ResearchProviderUnavailableError(
          `DeerFlow provider unavailable: ${err?.message || String(err)}`
        );
      }
    }

    return this.parseReport(reportText, query.term);
  }

  public async chat(threadId: string, message: string, mode?: string): Promise<string> {
    const selectedMode = mode || this.options.mode || 'pro';

    if (this.executeTool) {
      try {
        const rawResult = await this.executeTool('deerflow_chat', {
          thread_id: threadId,
          threadId,
          message,
          mode: selectedMode
        });
        return extractText(rawResult);
      } catch (err: any) {
        if (err instanceof ResearchProviderUnavailableError) {
          throw err;
        }
        throw new ResearchProviderUnavailableError(
          `DeerFlow provider unavailable: ${err?.message || String(err)}`
        );
      }
    }

    if (!this.fetchFn) {
      throw new ResearchProviderUnavailableError(
        'DeerFlow provider unavailable: No fetch function or executeTool available'
      );
    }

    try {
      const res = await this.fetchFn(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          threadId,
          message,
          mode: selectedMode
        })
      });

      if (!res.ok) {
        throw new ResearchProviderUnavailableError(
          `DeerFlow HTTP error: ${res.status} ${res.statusText}`
        );
      }

      const rawText = await res.text();
      try {
        const parsed = JSON.parse(rawText);
        return extractText(parsed);
      } catch {
        return rawText;
      }
    } catch (err: any) {
      if (err instanceof ResearchProviderUnavailableError) {
        throw err;
      }
      throw new ResearchProviderUnavailableError(
        `DeerFlow provider unavailable: ${err?.message || String(err)}`
      );
    }
  }

  private parseReport(reportText: string, queryTerm: string): IResearchSource[] {
    const sources: IResearchSource[] = [];
    const linkRegex = /\[(?:citation:)?([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;

    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(reportText)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const matchIndex = match.index;
      const matchLength = match[0].length;
      const content = extractSnippet(reportText, matchIndex, matchLength);

      sources.push({
        url: cleanAndSanitize(url),
        title: cleanAndSanitize(title),
        content: cleanAndSanitize(content),
        type: 'deerflow-research'
      });
    }

    if (sources.length === 0) {
      return [
        {
          url: 'deerflow://report',
          title: cleanAndSanitize(queryTerm),
          content: cleanAndSanitize(reportText),
          type: 'deerflow-research'
        }
      ];
    }

    return sources;
  }
}
