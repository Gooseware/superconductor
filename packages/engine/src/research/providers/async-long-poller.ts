export class AsyncLongPoller {
  private pollIntervalMs: number;
  private maxWaitMs: number;

  constructor(options: { pollIntervalMs?: number; maxWaitMs?: number } = {}) {
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    this.maxWaitMs = options.maxWaitMs || 30000;
  }

  async poll<T>(
    operation: () => Promise<{ status: 'done' | 'pending'; result?: T; retryAfter?: number }>,
    startTime: number = Date.now(),
    attempt: number = 0
  ): Promise<T> {
    if (Date.now() - startTime > this.maxWaitMs) {
      throw new Error('Timeout exceeded');
    }

    let response;
    try {
      response = await operation();
    } catch (e: any) {
      if (e.status === 429 && e.headers && e.headers.get) {
        const retryAfter = e.headers.get('Retry-After');
        if (retryAfter) {
          const delay = parseInt(retryAfter, 10) * 1000;
          if (Date.now() - startTime + delay > this.maxWaitMs) {
            throw new Error('Timeout exceeded');
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.poll(operation, startTime, attempt + 1);
        }
      }
      throw e;
    }

    if (response.status === 'done') {
      return response.result as T;
    }

    const baseDelay = response.retryAfter ? response.retryAfter * 1000 : this.pollIntervalMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.2 * baseDelay; // 20% jitter
    const delay = baseDelay + jitter;
    
    if (Date.now() - startTime + delay > this.maxWaitMs) {
      throw new Error('Timeout exceeded');
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    return this.poll(operation, startTime, attempt + 1);
  }
}
