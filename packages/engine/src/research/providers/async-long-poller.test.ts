import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsyncLongPoller } from './async-long-poller.js';

describe('AsyncLongPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normal completion returns result', async () => {
    const poller = new AsyncLongPoller();
    const operation = vi.fn()
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'done', result: 'success' });

    const promise = poller.poll(operation);
    
    await vi.runAllTimersAsync();
    
    const result = await promise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('Timeout exceeded -> rejects', async () => {
    const poller = new AsyncLongPoller({ maxWaitMs: 1500, pollIntervalMs: 1000 });
    const operation = vi.fn().mockResolvedValue({ status: 'pending' });

    const promise = poller.poll(operation);
    
    // We start the timers but we also need to await the promise expectation
    const timerPromise = vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('Timeout exceeded');
    await timerPromise;
  });

  it('429 with Retry-After: 30 suspends 30s then resumes', async () => {
    const poller = new AsyncLongPoller({ maxWaitMs: 40000 });
    const operation = vi.fn()
      .mockRejectedValueOnce({
        status: 429,
        headers: { get: (key: string) => key === 'Retry-After' ? '30' : null }
      })
      .mockResolvedValueOnce({ status: 'done', result: 'recovered' });

    const promise = poller.poll(operation);
    
    const timerPromise = vi.advanceTimersByTimeAsync(30000);
    const result = await promise;
    await timerPromise;
    
    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('Exponential backoff applied between polls', async () => {
    const poller = new AsyncLongPoller({ pollIntervalMs: 1000, maxWaitMs: 10000 });
    const operation = vi.fn()
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'done', result: 'done' });

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const promise = poller.poll(operation);
    
    const timerPromise = vi.runAllTimersAsync();
    await promise;
    await timerPromise;
    
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
    const delay1 = (setTimeoutSpy.mock.calls[0][1] as number);
    const delay2 = (setTimeoutSpy.mock.calls[1][1] as number);
    
    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay1).toBeLessThanOrEqual(1200);
    expect(delay2).toBeGreaterThanOrEqual(2000);
    expect(delay2).toBeLessThanOrEqual(2400);
  });
});
