import { describe, it, expect, vi } from 'vitest';
import { invokeReviewerStream, EarlyAbortError } from '../src/review/streaming-client.js';

describe('invokeReviewerStream', () => {
  it('should stream the response completely if no critical vulnerability is found', async () => {
    const ssePayload = [
      'data: {"content": "```json:review-findings\\n[\\n"}\n\n',
      'data: {"content": "  { \\"severity\\": \\"low\\", \\"description\\": \\"ok\\" }\\n"}\n\n',
      'data: {"content": "]\\n```\\n"}\n\n',
      'data: [DONE]\n\n'
    ];

    const encoder = new TextEncoder();
    let index = 0;
    
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (index < ssePayload.length) {
          return Promise.resolve({ done: false, value: encoder.encode(ssePayload[index++]) });
        }
        return Promise.resolve({ done: true });
      })
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader
      }
    } as unknown as Response);

    const abortController = new AbortController();
    const result = await invokeReviewerStream({
      url: 'http://test',
      payload: {},
      abortController
    });

    expect(result).toContain('review-findings');
    expect(result).toContain('"severity": "low"');
    expect(abortController.signal.aborted).toBe(false);
  });

  it('should abort early if a critical vulnerability is detected', async () => {
    const ssePayload = [
      'data: {"content": "```json:review-findings\\n[\\n"}\n\n',
      'data: {"content": "  { \\"severity\\": \\"critical\\" "}\n\n', // This should trigger the abort
      'data: {"content": ", \\"description\\": \\"bad\\" }\\n"}\n\n'
    ];

    const encoder = new TextEncoder();
    let index = 0;
    
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (index < ssePayload.length) {
          return Promise.resolve({ done: false, value: encoder.encode(ssePayload[index++]) });
        }
        return Promise.resolve({ done: true });
      })
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader
      }
    } as unknown as Response);

    const abortController = new AbortController();

    await expect(invokeReviewerStream({
      url: 'http://test',
      payload: {},
      abortController
    })).rejects.toThrowError(EarlyAbortError);

    expect(abortController.signal.aborted).toBe(true);
  });
});
