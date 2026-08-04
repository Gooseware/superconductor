export class AsyncLongPoller<T = any> {
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

    let delay: number = 0;
    let response;
    try {
      response = await operation();
    } catch (e: any) {
      let is429 = false;
      if (e && e.status === 429) {
        is429 = true;
        const retryAfter = e.headers ? (typeof e.headers.get === 'function' ? e.headers.get('Retry-After') : e.headers['Retry-After']) : null;
        if (retryAfter) {
          let parsedDelay = parseInt(retryAfter, 10) * 1000;
          if (isNaN(parsedDelay)) {
            delay = this.pollIntervalMs * Math.pow(2, attempt);
          } else {
            delay = parsedDelay;
          }
        } else {
          delay = this.pollIntervalMs * Math.pow(2, attempt);
        }
      } else {
        const isTransient = e && (
          e.status >= 500 ||
          e.code === 'ECONNRESET' ||
          e.code === 'ETIMEDOUT' ||
          e.code === 'ECONNREFUSED' ||
          e.code === 'ENOTFOUND' ||
          (e.name === 'TypeError' && e.message === 'fetch failed')
        );
        if (isTransient) {
          delay = this.pollIntervalMs * Math.pow(2, attempt);
        } else {
          throw e;
        }
      }
      
      const jitter = Math.random() * 0.2 * delay;
      delay += jitter;
      
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed + delay > this.maxWaitMs) {
        throw new Error('Timeout exceeded');
      }
      
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.poll(operation, startTime, attempt + 1);
    }

    if (response && response.status === 'done') {
      return response.result as T;
    }

    let baseDelay = (response && response.retryAfter) ? response.retryAfter * 1000 : this.pollIntervalMs * Math.pow(2, attempt);
    if (isNaN(baseDelay)) {
      baseDelay = this.pollIntervalMs * Math.pow(2, attempt);
    }
    const jitter = Math.random() * 0.2 * baseDelay; // 20% jitter
    delay = baseDelay + jitter;
    
    const timeElapsed = Date.now() - startTime;
    if (timeElapsed + delay > this.maxWaitMs) {
      throw new Error('Timeout exceeded');
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    return this.poll(operation, startTime, attempt + 1);
  }
}
