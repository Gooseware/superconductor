import { extractFencedBlock } from './extract-fenced-block.js';
import { ReviewFinding } from './aggregate-findings.js';

export class EarlyAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EarlyAbortError';
  }
}

export interface StreamingReviewOptions {
  url: string;
  payload: any;
  headers?: Record<string, string>;
  abortController?: AbortController;
}

export async function invokeReviewerStream(
  options: StreamingReviewOptions
): Promise<string> {
  const { url, payload, headers = {}, abortController = new AbortController() } = options;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...headers
    },
    body: JSON.stringify(payload),
    signal: abortController.signal
  });

  if (!response.ok || !response.body) {
    throw new Error(`Reviewer request failed: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let insideFindingsBlock = false;
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Basic SSE parsing: extract data payloads
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          
          try {
            const data = JSON.parse(dataStr);
            const content = data?.choices?.[0]?.delta?.content || data?.content || '';
            fullText += content;

            // Check if we entered the findings block
            const markerIndex = fullText.indexOf('```json:review-findings');
            if (markerIndex !== -1) {
              insideFindingsBlock = true;
            }

            if (insideFindingsBlock) {
              // Quick check for critical severity
              const findingsContent = fullText.slice(markerIndex);
              if (/["']severity["']\s*:\s*["']critical["']/i.test(findingsContent)) {
                abortController.abort();
                throw new EarlyAbortError('Critical vulnerability detected during streaming');
              }
            }
          } catch (e) {
            if (e instanceof EarlyAbortError) {
              throw e;
            }
            // Ignore incomplete JSON chunks from SSE
          }
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError' || err instanceof EarlyAbortError) {
      throw err; // Re-throw EarlyAbortError or standard AbortError
    }
    throw err;
  }

  return fullText;
}
