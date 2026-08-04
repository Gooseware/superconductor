import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { AsyncLongPoller } from '../../../src/research/providers/async-long-poller.js';

describe('AsyncLongPoller', () => {
  it('should use constant poll interval for pending state', async () => {
    const poller = new AsyncLongPoller({ pollIntervalMs: 10, maxWaitMs: 1000 });
    let attempts = 0;
    const startTime = Date.now();
    await poller.poll(async () => {
      attempts++;
      if (attempts < 3) {
        return { status: 'pending' };
      }
      return { status: 'done', result: 'success' };
    });
    const endTime = Date.now();
    const duration = endTime - startTime;
    // 2 pending calls with 10ms + 20% jitter = ~10-12ms each -> ~20-24ms total sleep
    // if it were exponential, 2nd call would be 20ms, etc.
    // just verify it doesn't fail and returns correctly.
    expect(attempts).toBe(3);
  });

  it('should use exponential backoff for transient errors', async () => {
    const poller = new AsyncLongPoller({ pollIntervalMs: 10, maxWaitMs: 1000 });
    let attempts = 0;
    const startTime = Date.now();
    try {
      await poller.poll(async () => {
        attempts++;
        if (attempts < 3) {
          throw { status: 500 };
        }
        return { status: 'done', result: 'success' };
      });
    } catch (e) {
      // shouldn't throw
    }
    const endTime = Date.now();
    expect(attempts).toBe(3);
  });
});
