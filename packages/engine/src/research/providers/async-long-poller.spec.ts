import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsyncLongPoller } from './async-long-poller.js';

describe('AsyncLongPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normal completion returns result', async () => {
    const poller = new AsyncLongPoller<string>({ pollIntervalMs: 10, maxWaitMs: 1000 });
    const fn = vi.fn().mockResolvedValue('success');
    
    const promise = poller.poll(fn);
    await vi.runAllTimersAsync();
    
    expect(await promise).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('Timeout exceeded -> rejects', async () => {
    const poller = new AsyncLongPoller<string>({ pollIntervalMs: 10, maxWaitMs: 100 });
    const fn = vi.fn().mockRejectedValue(new Error('not ready'));
    
    const promise = poller.poll(fn);
    promise.catch(() => {}); // prevent unhandled rejection warning
    
    await vi.runAllTimersAsync();
    
    await expect(promise).rejects.toThrow('Timeout exceeded');
  });

  it('429 with Retry-After: 30 suspends 30s then resumes', async () => {
    const poller = new AsyncLongPoller<string>({ pollIntervalMs: 10, maxWaitMs: 40000 });
    const error429 = new Error('Rate limited') as any;
    error429.status = 429;
    error429.headers = { 'Retry-After': '30' };
    
    const fn = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce('success');
    
    const promise = poller.poll(fn);
    
    // Advance slightly, it should throw 429 and start sleeping for 30s
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
    
    // Advance 30s
    await vi.advanceTimersByTimeAsync(30000);
    
    expect(await promise).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('Exponential backoff applied between polls', async () => {
    const poller = new AsyncLongPoller<string>({ pollIntervalMs: 10, maxWaitMs: 10000 });
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValueOnce('success');
    
    const promise = poller.poll(fn);
    
    // 1st failure, sleep for 10 * 2^0 + jitter (10 to 110 ms)
    await vi.advanceTimersByTimeAsync(150);
    
    // 2nd failure, sleep for 10 * 2^1 + jitter (20 to 120 ms)
    await vi.advanceTimersByTimeAsync(150);
    
    expect(await promise).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
